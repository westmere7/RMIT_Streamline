import { describe, expect, it } from "vitest";
import { PAGE_ROWS, unwrapAll } from "@/data/supabase/client";

/**
 * PostgREST answers a plain select with at most `max-rows` and says nothing
 * about the rest, so a read whose size grows with the workspace has to ask for
 * ranges until it gets a short one. A workspace-wide read of one column type
 * already passed that mark on live data, silently.
 */
describe("reading past PostgREST's row cap", () => {
  /** A table of `total` rows that honours `range` and never returns more than the cap. */
  const table = (total: number) => {
    const asked: Array<[number, number]> = [];
    const page = async (from: number, to: number) => {
      asked.push([from, to]);
      const end = Math.min(to + 1, from + PAGE_ROWS, total);
      return { data: Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ id: from + i })), error: null };
    };
    return { asked, page };
  };

  it("stops after one request when everything fits", async () => {
    const { asked, page } = table(12);
    expect(await unwrapAll(page, "test")).toHaveLength(12);
    expect(asked).toEqual([[0, PAGE_ROWS - 1]]);
  });

  it("keeps going while the pages come back full", async () => {
    const { asked, page } = table(PAGE_ROWS * 2 + 240);
    const rows = await unwrapAll<{ id: number }>(page, "test");

    expect(rows).toHaveLength(PAGE_ROWS * 2 + 240);
    expect(rows.map((r) => r.id)).toEqual([...Array(PAGE_ROWS * 2 + 240).keys()]);
    expect(asked).toHaveLength(3);
    expect(asked[1]).toEqual([PAGE_ROWS, PAGE_ROWS * 2 - 1]);
  });

  it("asks once more when the last page is exactly full", async () => {
    // Nothing in the answer says whether more rows exist, so a full page is
    // always followed by another request. Cheaper than losing rows.
    const { asked, page } = table(PAGE_ROWS);
    expect(await unwrapAll(page, "test")).toHaveLength(PAGE_ROWS);
    expect(asked).toHaveLength(2);
  });

  it("reports a failure instead of returning a short answer", async () => {
    const failing = async (from: number) =>
      from === 0
        ? { data: Array.from({ length: PAGE_ROWS }, (_, i) => ({ id: i })), error: null }
        : { data: null, error: { message: "connection reset" } };
    await expect(unwrapAll(failing, "item_column_values.test")).rejects.toThrow(/item_column_values.test: connection reset/);
  });
});
