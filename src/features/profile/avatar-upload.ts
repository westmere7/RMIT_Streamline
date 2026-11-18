"use client";

import type { DataProviderKind } from "@/lib/config";
import { encodeCanvas, type EncodedImage } from "@/lib/image-encode";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Avatars are square and small; anything larger is wasted bytes at every size we render. */
const MAX_EDGE = 256;
const WEBP_QUALITY = 0.82;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export const AVATAR_BUCKET = "avatars";

export class AvatarError extends Error {}

/**
 * Converts any image the browser can decode into a square 256px WebP, or a JPEG
 * where the browser cannot write WebP (Safari: see encodeCanvas).
 *
 * Everything happens on the client: the file is drawn to a canvas, cropped to a
 * centre square and re-encoded, so a 4MB phone photo becomes ~15KB before it
 * ever leaves the machine.
 */
export async function toAvatarImage(file: File): Promise<EncodedImage> {
  if (!file.type.startsWith("image/")) throw new AvatarError("That file is not an image.");
  if (file.size > MAX_SOURCE_BYTES) throw new AvatarError("Images must be under 10MB.");

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new AvatarError("That image could not be read.");
  });
  try {
    const edge = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(edge, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new AvatarError("Your browser could not process the image.");

    // Centre crop, so portraits and landscapes both end up square.
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, size, size);

    const encoded = await encodeCanvas(canvas, WEBP_QUALITY);
    if (!encoded) throw new AvatarError("Your browser could not encode the image.");
    return encoded;
  } finally {
    bitmap.close();
  }
}

/**
 * Stores the avatar and returns the URL to save on the profile.
 *
 * Supabase keeps it in the public `avatars` bucket at `<user-id>/avatar.webp` (or `.jpg`),
 * which the storage policies restrict to that person. Local mode has no storage,
 * so the image is inlined as a data URL in IndexedDB — small enough because it
 * has already been resized and re-encoded.
 */
export async function uploadAvatar(provider: DataProviderKind, userId: string, file: File): Promise<{ url: string; bytes: number }> {
  const image = await toAvatarImage(file);

  if (provider !== "supabase") {
    return { url: await blobToDataUrl(image.blob), bytes: image.blob.size };
  }

  const path = `${userId}/avatar.${image.extension}`;
  const storage = getSupabaseClient().storage.from(AVATAR_BUCKET);
  const { error } = await storage.upload(path, image.blob, { contentType: image.type, upsert: true, cacheControl: "3600" });
  if (error) {
    throw new AvatarError(
      /bucket/i.test(error.message)
        ? "The avatars bucket is missing — create it in Supabase → Storage, then try again."
        : `Upload failed: ${error.message}`,
    );
  }
  const { data } = storage.getPublicUrl(path);
  // The path never changes, so bust the CDN cache when the image does.
  return { url: `${data.publicUrl}?v=${Date.now()}`, bytes: image.blob.size };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new AvatarError("Could not read the converted image."));
    reader.readAsDataURL(blob);
  });
}
