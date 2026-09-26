import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { parseCountdownDuration } from "@/domain";
import { createServices } from "@/services";

/**
 * Regressions from the 26 September 2026 audit
 * (Test_prompts/audits/2026-09-26-full-e2e/FINDINGS.md). Each case names its
 * finding; the ones that need a Supabase database are in NEXT_SESSION.md.
 */
describe("audit regressions, 26 September 2026", () => {
  it("F-132: takes a countdown typed the way its placeholder says it", () => {
    const now = new Date("2026-09-26T09:00:00Z");
    expect(parseCountdownDuration("in 45m", now)?.getTime()).toBe(parseCountdownDuration("45m", now)!.getTime());
    expect(parseCountdownDuration("  In 3d 4h ", now)?.getTime()).toBe(parseCountdownDuration("3d 4h", now)!.getTime());
    // "in" on its own is still nothing, and only a leading "in" is read that way.
    expect(parseCountdownDuration("in", now)).toBeNull();
    expect(parseCountdownDuration("within 45m", now)).toBeNull();
  });

  it("F-135: a board made from a template does not wake its own rules for the tasks it starts with", async () => {
    const services = createServices(createLocalRepositories({ databaseName: `audit-template-order-${Date.now()}` }));
    await services.repos.admin.resetToSeed();
    const source = SEED_BOARD_IDS.rmitinerary;
    await services.repos.automations.createRule({
      workspaceId: SEED_WORKSPACE_ID,
      boardId: source,
      name: "Say hello to every new task",
      enabled: true,
      trigger: { kind: "item_created" },
      conditionMatch: "all",
      conditions: [],
      actions: [{ kind: "add_comment", body: "Hello" }],
      createdBy: SEED_USER_IDS.danh,
    });
    const saved = await services.boardTemplates.saveFromBoard(source, { name: "Tasks and rules", parts: ["groups", "columnSettings", "automations", "tasks"] }, SEED_USER_IDS.danh);
    expect(saved.spec.tasks.length).toBeGreaterThan(0);
    for (const event of await services.repos.automations.claimEvents(1000)) await services.repos.automations.finishEvent(event.id, {});

    const { board } = await services.boardTemplates.createBoard(saved.id, { workspaceId: SEED_WORKSPACE_ID, name: "From the template", teamId: null, visibility: "WORKSPACE" }, SEED_USER_IDS.danh);

    // The rule came across, and the template's own tasks queued nothing for it.
    expect(await services.repos.automations.listRulesByBoard(board.id)).toHaveLength(1);
    const queued = (await services.repos.automations.claimEvents(1000)).filter((event) => event.boardId === board.id);
    expect(queued).toEqual([]);
  });
});
