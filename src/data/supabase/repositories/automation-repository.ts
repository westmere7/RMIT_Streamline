import type {
  AutomationEvent,
  AutomationHeartbeat,
  AutomationRule,
  AutomationRuleInput,
  AutomationRulePatch,
  AutomationRun,
  AutomationRunInput,
} from "@/domain";
import { TRIGGER_TIMING } from "@/domain";
import type { AutomationRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined, toAutomationEvent, toAutomationRule, toAutomationRun, type AutomationEventRow, type AutomationRuleRow, type AutomationRunRow } from "../rows";

const RULE =
  "id, workspace_id, board_id, name, enabled, trigger_json, condition_match, conditions, actions, created_by, created_at, updated_at, last_run_at, run_count, last_error";
const EVENT = "id, board_id, item_id, kind, column_id, actor_id, payload, depth, created_at, claimed_at, processed_at, attempts, error";
const RUN = "id, rule_id, board_id, item_id, status, summary, detail, created_at";

/** The trigger kinds the clock wakes, as a list Postgres can filter on. */
const SCHEDULED_KINDS = Object.entries(TRIGGER_TIMING)
  .filter(([, timing]) => timing === "schedule")
  .map(([kind]) => kind);

/**
 * Automations against Postgres.
 *
 * Two halves with different callers. The rule methods run in the browser under
 * the `automation_rules_*` policies, which let anyone who can see a board read
 * what it does and only a board manager change it. Everything else — claiming
 * events, marking depth, writing the log — runs in the server-side runner under
 * the service key, and the tables it touches have row level security on with no
 * policies at all, so those calls are impossible from a browser rather than
 * merely discouraged.
 */
export class SupabaseAutomationRepository implements AutomationRepository {
  // ---- Rules ---------------------------------------------------------------

  async listRulesByBoard(boardId: string): Promise<AutomationRule[]> {
    const result = await db().from("automation_rules").select(RULE).eq("board_id", boardId).order("created_at", { ascending: true });
    return unwrapList<AutomationRuleRow>(result, "automation_rules.listByBoard").map(toAutomationRule);
  }

  async listRulesByWorkspace(workspaceId: string): Promise<AutomationRule[]> {
    const result = await db().from("automation_rules").select(RULE).eq("workspace_id", workspaceId).order("created_at", { ascending: true });
    return unwrapList<AutomationRuleRow>(result, "automation_rules.listByWorkspace").map(toAutomationRule);
  }

  async getRule(id: string): Promise<AutomationRule | null> {
    const result = await db().from("automation_rules").select(RULE).eq("id", id).maybeSingle();
    const row = unwrapMaybe<AutomationRuleRow>(result, "automation_rules.get");
    return row ? toAutomationRule(row) : null;
  }

  async createRule(input: AutomationRuleInput): Promise<AutomationRule> {
    const result = await db()
      .from("automation_rules")
      .insert({
        workspace_id: input.workspaceId,
        board_id: input.boardId,
        name: input.name,
        enabled: input.enabled,
        trigger_json: input.trigger,
        condition_match: input.conditionMatch,
        conditions: input.conditions,
        actions: input.actions,
        created_by: input.createdBy,
      })
      .select(RULE)
      .single();
    return toAutomationRule(unwrap<AutomationRuleRow>(result, "automation_rules.create"));
  }

  async updateRule(id: string, patch: AutomationRulePatch): Promise<AutomationRule> {
    const result = await db()
      .from("automation_rules")
      .update(
        pruneUndefined({
          name: patch.name,
          enabled: patch.enabled,
          trigger_json: patch.trigger,
          condition_match: patch.conditionMatch,
          conditions: patch.conditions,
          actions: patch.actions,
        }),
      )
      .eq("id", id)
      .select(RULE)
      .single();
    return toAutomationRule(unwrap<AutomationRuleRow>(result, "automation_rules.update"));
  }

  async deleteRule(id: string): Promise<void> {
    assertOk(await db().from("automation_rules").delete().eq("id", id), "automation_rules.delete");
  }

  async recordRuleOutcome(id: string, outcome: { lastRunAt: string | null; ranCount: number; lastError: string | null }): Promise<void> {
    // Read-then-write rather than an atomic increment, because PostgREST has no
    // `set x = x + 1`. Two runners double-counting a rule's tally is the worst
    // this can do, and the tally is a convenience on a list screen.
    const current = await this.getRule(id);
    if (!current) return;
    assertOk(
      await db()
        .from("automation_rules")
        .update({
          last_run_at: outcome.lastRunAt ?? current.lastRunAt,
          run_count: current.runCount + outcome.ranCount,
          last_error: outcome.lastError,
        })
        .eq("id", id),
      "automation_rules.recordOutcome",
    );
  }

  async listScheduledRules(): Promise<AutomationRule[]> {
    const result = await db().from("automation_rules").select(RULE).eq("enabled", true).in("trigger_kind", SCHEDULED_KINDS);
    return unwrapList<AutomationRuleRow>(result, "automation_rules.listScheduled").map(toAutomationRule);
  }

  // ---- The queue -----------------------------------------------------------

