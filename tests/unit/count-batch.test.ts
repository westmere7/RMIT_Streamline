import { describe, expect, it } from "vitest";
import { loadBoardCount, type CountReader } from "@/features/boards/count-batch";

describe("the sidebar's board counts", () => {
  it("asks once for every board on the page, and answers each", async () => {
    const calls: string[][] = [];
    const reader: CountReader = {
      async countLiveMany(ids) {
        calls.push(ids);
        return new Map(ids.filter((id) => id !== "empty").map((id) => [id, id.length]));
      },
    };
    const counts = await Promise.all(["ab", "abcd", "empty", "ab"].map((id) => loadBoardCount(reader, id)));
    expect(counts).toEqual([2, 4, 0, 2]);
    expect(calls).toEqual([["ab", "abcd", "empty"]]);
  });

  it("a failed read reaches every badge waiting on it", async () => {
    const reader: CountReader = { countLiveMany: () => Promise.reject(new Error("down")) };
    await expect(Promise.all([loadBoardCount(reader, "a"), loadBoardCount(reader, "b")])).rejects.toThrow("down");
  });
});
