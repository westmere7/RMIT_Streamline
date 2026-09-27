import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { planRework, type HistoryChange } from "@/data/seed/seed-rework";
import { buildFacts } from "@/features/dashboard/analytics";
import { sentBack } from "@/features/dashboard/flow";
import { resolvePeriod } from "@/features/dashboard/metrics";
import { loadDashboardSnapshot } from "@/services/dashboard-service";

const change = (itemId: string, at: string, from: string, to: string): HistoryChange => ({
  itemId,
  boardId: "b",
  workspaceId: "w",
  actorId: "u",
  at,
  metadata: { itemName: itemId, columnName: "Status", columnType: "STATUS", from, to },
});

/** Two hundred tasks, each started and then done three days later. */
const history: HistoryChange[] = Array.from({ length: 200 }, (_, i) => [
  change(`t${i}`, "2026-05-04T09:00:00.000Z", "Not Started", "In Progress"),
  change(`t${i}`, "2026-05-07T16:00:00.000Z", "In Progress", "Done"),
]).flat();

describe("rework in the demo history", () => {
  it("sends back about the share asked for, the same tasks every run", () => {
    const first = planRework(history, 0.3);
    const tasks = new Set(first.map((c) => c.itemId));
    expect(tasks.size).toBeGreaterThan(40);
    expect(tasks.size).toBeLessThan(80);
    expect(planRework(history, 0.3)).toEqual(first);
  });

  it("puts the return before the final Done, which stays where it was", () => {
    for (const added of planRework(history, 0.3)) {
      expect(added.at > "2026-05-04T09:00:00.000Z").toBe(true);
      expect(added.at < "2026-05-07T16:00:00.000Z").toBe(true);
      expect(["In Review", "Done", "In Progress"]).toContain(added.metadata.to);
    }
  });

  it("adds nothing on a second run", () => {
    const once = [...history, ...planRework(history, 0.3)];
    expect(planRework(once, 0.3)).toEqual([]);
  });

  it("measures from when the task was made when Done is its only recorded change", () => {
    const single = Array.from({ length: 50 }, (_, i) => change(`single${i}`, "2026-05-07T16:00:00.000Z", "In Progress", "Done"));
    expect(planRework(single, 1)).toEqual([]);
    const made = new Map(single.map((c) => [c.itemId, "2026-05-01T09:00:00.000Z"]));
    const added = planRework(single, 1, made);
    expect(added).toHaveLength(100);
    for (const c of added) expect(c.at > "2026-05-01T09:00:00.000Z" && c.at < "2026-05-07T16:00:00.000Z").toBe(true);
  });

  it("leaves open work, and work that went straight from Not Started to Done, alone", () => {
    const open = [change("o", "2026-05-04T09:00:00.000Z", "Not Started", "In Progress")];
    const straight = [change("s", "2026-05-04T09:00:00.000Z", "Waiting", "Not Started"), change("s", "2026-05-07T09:00:00.000Z", "Not Started", "Done")];
    expect(planRework([...open, ...straight], 1)).toEqual([]);
  });

  it("gives the local demo a sent-back rate worth reading", async () => {
    const repos = createLocalRepositories({ databaseName: `rework-${Date.now()}` });
    const boards = await repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    const facts = buildFacts(await loadDashboardSnapshot(repos, SEED_WORKSPACE_ID, boards));
    const today = new Date().toISOString().slice(0, 10);
    const period = resolvePeriod({ mode: "ytd", year: Number(today.slice(0, 4)), quarter: 1, month: 1, from: null, to: null, comparisonYear: Number(today.slice(0, 4)) - 1 }, today);
    const figure = sentBack(facts, period, null);
    expect(figure.value).toBeGreaterThan(12);
    expect(figure.value).toBeLessThan(40);
  });
});
