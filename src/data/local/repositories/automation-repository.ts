import type {
  AutomationEvent,
  AutomationRule,
  AutomationRuleInput,
  AutomationRulePatch,
  AutomationRun,
  AutomationRunInput,
  EntityId,
} from "@/domain";
import { TRIGGER_TIMING } from "@/domain";
import type { AutomationRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

/**
 * Automations in the local provider.
 *
 * The Supabase side gets its queue filled by database triggers, which is the
 * whole point of the feature — a rule that fires with nobody watching. There
 * are no triggers in IndexedDB, so here the queue is filled by
 * `LocalItemRepository` calling `raise()` as it writes. That is a weaker
 * guarantee and it is the right one for what this provider is: the offline demo
 * and the test double, where every write goes through the repositories anyway
 * and there is no second process to miss.
 */
export class LocalAutomationRepository implements AutomationRepository {
  constructor(private readonly conn: LocalConnection) {}

  // ---- Rules ---------------------------------------------------------------

  async listRulesByBoard(boardId: EntityId): Promise<AutomationRule[]> {
    const db = await this.conn.getDb();
    const rules = await db.getAllFromIndex("automationRules", "byBoard", boardId);
    return rules.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listRulesByWorkspace(workspaceId: EntityId): Promise<AutomationRule[]> {
    const db = await this.conn.getDb();
    const rules = await db.getAllFromIndex("automationRules", "byWorkspace", workspaceId);
    return rules.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getRule(id: EntityId): Promise<AutomationRule | null> {
    const db = await this.conn.getDb();
    return (await db.get("automationRules", id)) ?? null;
  }

  async createRule(input: AutomationRuleInput): Promise<AutomationRule> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const rule: AutomationRule = { ...input, id: newId(), createdAt: now, updatedAt: now, lastRunAt: null, runCount: 0, lastError: null };
    await db.put("automationRules", rule);
    return rule;
  }

  async updateRule(id: EntityId, patch: AutomationRulePatch): Promise<AutomationRule> {
    const db = await this.conn.getDb();
    const existing = await db.get("automationRules", id);
    if (!existing) throw new NotFoundError("AutomationRule", id);
    const updated: AutomationRule = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("automationRules", updated);
    return updated;
  }

  async deleteRule(id: EntityId): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("automationRules", id);
  }

  async recordRuleOutcome(id: EntityId, outcome: { lastRunAt: string | null; ranCount: number; lastError: string | null }): Promise<void> {
    const db = await this.conn.getDb();
    const existing = await db.get("automationRules", id);
    if (!existing) return;
    await db.put("automationRules", {
      ...existing,
      lastRunAt: outcome.lastRunAt ?? existing.lastRunAt,
      runCount: existing.runCount + outcome.ranCount,
      lastError: outcome.lastError,
    });
  }

  async listScheduledRules(): Promise<AutomationRule[]> {
    const db = await this.conn.getDb();
    const rules = await db.getAll("automationRules");
    return rules.filter((r) => r.enabled && TRIGGER_TIMING[r.trigger.kind] === "schedule");
  }

  // ---- The queue -----------------------------------------------------------

  /**
   * Adds an event to the queue, the way the Supabase triggers do.
   *
   * Local-only, so it is not on the shared interface: the runner never calls
   * it, and the Supabase repository would be wrong to offer it — writing an
   * event by hand there would be forging a record of something the database
   * never saw.
   */
  async raise(input: Omit<AutomationEvent, "id" | "createdAt" | "processedAt" | "attempts" | "error">): Promise<void> {
    const db = await this.conn.getDb();
    const rules = await db.getAllFromIndex("automationRules", "byBoard", input.boardId);
    // The same short-circuit the SQL trigger makes: a board with no live rule
    // is the common case and should cost nothing.
    if (!rules.some((r) => r.enabled && TRIGGER_TIMING[r.trigger.kind] === "event")) return;
    const mark = await db.get("automationMarks", input.itemId ?? "");
    const depth = mark && mark.expiresAt > nowIso() ? mark.depth + 1 : input.depth;
    const event: AutomationEvent = { ...input, depth, id: newId(), createdAt: nowIso(), processedAt: null, attempts: 0, error: null };
    await db.put("automationEvents", event);
  }

  async claimEvents(limit: number): Promise<AutomationEvent[]> {
    const db = await this.conn.getDb();
    const all = await db.getAll("automationEvents");
    return all
      .filter((e) => e.processedAt === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }

  async finishEvent(id: string, outcome: { error?: string | null }): Promise<void> {
    const db = await this.conn.getDb();
    const existing = await db.get("automationEvents", id);
    if (!existing) return;
    await db.put("automationEvents", { ...existing, processedAt: nowIso(), attempts: existing.attempts + 1, error: outcome.error ?? null });
  }

  async listRecentEvents(boardId: EntityId, limit: number): Promise<AutomationEvent[]> {
    const db = await this.conn.getDb();
    const events = await db.getAllFromIndex("automationEvents", "byBoard", boardId);
    return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async markDepth(itemId: EntityId, depth: number): Promise<void> {
    const db = await this.conn.getDb();
    await db.put("automationMarks", { itemId, depth, expiresAt: new Date(Date.now() + 120_000).toISOString() });
  }

  async clearMark(itemId: EntityId): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("automationMarks", itemId);
  }

  async claimScheduleFire(ruleId: EntityId, itemId: EntityId | null, fireKey: string): Promise<boolean> {
    const db = await this.conn.getDb();
    const id = `${ruleId}:${itemId ?? "-"}:${fireKey}`;
    if (await db.get("automationScheduleFires", id)) return false;
    await db.put("automationScheduleFires", { id, ruleId, itemId, fireKey, createdAt: nowIso() });
    return true;
  }

  // ---- The log -------------------------------------------------------------

  async listRuns(boardId: EntityId, limit: number): Promise<AutomationRun[]> {
    const db = await this.conn.getDb();
    const runs = await db.getAllFromIndex("automationRuns", "byBoard", boardId);
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async listRunsByRule(ruleId: EntityId, limit: number): Promise<AutomationRun[]> {
    const db = await this.conn.getDb();
    const runs = await db.getAllFromIndex("automationRuns", "byRule", ruleId);
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async recordRuns(inputs: AutomationRunInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const db = await this.conn.getDb();
    const tx = db.transaction("automationRuns", "readwrite");
    const now = nowIso();
    await Promise.all(inputs.map((input) => tx.store.put({ ...input, id: newId(), createdAt: now })));
    await tx.done;
  }

  async sweep(keepDays: number): Promise<number> {
    const db = await this.conn.getDb();
    // Inclusive, so "keep nothing" keeps nothing. Postgres gets this for free —
    // `now()` there is the transaction's start, always later than a row written
    // by an earlier one — but here the whole thing can happen inside a
    // millisecond and a strict comparison would leave the row it was asked to
    // take.
    const cutoff = new Date(Date.now() - keepDays * 86_400_000).toISOString();
    let removed = 0;
    for (const event of await db.getAll("automationEvents")) {
      if (event.processedAt && event.processedAt <= cutoff) {
        await db.delete("automationEvents", event.id);
        removed += 1;
      }
    }
    for (const run of await db.getAll("automationRuns")) {
      if (run.createdAt <= cutoff) {
        await db.delete("automationRuns", run.id);
        removed += 1;
      }
    }
    const now = nowIso();
    for (const mark of await db.getAll("automationMarks")) {
      if (mark.expiresAt < now) await db.delete("automationMarks", mark.itemId);
    }
    return removed;
  }
}
