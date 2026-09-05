import { describe, expect, it } from "vitest";
import type { BoardColumn, StatusColumnSettings } from "@/domain";
import { defaultSettingsFor, isStuckLabel, statusLabelRole, statusRoleIds } from "@/domain";

const settings = defaultSettingsFor("STATUS") as StatusColumnSettings;

function statusColumn(next: StatusColumnSettings): BoardColumn {
  return { id: "status", boardId: "b", name: "Status", type: "STATUS", settings: next, position: 0, width: 150, hidden: false, createdAt: "" };
}

describe("status label roles", () => {
  it("gives the default labels their meanings", () => {
    expect(statusLabelRole(settings, "done")).toBe("done");
    expect(statusLabelRole(settings, "stuck")).toBe("stuck");
    expect(statusLabelRole(settings, "working")).toBe("progress");
  });

  it("leaves the rest without one", () => {
    expect(statusLabelRole(settings, "not_started")).toBeNull();
    expect(statusLabelRole(settings, "waiting")).toBeNull();
    expect(statusLabelRole(settings, null)).toBeNull();
  });

  it("reads a board saved before roles existed without inventing any", () => {
    // Only doneLabelIds was stored then; the other keys are simply absent.
    const old: StatusColumnSettings = { kind: "status", labels: settings.labels, doneLabelIds: ["done"], defaultLabelId: "not_started" };
    expect(statusLabelRole(old, "done")).toBe("done");
    expect(statusLabelRole(old, "stuck")).toBeNull();
    expect(statusRoleIds(old, "stuck")).toEqual([]);
    expect(statusRoleIds(old, "progress")).toEqual([]);
  });

  it("names the labels carrying each role", () => {
    expect(statusRoleIds(settings, "done")).toEqual(["done"]);
    expect(statusRoleIds(settings, "stuck")).toEqual(["stuck"]);
    expect(statusRoleIds(settings, "progress")).toEqual(["working"]);
  });

  it("answers the stuck question a chip asks, whatever the label is called", () => {
    // The meaning travels with the label id, not its wording.
    const renamed: StatusColumnSettings = { ...settings, labels: settings.labels.map((l) => (l.id === "stuck" ? { ...l, name: "Blocked" } : l)) };
    expect(isStuckLabel(statusColumn(renamed), "stuck")).toBe(true);
    expect(isStuckLabel(statusColumn(settings), "done")).toBe(false);
    expect(isStuckLabel(null, "stuck")).toBe(false);
  });
});
