import { describe, expect, it } from "vitest";
import type { StakeholderDepartment } from "@/domain";
import { reconcileDepartments } from "@/domain";

let counter = 0;
function department(name: string, position: number, status: StakeholderDepartment["status"] = "ACTIVE"): StakeholderDepartment {
  counter += 1;
  return { id: `d${counter}`, workspaceId: "w1", name, color: "blue", position, status, createdAt: "", updatedAt: "" };
}

const options = (...names: string[]) => names.map((name) => ({ name, color: "blue" as const }));

describe("reconciling departments with the stakeholder list", () => {
  it("creates a department for every group in a workspace that has none", () => {
    const plan = reconcileDepartments([], options("Comm.", "Event"));
    expect(plan.create.map((c) => c.name)).toEqual(["Comm.", "Event"]);
    expect(plan.update).toEqual([]);
    expect(plan.disable).toEqual([]);
  });

  it("leaves an unchanged list alone", () => {
    const existing = [department("Comm.", 0), department("Event", 1)];
    const plan = reconcileDepartments(existing, options("Comm.", "Event"));
    expect(plan).toEqual({ create: [], update: [], disable: [] });
  });

  it("keeps a department's identity through a rename", () => {
    const comm = department("Comm.", 0);
    const plan = reconcileDepartments([comm], options("Communications"), { "Comm.": "Communications" });
    // The same row is renamed: its portal, its link and its requests all stay put.
    expect(plan.update).toEqual([{ id: comm.id, name: "Communications" }]);
    expect(plan.create).toEqual([]);
    expect(plan.disable).toEqual([]);
  });

  it("treats an unannounced swap as a removal and an addition, not a rename", () => {
    const comm = department("Comm.", 0);
    // No rename recorded: the editor did not say these are the same thing, so
    // guessing would hand one department's history to another.
    const plan = reconcileDepartments([comm], options("Communications"));
    expect(plan.disable).toEqual([comm.id]);
    expect(plan.create.map((c) => c.name)).toEqual(["Communications"]);
    expect(plan.update).toEqual([]);
  });

  it("disables a department whose group left the list, and never deletes it", () => {
    const comm = department("Comm.", 0);
    const event = department("Event", 1);
    const plan = reconcileDepartments([comm, event], options("Comm."));
    expect(plan.disable).toEqual([event.id]);
    expect(plan.create).toEqual([]);
  });

  it("gives a re-added name a new department rather than the disabled one's history", () => {
    const gone = department("Event", 1, "DISABLED");
    const plan = reconcileDepartments([department("Comm.", 0), gone], options("Comm.", "Event"));
    expect(plan.create.map((c) => c.name)).toEqual(["Event"]);
    // The old one stays disabled and keeps its requests; nothing reactivates it.
    expect(plan.update.some((u) => u.id === gone.id)).toBe(false);
    expect(plan.disable).toEqual([]);
  });

  it("follows reordering without touching identity", () => {
    const comm = department("Comm.", 0);
    const event = department("Event", 1);
    const plan = reconcileDepartments([comm, event], options("Event", "Comm."));
    expect(plan.update).toEqual([
      { id: event.id, position: 0 },
      { id: comm.id, position: 1 },
    ]);
    expect(plan.create).toEqual([]);
    expect(plan.disable).toEqual([]);
  });

  it("matches names case-insensitively, and stores the spelling that was typed", () => {
    const comm = department("comm.", 0);
    const plan = reconcileDepartments([comm], options("Comm."));
    expect(plan.update).toEqual([{ id: comm.id, name: "Comm." }]);
    expect(plan.create).toEqual([]);
  });

  it("carries a colour change onto the department", () => {
    const comm = department("Comm.", 0);
    const plan = reconcileDepartments([comm], [{ name: "Comm.", color: "red" }]);
    expect(plan.update).toEqual([{ id: comm.id, color: "red" }]);
  });

  it("handles a rename and a new group with the old name in one save", () => {
    // "Comm." becomes "Communications", and a brand-new "Comm." is added. The
    // renamed department must not be re-matched to the newcomer's name.
    const comm = department("Comm.", 0);
    const plan = reconcileDepartments([comm], options("Communications", "Comm."), { "Comm.": "Communications" });
    expect(plan.update).toEqual([{ id: comm.id, name: "Communications" }]);
    expect(plan.create.map((c) => c.name)).toEqual(["Comm."]);
    expect(plan.disable).toEqual([]);
  });

  it("ignores a rename that names a department the workspace does not have", () => {
    const comm = department("Comm.", 0);
    const plan = reconcileDepartments([comm], options("Comm.", "Web"), { Nonsense: "Web" });
    expect(plan.create.map((c) => c.name)).toEqual(["Web"]);
    expect(plan.disable).toEqual([]);
  });

  it("empties the list by disabling everything, keeping every request's provenance", () => {
    const comm = department("Comm.", 0);
    const event = department("Event", 1);
    const plan = reconcileDepartments([comm, event], []);
    expect(plan.disable.sort()).toEqual([comm.id, event.id].sort());
    expect(plan.create).toEqual([]);
  });
});
