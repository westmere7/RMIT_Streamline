import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Each call to the database, and what the next one answers. */
const reads: string[] = [];
let answer: { data: unknown; error: unknown } = { data: { name: "RMIT Creative Team", description: "Briefs to reports" }, error: null };

vi.mock("@/lib/config", () => ({ getAppConfig: () => ({ dataProvider: "supabase" }) }));
vi.mock("@/lib/supabase/admin", () => ({
  isOnboardingServerConfigured: () => true,
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_column: string, slug: string) => ({
          maybeSingle: async () => {
            reads.push(slug);
            return answer;
          },
        }),
      }),
    }),
  }),
}));

/**
 * The workspace layout's link preview asks for the workspace's name and
 * description on every server render, prefetches included: a page opening
 * asked the same question a dozen times in a second. It is remembered now.
 */
describe("the workspace's link preview", () => {
  beforeEach(() => {
    vi.resetModules();
    reads.length = 0;
    answer = { data: { name: "RMIT Creative Team", description: "Briefs to reports" }, error: null };
  });
  afterEach(() => vi.useRealTimers());

  it("reads the workspace once for many renders at once and for a while after", async () => {
    const { workspaceLinkMeta } = await import("@/server/workspace-meta");
    const together = await Promise.all(Array.from({ length: 12 }, () => workspaceLinkMeta("rmit")));
    expect(together.every((meta) => meta?.name === "RMIT Creative Team")).toBe(true);
    expect(await workspaceLinkMeta("rmit")).toEqual({ name: "RMIT Creative Team", description: "Briefs to reports" });
    expect(reads).toEqual(["rmit"]);
  });

  it("reads again once the answer is a few minutes old", async () => {
    vi.useFakeTimers();
    const { workspaceLinkMeta } = await import("@/server/workspace-meta");
    await workspaceLinkMeta("rmit");
    vi.advanceTimersByTime(6 * 60_000);
    answer = { data: { name: "Renamed", description: null }, error: null };
    expect((await workspaceLinkMeta("rmit"))?.name).toBe("Renamed");
    expect(reads).toEqual(["rmit", "rmit"]);
  });

  it("does not keep a failed read", async () => {
    const { workspaceLinkMeta } = await import("@/server/workspace-meta");
    answer = { data: null, error: { message: "timeout" } };
    expect(await workspaceLinkMeta("rmit")).toBeNull();
    answer = { data: { name: "RMIT Creative Team", description: null }, error: null };
    expect((await workspaceLinkMeta("rmit"))?.name).toBe("RMIT Creative Team");
    expect(reads).toEqual(["rmit", "rmit"]);
  });

  it("keeps each workspace apart", async () => {
    const { workspaceLinkMeta } = await import("@/server/workspace-meta");
    await workspaceLinkMeta("rmit");
    await workspaceLinkMeta("content");
    await workspaceLinkMeta("rmit");
    expect(reads).toEqual(["rmit", "content"]);
  });
});
