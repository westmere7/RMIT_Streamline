import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases, strips accents and collapses separators", () => {
    expect(slugify("RMITinerary 2026")).toBe("rmitinerary-2026");
    expect(slugify("  Semester 1 – Campaign!  ")).toBe("semester-1-campaign");
    expect(slugify("Tuyết Lê")).toBe("tuyet-le");
  });
});

describe("uniqueSlug", () => {
  it("appends a counter until the slug is free", () => {
    expect(uniqueSlug("brief", [])).toBe("brief");
    expect(uniqueSlug("brief", ["brief"])).toBe("brief-2");
    expect(uniqueSlug("brief", ["brief", "brief-2"])).toBe("brief-3");
    expect(uniqueSlug("", [])).toBe("board");
  });
});
