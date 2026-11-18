import { describe, expect, it } from "vitest";
import { encodeCanvas } from "@/lib/image-encode";

/** A canvas that writes the formats it is given, and answers anything else with a PNG, as browsers do. */
function fakeCanvas(writes: string[]): HTMLCanvasElement {
  const asked: string[] = [];
  const canvas = {
    width: 4,
    height: 4,
    asked,
    toBlob(callback: BlobCallback, type?: string) {
      asked.push(type ?? "image/png");
      const made = type && writes.includes(type) ? type : "image/png";
      callback(new Blob(["x"], { type: made }));
    },
  };
  return canvas as unknown as HTMLCanvasElement;
}

describe("encoding an upload", () => {
  it("writes WebP where the browser can", async () => {
    const encoded = await encodeCanvas(fakeCanvas(["image/webp", "image/jpeg"]), 0.8);
    expect(encoded?.type).toBe("image/webp");
    expect(encoded?.extension).toBe("webp");
    expect(encoded?.blob.type).toBe("image/webp");
  });

  it("falls back to JPEG where asking for WebP gives a PNG (Safari)", async () => {
    const encoded = await encodeCanvas(fakeCanvas(["image/jpeg"]), 0.8);
    expect(encoded?.type).toBe("image/jpeg");
    expect(encoded?.extension).toBe("jpg");
    expect(encoded?.blob.type).toBe("image/jpeg");
  });

  it("gives up rather than send a type the buckets refuse", async () => {
    expect(await encodeCanvas(fakeCanvas([]), 0.8)).toBeNull();
  });
});
