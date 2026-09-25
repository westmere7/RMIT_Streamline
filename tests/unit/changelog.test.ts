import { describe, expect, it } from "vitest";
import { CHANGELOG, changesSince, compareVersions } from "@/lib/changelog";
import pkg from "../../package.json";

describe("changelog", () => {
  it("has an entry for the version in package.json, at the top", () => {
    expect(CHANGELOG[0]!.version).toBe(pkg.version);
  });

  it("is newest first, with one entry per version", () => {
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1]!.version, CHANGELOG[i]!.version)).toBeGreaterThan(0);
  });

  it("compares versions as numbers", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.28.1", "0.28.1")).toBe(0);
  });

  it("gives everything after the running version, and the latest when nothing is newer", () => {
    expect(changesSince("0.29.2").map((e) => e.version)).toEqual(CHANGELOG.filter((e) => compareVersions(e.version, "0.29.2") > 0).map((e) => e.version));
    expect(changesSince(CHANGELOG[0]!.version)).toEqual([CHANGELOG[0]]);
  });
});
