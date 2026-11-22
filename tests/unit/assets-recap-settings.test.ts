import { describe, expect, it } from "vitest";
import { assetsRecapSettings, DEFAULT_ASSETS_RECAP_SETTINGS, toggleAssetsRecapPart } from "@/domain";

describe("Assets recap column settings", () => {
  it("a column from before the settings shows assets, quantity and people", () => {
    expect(assetsRecapSettings({ kind: "none" })).toEqual(DEFAULT_ASSETS_RECAP_SETTINGS);
    expect(assetsRecapSettings(null).show).toEqual(["assets", "quantity", "pic"]);
  });

  it("keeps the parts in their fixed order, drops unknown ones, and never ends up empty", () => {
    expect(assetsRecapSettings({ kind: "assetsRecap", show: ["hours", "bogus", "assets"] } as never).show).toEqual(["assets", "hours"]);
    expect(assetsRecapSettings({ kind: "assetsRecap", show: [] } as never).show).toEqual(["assets", "quantity", "pic"]);
    expect(toggleAssetsRecapPart(["assets", "pic"], "hours")).toEqual(["assets", "pic", "hours"]);
    expect(toggleAssetsRecapPart(["assets", "due"], "quantity")).toEqual(["assets", "quantity", "due"]);
    expect(toggleAssetsRecapPart(["assets", "pic"], "pic")).toEqual(["assets"]);
    expect(toggleAssetsRecapPart(["hours"], "hours")).toEqual(["hours"]);
  });
});
