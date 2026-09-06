"use client";

import type { DataProviderKind } from "@/lib/config";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Covers are shown at card and panel width; 1600px keeps them crisp on any screen without wasting bytes. */
const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.85;
export const MAX_COVER_SOURCE_BYTES = 3 * 1024 * 1024;

export const COVER_BUCKET = "item-covers";

export class CoverError extends Error {}

/**
 * Re-encodes any image the browser can decode as WebP, scaled so its longer
 * edge is at most 1600px. The source must be under 3MB; the result is usually
 * a tenth of that. Everything happens on the client before upload.
 */
export async function toWebpCover(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new CoverError("That file is not an image.");
  if (file.size > MAX_COVER_SOURCE_BYTES) throw new CoverError("Cover images must be under 3MB.");

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new CoverError("That image could not be read.");
  });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new CoverError("Your browser could not process the image.");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
    if (!blob) throw new CoverError("Your browser could not encode WebP.");
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * Stores the cover and returns the URL to save on the item. Supabase keeps it
 * in the public `item-covers` bucket at `<item-id>/cover.webp` (writable by
 * anyone who can edit the item); local mode inlines it as a data URL.
 */
export async function uploadCover(provider: DataProviderKind, itemId: string, file: File): Promise<{ url: string; bytes: number }> {
  const webp = await toWebpCover(file);
  if (provider !== "supabase") return { url: await blobToDataUrl(webp), bytes: webp.size };

  const path = `${itemId}/cover.webp`;
  const storage = getSupabaseClient().storage.from(COVER_BUCKET);
  const { error } = await storage.upload(path, webp, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
  if (error) {
    throw new CoverError(/bucket/i.test(error.message) ? "The item-covers bucket is missing — run the database migrations or create it in Supabase → Storage." : `Upload failed: ${error.message}`);
  }
  const { data } = storage.getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}`, bytes: webp.size };
}

/** Deletes the stored file; the item's cover_url is cleared separately. Never throws: a stray file is harmless. */
export async function deleteCoverFile(provider: DataProviderKind, itemId: string): Promise<void> {
  if (provider !== "supabase") return;
  await getSupabaseClient()
    .storage.from(COVER_BUCKET)
    .remove([`${itemId}/cover.webp`])
    .catch(() => undefined);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new CoverError("Could not read the converted image."));
    reader.readAsDataURL(blob);
  });
}
