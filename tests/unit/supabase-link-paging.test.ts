import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAGE_ROWS, routeRepositoriesThrough } from "@/data/supabase/client";
import { SupabaseItemLinkRepository } from "@/data/supabase/repositories/item-link-repository";

/**
 * Reading a board's links without losing any.
 *
 * PostgREST answers a plain select with at most a thousand rows and reports no
 * error when it has left some out, so this read — whose size grows with the
 * board — has to ask for ranges until it gets a short page. It went unpaged for
 * a long time, and the symptom was not an error: rows on a big board simply
 * stopped showing as linked.
 */
describe("reading item links past PostgREST's row cap", () => {
  afterEach(() => routeRepositoriesThrough(null));

  /**
   * A stand-in for the query builder, recording what was asked for.
   *
   * `rowsFor` decides what each filter returns; the fake honours `range` the way
   * PostgREST does, capping every answer at the page size.
   */
  function fakeClient(rowsFor: (filter: string) => Array<{ id: string }>) {
    const requests: Array<{ or: string; from: number; to: number }> = [];
    const client = {
      from: () => {
        let or = "";
        let from = 0;
        let to = PAGE_ROWS - 1;
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          or: (value: string) => {
            or = value;
            return builder;
          },
          range: (start: number, end: number) => {
            from = start;
            to = end;
            return builder;
          },
          then: (resolve: (result: { data: unknown; error: null }) => unknown) => {
            requests.push({ or, from, to });
            const all = rowsFor(or);
            const page = all.slice(from, Math.min(to + 1, from + PAGE_ROWS));
            return Promise.resolve(resolve({ data: page, error: null }));
          },
        };
        return builder;
      },
    };
    return { client: client as unknown as SupabaseClient, requests };
  }

  const link = (id: number, a: string, b: string) => ({
    id: `link-${id}`,
    workspace_id: "w",
    item_a_id: a,
    item_b_id: b,
    excluded: [],
    created_by: "u",
    created_at: new Date(2026, 0, 1, 0, 0, id % 60).toISOString(),
  });

  it("keeps asking while the pages come back full", async () => {
    const rows = Array.from({ length: PAGE_ROWS * 2 + 17 }, (_, i) => link(i, "item-1", `other-${i}`));
    const { client, requests } = fakeClient(() => rows);
    routeRepositoriesThrough(client);

    const links = await new SupabaseItemLinkRepository().listByItems(["item-1"]);

    expect(links).toHaveLength(PAGE_ROWS * 2 + 17);
    // Three full-looking pages, then the short one that ends it.
    expect(requests).toHaveLength(3);
    expect(requests[1]).toMatchObject({ from: PAGE_ROWS, to: PAGE_ROWS * 2 - 1 });
  });

  it("asks about both ends of a link, and returns a link found at both once", async () => {
    const shared = [link(1, "item-1", "item-2")];
    const { client, requests } = fakeClient(() => shared);
    routeRepositoriesThrough(client);

    const links = await new SupabaseItemLinkRepository().listByItems(["item-1", "item-2"]);

    expect(links).toHaveLength(1);
    expect(requests[0]!.or).toContain("item_a_id.in.");
    expect(requests[0]!.or).toContain("item_b_id.in.");
  });

  it("keeps the id list short enough to send, splitting a long one", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const { client, requests } = fakeClient(() => []);
    routeRepositoriesThrough(client);

    await new SupabaseItemLinkRepository().listByItems(ids);

    // Batches of a hundred rather than one query with all of them, and every id
    // appears twice in each query string (once per end), which is what the
    // smaller batch is sized for.
    expect(requests).toHaveLength(3);
    for (const request of requests) expect(request.or.length).toBeLessThan(8000);
    const asked = requests.flatMap((r) => [...r.or.matchAll(/"([^"]+)"/g)].map((m) => m[1]!));
    expect(new Set(asked)).toEqual(new Set(ids));
  });
});
