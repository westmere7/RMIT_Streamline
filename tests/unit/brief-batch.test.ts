import { describe, expect, it } from "vitest";
import { loadBookingBrief, type BriefReader } from "@/features/items/brief-batch";

function reader(briefs: Record<string, string>) {
  const calls: string[][] = [];
  const r: BriefReader = {
    async listBookingBriefs(ids) {
      calls.push(ids);
      return new Map(ids.filter((id) => briefs[id]).map((id) => [id, briefs[id]!]));
    },
  };
  return { r, calls };
}

describe("reading booked briefs for a board's cells", () => {
  it("gathers the asks of one tick into one read, and answers each", async () => {
    const { r, calls } = reader({ a: "Brief A", c: "Brief C" });
    const answers = await Promise.all(["a", "b", "c", "a"].map((id) => loadBookingBrief(r, id)));
    expect(answers).toEqual(["Brief A", null, "Brief C", "Brief A"]);
    expect(calls).toEqual([["a", "b", "c"]]);
  });

  it("splits a long board into chunks short enough for a URL", async () => {
    const { r, calls } = reader({});
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    await Promise.all(ids.map((id) => loadBookingBrief(r, id)));
    expect(calls.map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it("a later tick is a read of its own, and a failure reaches every ask", async () => {
    const { r, calls } = reader({ a: "A" });
    await loadBookingBrief(r, "a");
    await loadBookingBrief(r, "a");
    expect(calls).toHaveLength(2);
    const failing: BriefReader = { listBookingBriefs: () => Promise.reject(new Error("down")) };
    await expect(Promise.all([loadBookingBrief(failing, "x"), loadBookingBrief(failing, "y")])).rejects.toThrow("down");
  });
});
