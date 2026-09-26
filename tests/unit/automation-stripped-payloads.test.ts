import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories, type LocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { AutomationEvent, AutomationRuleInput, ColumnValue } from "@/domain";
import { isEmptyValue } from "@/domain";
import { AutomationEngine, wholeValue } from "@/services/automation-engine";
import { createServices, type Services } from "@/services";

/**
 * Automation payloads the way the database sends them.
 *
 * Supabase's capture trigger passes every value change through
 * jsonb_strip_nulls, which drops each null field: a date cleared to nothing
 * arrives as { type: "DATE" }, not { type: "DATE", date: null }. The local
 * provider keeps the field, so the rest of the suite never met that shape —
 * and `column_cleared` never fired on Supabase for a status, date, number or
 * any other type whose "empty" is a null.
 */
const BOARD = SEED_BOARD_IDS.rmitinerary;
let counter = 0;

describe("automation payloads as the database sends them", () => {
  let repos: LocalRepositories;
  let services: Services;

  beforeEach(async () => {
    counter += 1;
    repos = createLocalRepositories({ databaseName: `automation-stripped-${Date.now()}-${counter}` });
    services = createServices(repos);
    // The seed's own writes may have queued events; start from an empty queue.
    for (const event of await repos.automations.claimEvents(1000)) await repos.automations.finishEvent(event.id, {});
  });

  it("reads a field the database dropped as the null it was", () => {
    const stripped = { type: "DATE" } as unknown as ColumnValue;
    // The trap: a missing field is not a null one.
    expect(isEmptyValue(stripped)).toBe(false);
    expect(isEmptyValue(wholeValue(stripped)!)).toBe(true);
    expect(isEmptyValue(wholeValue({ type: "STATUS" } as unknown as ColumnValue)!)).toBe(true);
    expect(wholeValue({ type: "DATE", date: "2026-09-01" })).toEqual({ type: "DATE", date: "2026-09-01" });
    expect(wholeValue(null)).toBeNull();
    expect(wholeValue(undefined)).toBeNull();
  });

  it("fires column_cleared on a date the database reports as cleared", async () => {
    const columns = await repos.boards.listColumns(BOARD);
    const due = columns.find((c) => c.type === "DATE");
    expect(due, "the seed board has a due date").toBeTruthy();
    const item = (await repos.items.listByBoard(BOARD)).find((i) => i.archivedAt === null && i.parentItemId === null);
    expect(item, "the seed board has a task").toBeTruthy();

    const input: AutomationRuleInput = {
      workspaceId: SEED_WORKSPACE_ID,
      boardId: BOARD,
      name: "",
      enabled: true,
      trigger: { kind: "column_cleared", columnId: due!.id },
      conditionMatch: "all",
      conditions: [],
      actions: [{ kind: "add_comment", body: "The due date was cleared." }],
      createdBy: SEED_USER_IDS.danh,
    };
    await services.automations.create(input, { columns, groups: await repos.boards.listGroups(BOARD), users: await repos.users.list() });

    // One event, exactly as Supabase's queue row hands it over.
    let queued: AutomationEvent[] = [
      {
        id: "stripped-1",
        boardId: BOARD,
        itemId: item!.id,
        kind: "value_changed",
        columnId: due!.id,
        actorId: SEED_USER_IDS.danh,
        payload: { before: { type: "DATE", date: "2026-09-01" }, after: { type: "DATE" } as unknown as ColumnValue },
        depth: 0,
        createdAt: new Date("2026-09-21T00:00:00Z").toISOString(),
        processedAt: null,
        attempts: 0,
        error: null,
      },
    ];
    const automations = new Proxy(repos.automations, {
      get(target, prop, receiver) {
        if (prop === "claimEvents") {
          return async () => {
            const batch = queued;
            queued = [];
            return batch;
          };
        }
        if (prop === "finishEvent") return async () => undefined;
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const engine = new AutomationEngine({ ...repos, automations }, services.items, services.comments, services.notifications, {
      timezone: "Australia/Melbourne",
      now: () => new Date("2026-09-21T00:00:00Z"),
    });

    const report = await engine.drain(10);

    expect(report.ran).toBe(1);
    expect((await repos.comments.listByItem(item!.id)).map((c) => c.body)).toContain("The due date was cleared.");
  });
});
