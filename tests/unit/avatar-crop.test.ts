import { describe, expect, it } from "vitest";
import { clampCrop, cropScale, INITIAL_CROP } from "@/features/profile/avatar-crop-dialog";

// A 400x200 landscape photo in a 100px frame.
describe("framing a profile photo", () => {
  it("fills the frame at zoom 1, by the short side", () => {
    expect(cropScale(400, 200, INITIAL_CROP, 100)).toBe(0.5);
    // Turned a quarter, the short side is still 200.
    expect(cropScale(400, 200, { ...INITIAL_CROP, turns: 1 }, 100)).toBe(0.5);
  });

  it("never lets the photo leave a gap in the frame", () => {
    // At zoom 1 the photo is 200x100: 50px of room either side, none up or down.
    expect(clampCrop(400, 200, { ...INITIAL_CROP, x: 500, y: 40 }, 100)).toEqual({ turns: 0, zoom: 1, x: 50, y: 0 });
    // Turned, the room moves to the other axis.
    expect(clampCrop(400, 200, { turns: 1, zoom: 1, x: 500, y: -500 }, 100)).toEqual({ turns: 1, zoom: 1, x: 0, y: -50 });
  });

  it("keeps the zoom between 1 and 4 and the turns between 0 and 3", () => {
    expect(clampCrop(400, 200, { turns: 5, zoom: 9, x: 0, y: 0 }, 100)).toMatchObject({ turns: 1, zoom: 4 });
    expect(clampCrop(400, 200, { turns: -1, zoom: 0.2, x: 0, y: 0 }, 100)).toMatchObject({ turns: 3, zoom: 1 });
  });
});
