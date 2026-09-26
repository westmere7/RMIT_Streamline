import { describe, expect, it } from "vitest";
import { CHANGELOG, changesSince, compareVersions, releaseBefore, releasesAfter } from "@/lib/changelog";
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

describe("the App updated notice", () => {
  const entries = [
    { version: "0.3.0", date: "2026-09-03", title: "Third", changes: ["c"] },
    { version: "0.2.1", date: "2026-09-02", title: "Second, fixed", changes: ["b2"] },
    { version: "0.2.0", date: "2026-09-02", title: "Second", changes: ["b"] },
    { version: "0.1.0", date: "2026-09-01", title: "First", changes: ["a"] },
  ];

  it("lists what arrived after the version last seen, up to the one running", () => {
    expect(releasesAfter("0.2.0", "0.3.0", entries).map((e) => e.version)).toEqual(["0.3.0", "0.2.1"]);
    expect(releasesAfter("0.1.0", "0.2.1", entries).map((e) => e.version)).toEqual(["0.2.1", "0.2.0"]);
  });

  it("says nothing on the same version, or after going back", () => {
    expect(releasesAfter("0.3.0", "0.3.0", entries)).toEqual([]);
    expect(releasesAfter("0.3.0", "0.2.0", entries)).toEqual([]);
  });

  it("knows the release before each one", () => {
    expect(releaseBefore("0.3.0", entries)).toBe("0.2.1");
    expect(releaseBefore("0.1.0", entries)).toBeNull();
    expect(releaseBefore(CHANGELOG[0]!.version)).toBe(CHANGELOG[1]!.version);
  });
});
