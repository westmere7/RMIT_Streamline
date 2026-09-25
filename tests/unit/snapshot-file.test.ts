import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readSnapshotFile, SNAPSHOT_FORMAT } from "@/server/snapshots";

const doc = { format: SNAPSHOT_FORMAT, version: 1, name: "Before the launch", tables: { items: [{ id: "a", name: "Poster" }], comments: [] } };

describe("snapshot files", () => {
  it("opens a gzipped snapshot and a plain one alike", () => {
    const plain = Buffer.from(JSON.stringify(doc));
    expect(readSnapshotFile(gzipSync(plain)).tables.items).toEqual([{ id: "a", name: "Poster" }]);
    expect(readSnapshotFile(plain).name).toBe("Before the launch");
  });

  it("refuses what is not a snapshot, a damaged one, and one from a newer version", () => {
    expect(() => readSnapshotFile(Buffer.from("not json"))).toThrow("not a Streamline snapshot");
    expect(() => readSnapshotFile(Buffer.from(JSON.stringify({ format: "something-else", version: 1, tables: {} })))).toThrow("not a Streamline snapshot");
    expect(() => readSnapshotFile(Buffer.from(JSON.stringify({ ...doc, tables: { items: "oops" } })))).toThrow("damaged");
    expect(() => readSnapshotFile(Buffer.from(JSON.stringify({ ...doc, version: 99 })))).toThrow("newer version");
  });
});