  async claimEvents(limit: number): Promise<AutomationEvent[]> {
    // Claiming in two steps: read the oldest waiting ids, then stamp the ones
    // this runner got. The stamp filters on `claimed_at is null` again, so a
    // second runner that read the same ids a moment earlier updates nothing and
    // the rows come back only to whoever won.
    const pending = await db()
      .from("automation_events")
      .select("id")
      .is("processed_at", null)
      .is("claimed_at", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    const ids = unwrapList<{ id: number }>(pending, "automation_events.pending").map((row) => row.id);
    if (ids.length === 0) return [];

    const claimed = await db()
      .from("automation_events")
      .update({ claimed_at: new Date().toISOString() })
      .in("id", ids)
      .is("claimed_at", null)
      .select(EVENT);
    return unwrapList<AutomationEventRow>(claimed, "automation_events.claim").map(toAutomationEvent);
  }

  async finishEvent(id: string, outcome: { error?: string | null }): Promise<void> {
    const numeric = Number(id);
    const current = await db().from("automation_events").select("attempts").eq("id", numeric).maybeSingle();
    const attempts = unwrapMaybe<{ attempts: number }>(current, "automation_events.attempts")?.attempts ?? 0;
    assertOk(
      await db()
        .from("automation_events")
        .update({ processed_at: new Date().toISOString(), attempts: attempts + 1, error: outcome.error ?? null })
        .eq("id", numeric),
      "automation_events.finish",
    );
  }

  async listRecentEvents(boardId: string, limit: number): Promise<AutomationEvent[]> {
    const result = await db().from("automation_events").select(EVENT).eq("board_id", boardId).order("created_at", { ascending: false }).limit(limit);
    return unwrapList<AutomationEventRow>(result, "automation_events.listRecent").map(toAutomationEvent);
  }

  async markDepth(itemId: string, depth: number): Promise<void> {
    assertOk(
      await db()
        .from("automation_marks")
        .upsert({ item_id: itemId, depth, expires_at: new Date(Date.now() + 120_000).toISOString() }, { onConflict: "item_id" }),
      "automation_marks.mark",
    );
  }

  async clearMark(itemId: string): Promise<void> {
    assertOk(await db().from("automation_marks").delete().eq("item_id", itemId), "automation_marks.clear");
  }

  async claimScheduleFire(ruleId: string, itemId: string | null, fireKey: string): Promise<boolean> {
    // The receipt's uniqueness is the database's, so two runners on the same
    // tick produce one firing: the loser's insert violates the key and is read
    // as "somebody already did this".
    const result = await db().from("automation_schedule_fires").insert({ rule_id: ruleId, item_id: itemId, fire_key: fireKey });
    if (!result.error) return true;
    if (result.error.code === "23505") return false;
    assertOk(result, "automation_schedule_fires.claim");
    return false;
  }

  // ---- The log -------------------------------------------------------------

  async listRuns(boardId: string, limit: number): Promise<AutomationRun[]> {
    const result = await db().from("automation_runs").select(RUN).eq("board_id", boardId).order("created_at", { ascending: false }).limit(limit);
    return unwrapList<AutomationRunRow>(result, "automation_runs.listByBoard").map(toAutomationRun);
  }

  async listRunsForBoards(boardIds: string[], limit: number): Promise<AutomationRun[]> {
    if (boardIds.length === 0) return [];
    const result = await db().from("automation_runs").select(RUN).in("board_id", boardIds).order("created_at", { ascending: false }).limit(limit);
    return unwrapList<AutomationRunRow>(result, "automation_runs.listForBoards").map(toAutomationRun);
  }

  async listRunsByRule(ruleId: string, limit: number): Promise<AutomationRun[]> {
    const result = await db().from("automation_runs").select(RUN).eq("rule_id", ruleId).order("created_at", { ascending: false }).limit(limit);
    return unwrapList<AutomationRunRow>(result, "automation_runs.listByRule").map(toAutomationRun);
  }

  async recordRuns(inputs: AutomationRunInput[]): Promise<void> {
    if (inputs.length === 0) return;
    assertOk(
      await db()
        .from("automation_runs")
        .insert(
          inputs.map((input) => ({
            rule_id: input.ruleId,
            board_id: input.boardId,
            item_id: input.itemId,
            status: input.status,
            summary: input.summary,
            detail: input.detail,
          })),
        ),
      "automation_runs.record",
    );
  }

  /**
   * One row that says when the runner last looked at anything.
   *
   * Readable by anybody signed in; written only here, under the service key. It
   * is the only thing in the schema that can tell a board "nothing has driven
   * your automations since yesterday" rather than leaving that indistinguishable
   * from "no rule matched".
   */
  async readHeartbeat(): Promise<AutomationHeartbeat | null> {
    const result = await db().from("automation_heartbeat").select("last_run_at, report").eq("id", true).maybeSingle();
    const row = unwrapMaybe<{ last_run_at: string; report: Partial<AutomationHeartbeat> }>(result, "automation_heartbeat.read");
    if (!row) return null;
    const r = row.report ?? {};
    return { lastRunAt: row.last_run_at, events: r.events ?? 0, scheduled: r.scheduled ?? 0, ran: r.ran ?? 0, skipped: r.skipped ?? 0, failed: r.failed ?? 0 };
  }

  async recordHeartbeat(report: Omit<AutomationHeartbeat, "lastRunAt">): Promise<void> {
    assertOk(
      await db().from("automation_heartbeat").upsert({ id: true, last_run_at: new Date().toISOString(), report }, { onConflict: "id" }),
      "automation_heartbeat.record",
    );
  }

  async sweep(keepDays: number): Promise<number> {
    const result = await db().rpc("automation_sweep", { p_keep_days: keepDays });
    if (result.error) {
      assertOk(result, "automation_sweep");
      return 0;
    }
    return typeof result.data === "number" ? result.data : 0;
  }
}
