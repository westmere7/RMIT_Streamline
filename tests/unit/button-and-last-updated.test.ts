import { describe, expect, it } from "vitest";
import { buttonActionIncomplete, buttonSettings, defaultSettingsFor, lastUpdatedEvents, lastUpdatedSettings } from "@/domain";

describe("Last updated settings", () => {
  it("defaults to everything but links, and reads unknown sources away", () => {
    const fresh = lastUpdatedSettings(defaultSettingsFor("LAST_UPDATED"));
    expect(fresh.sources).not.toContain("links");
    expect(fresh.sources).toContain("created");
    const odd = lastUpdatedSettings({ kind: "last_updated", sources: ["updates", "nonsense"], display: "sideways" } as never);
    expect(odd.sources).toEqual(["updates"]);
    expect(odd.display).toBe("both");
  });

  it("asks for the activity events of the chosen kinds only", () => {
    const events = lastUpdatedEvents(lastUpdatedSettings({ kind: "last_updated", sources: ["updates", "name"] } as never));
    expect(events).toEqual(["ITEM_RENAMED", "COMMENT_ADDED"]);
  });
});

describe("Button settings", () => {
  it("starts as a Mark done button", () => {
    const fresh = buttonSettings(defaultSettingsFor("BUTTON"));
    expect(fresh.label).toBe("Mark done");
    expect(fresh.actions).toEqual([{ kind: "set_status", labelId: null }]);
  });

  it("drops steps it does not know and keeps the rest in order", () => {
    const read = buttonSettings({ kind: "button", label: "  Go  ", color: "nope", style: "filled", actions: [{ kind: "assign_me" }, { kind: "launch" }, { kind: "set_due", offset: "someday" }] } as never);
    expect(read.label).toBe("Go");
    expect(read.color).toBe("green");
    expect(read.actions).toEqual([{ kind: "assign_me" }, { kind: "set_due", offset: "today" }]);
  });

  it("knows a step that would do nothing", () => {
    expect(buttonActionIncomplete({ kind: "open_link", url: "example.com" })).toBe(true);
    expect(buttonActionIncomplete({ kind: "open_link", url: "https://example.com" })).toBe(false);
    expect(buttonActionIncomplete({ kind: "post_update", text: "  " })).toBe(true);
    expect(buttonActionIncomplete({ kind: "move_to_group", groupId: null })).toBe(true);
  });
});
