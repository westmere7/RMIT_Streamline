import { describe, expect, it } from "vitest";
import { toolbarCommandIncomplete, toolbarSlot } from "@/domain";

describe("the toolbar slot", () => {
  it("is New item alone when nothing is stored", () => {
    expect(toolbarSlot(null)).toEqual({ buttons: [], activeId: null, selectionActiveId: null });
  });

  it("reads the first version, one quick run, as one chosen button", () => {
    const slot = toolbarSlot({ kind: "quick_run", ruleId: "r1", label: "Make high" });
    expect(slot.buttons).toHaveLength(1);
    expect(slot.buttons[0]).toMatchObject({ label: "Make high", scope: "board", command: { kind: "quick_run", ruleId: "r1" } });
    expect(slot.activeId).toBe(slot.buttons[0]!.id);
  });

  it("keeps the buttons it can read, and New item when the chosen one is gone", () => {
    const slot = toolbarSlot({
      activeId: "gone",
      buttons: [
        { id: "b1", label: "Print", color: "teal", icon: "rocket", command: { kind: "steps", actions: [{ kind: "assign_me" }, { kind: "warp" }] } },
        { id: "b2", label: "Odd", command: { kind: "teleport" } },
        { id: "b3", label: " ", color: "nope", icon: "<script>", command: { kind: "open_link", url: "https://example.com" } },
      ],
    });
    expect(slot.activeId).toBeNull();
    expect(slot.buttons.map((b) => b.id)).toEqual(["b1", "b3"]);
    expect(slot.buttons[0]!.command).toEqual({ kind: "steps", actions: [{ kind: "assign_me" }] });
    expect(slot.buttons[1]).toMatchObject({ label: "Button", color: "red", icon: "zap" });
  });

  it("puts each button where its command makes sense, and drops one that cannot be anywhere", () => {
    const slot = toolbarSlot({
      activeId: "view",
      selectionActiveId: "steps",
      buttons: [
        { id: "steps", label: "Done", command: { kind: "steps", actions: [{ kind: "assign_me" }] } },
        { id: "view", label: "Sprint", command: { kind: "open_view", viewId: "v1" } },
        { id: "wrong", label: "Link on ticked", scope: "selection", command: { kind: "open_link", url: "https://example.com" } },
      ],
    });
    expect(slot.buttons.map((b) => [b.id, b.scope])).toEqual([["steps", "selection"], ["view", "board"]]);
    expect(slot.activeId).toBe("view");
    expect(slot.selectionActiveId).toBe("steps");
    // Chosen in the wrong place reads as not chosen.
    expect(toolbarSlot({ activeId: "steps", buttons: [{ id: "steps", label: "Done", command: { kind: "steps", actions: [] } }] }).activeId).toBeNull();
  });

  it("knows a command that would do nothing", () => {
    expect(toolbarCommandIncomplete({ kind: "steps", actions: [] })).toBe(true);
    expect(toolbarCommandIncomplete({ kind: "quick_run", ruleId: null })).toBe(true);
    expect(toolbarCommandIncomplete({ kind: "open_link", url: "example.com" })).toBe(true);
    expect(toolbarCommandIncomplete({ kind: "open_view", viewId: "v1" })).toBe(false);
  });
});
