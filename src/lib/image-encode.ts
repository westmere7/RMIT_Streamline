"use client";

/** What an image upload was encoded as, and the extension its stored file takes. */
export interface EncodedImage {
  blob: Blob;
  type: "image/webp" | "image/jpeg";
  extension: "webp" | "jpg";
}

/** The kinds the image buckets take (migration 0115). */
export const UPLOAD_IMAGE_TYPES = ["image/webp", "image/jpeg"] as const;

/**
 * A drawn canvas as WebP, or as JPEG where the browser cannot write WebP.
 *
 * Safari decodes WebP but cannot encode it from a canvas: asked for WebP, it
 * hands back a PNG without saying so. Uploaded as it was, that PNG was refused
 * by the storage buckets ("mime type not supported"), so nobody on an iPhone,
 * an iPad or Safari on a Mac could set an avatar or a cover. The blob's own
 * type is checked rather than trusted, and JPEG, which every browser writes, is
 * the fallback. JPEG has no transparency, so it is drawn over white first: a
 * transparent logo would otherwise come out on black.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<EncodedImage | null> {
  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp?.type === "image/webp") return { blob: webp, type: "image/webp", extension: "webp" };
  const jpeg = await toBlob(onWhite(canvas), "image/jpeg", quality);
  if (jpeg?.type === "image/jpeg") return { blob: jpeg, type: "image/jpeg", extension: "jpg" };
  return null;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** The same picture over a white ground; the canvas itself when one cannot be made. */
function onWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const context = flat.getContext("2d");
  if (!context) return canvas;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, flat.width, flat.height);
  context.drawImage(canvas, 0, 0);
  return flat;
}
