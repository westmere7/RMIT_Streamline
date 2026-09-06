import { describe, expect, it } from "vitest";
import { formatVersion, isNewerBuild, isVersionInfo, shortBuildId, type VersionInfo } from "@/lib/version";

const current: VersionInfo = { version: "0.1.0", buildId: "bac18d9abcdef", builtAt: "2026-09-06T10:00:00.000Z" };

describe("build identity", () => {
  it("recognises a well-formed version payload and rejects anything else", () => {
    expect(isVersionInfo(current)).toBe(true);
    expect(isVersionInfo({ ...current, buildId: "" })).toBe(false);
    expect(isVersionInfo({ version: "1", builtAt: "" })).toBe(false);
    expect(isVersionInfo(null)).toBe(false);
    expect(isVersionInfo("0.1.0")).toBe(false);
  });

  it("treats a different build id or version as newer, and the same build as current", () => {
    expect(isNewerBuild(current, { ...current })).toBe(false);
    expect(isNewerBuild(current, { ...current, builtAt: "2026-09-07T00:00:00.000Z" })).toBe(false);
    expect(isNewerBuild(current, { ...current, buildId: "0123456789ab" })).toBe(true);
    expect(isNewerBuild(current, { ...current, version: "0.2.0" })).toBe(true);
  });

  it("formats a short, readable label", () => {
    expect(formatVersion(current)).toBe("v0.1.0 (bac18d9)");
    expect(shortBuildId("local-abc")).toBe("local-abc");
    expect(shortBuildId("dev")).toBe("dev");
  });
});
