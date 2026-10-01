import { describe, expect, it } from "vitest";
import { normaliseWorkTypes, renameWorkTypeAssets, workTypesOf } from "@/domain";
import type { AssetFact } from "@/features/dashboard/analytics";
import { workTypeContributors, workTypeProfile } from "@/features/dashboard/work-types";

const kinds = normaliseWorkTypes({
  workTypes: [
    { id: "d", name: "Design", color: "blue" },
    { id: "v", name: "Video", color: "orange" },
    { id: "w", name: "Writing", color: "teal" },
  ],
  // One stored as a single id, as the first save did; one in two work types.
  assets: { "Static Designs": "d", "GIF / Motion": ["d", "v"], Articles: ["w", "gone"] },
});

const line = (over: Partial<AssetFact>): AssetFact => ({ id: Math.random().toString(36), taskId: "t1", team: { id: "x", name: "X", color: "gray" }, boardId: "b", type: "Static Designs", units: 1, done: false, completedAt: null, dueDate: null, createdAt: "2026-01-01", taskDueDate: null, assignees: [], ...over });

describe("work types", () => {
  it("reads one id or several, drops unknown ones, and matches types without regard to case", () => {
    expect(kinds.assets).toEqual({ "Static Designs": ["d"], "GIF / Motion": ["d", "v"], Articles: ["w"] });
    expect(workTypesOf(kinds, "gif / motion").map((w) => w.name)).toEqual(["Design", "Video"]);
    expect(workTypesOf(kinds, "Podcast")).toEqual([]);
    expect(renameWorkTypeAssets(kinds, { Articles: "Long reads" }).assets["Long reads"]).toEqual(["w"]);
  });

  it("counts a line in every work type its type belongs to, and keeps the rest apart", () => {
    const assets = [
      line({ type: "Static Designs", units: 3, done: true, assignees: ["u1"] }),
      line({ type: "GIF / Motion", units: 2, taskId: "t2", assignees: ["u2"] }),
      line({ type: "Podcast", units: 5 }),
    ];
    const profile = workTypeProfile(assets, null, kinds, "assets", {});
    const by = Object.fromEntries(profile.rows.map((r) => [r.workType.name, r]));
    expect(by.Design!.value).toBe(5);
    expect(by.Video!.value).toBe(2);
    expect(by.Writing!.value).toBe(0);
    expect(by.Design!.doneUnits).toBe(3);
    expect(profile.unassignedUnits).toBe(5);
    expect(profile.unassignedTypes).toEqual(["Podcast"]);
    // In tasks, each task once per work type.
    expect(workTypeProfile(assets, null, kinds, "tasks", {}).rows.find((r) => r.workType.id === "d")!.value).toBe(2);
    // One person's profile is the lines they are in charge of.
    expect(workTypeProfile(assets, null, kinds, "assets", {}, "u2").rows.find((r) => r.workType.id === "d")!.value).toBe(2);
    expect(workTypeContributors(assets, kinds).map((c) => c.userId)).toEqual(["u1", "u2"]);
  });
});
