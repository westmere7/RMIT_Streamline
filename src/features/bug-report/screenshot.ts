"use client";

/** A screenshot is read at full width; 1920px keeps text legible without sending a phone's worth of pixels. */
const MAX_EDGE = 1920;
/** What one screenshot may weigh once encoded. Three of them fit a request the host will take. */
export const MAX_SCREENSHOT_BYTES = 1024 * 1024;
/** What the browser is asked to decode at all: a retina PNG straight from the clipboard runs to several megabytes. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export class ScreenshotError extends Error {}

/**
 * Re-encodes a pasted or chosen image as WebP, as a data URL.
 *
 * Tries a few qualities, then a smaller size, until it is under a megabyte. The
 * server stores it as a file (Supabase); local mode keeps the data URL itself.
 */
export async function toScreenshot(file: Blob): Promise<{ dataUrl: string; bytes: number }> {
  if (!file.type.startsWith("image/")) throw new ScreenshotError("That file is not an image.");
  if (file.size > MAX_SOURCE_BYTES) throw new ScreenshotError("That image is too big to read.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new ScreenshotError("That image could not be read.");
  });
  try {
    for (const edge of [MAX_EDGE, 1440, 1080]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new ScreenshotError("Your browser could not process the image.");
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (!blob || blob.type !== "image/webp") throw new ScreenshotError("Your browser could not encode the image.");
        if (blob.size <= MAX_SCREENSHOT_BYTES) return { dataUrl: await blobToDataUrl(blob), bytes: blob.size };
      }
    }
    throw new ScreenshotError("That image is too detailed to send. Try a smaller part of the screen.");
  } finally {
    bitmap.close();
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ScreenshotError("Could not read the converted image."));
    reader.readAsDataURL(blob);
  });
}
