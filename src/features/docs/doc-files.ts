import type { DataProviderKind } from "@/lib/config";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Where a PDF doc's file lives. On Supabase, the private `docs` bucket at
 * <workspace id>/<doc id>/<file name>, read through a short-lived signed link
 * so the file is only ever reached by someone the policies let read it (0107,
 * policies/0025). A local workspace keeps the file itself, as a data URL on
 * the doc.
 */
export const DOCS_BUCKET = "docs";

/** How long a link to a PDF stays good: long enough to read it, short enough not to be worth passing on. */
const SIGNED_SECONDS = 60 * 60;

export class DocFileError extends Error {}

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "document.pdf";

/** Stores a PDF for a doc and returns what the doc keeps to find it again. */
export async function storeDocFile(provider: DataProviderKind, workspaceId: string, docId: string, file: File): Promise<string> {
  if (provider !== "supabase") return blobToDataUrl(file);
  const path = `${workspaceId}/${docId}/${safeName(file.name)}`;
  const { error } = await getSupabaseClient().storage.from(DOCS_BUCKET).upload(path, file, { contentType: "application/pdf", upsert: true });
  if (error) throw new DocFileError(/bucket/i.test(error.message) ? "The docs bucket is missing: run the database migrations, or create a private bucket called docs in Supabase → Storage." : `Upload failed: ${error.message}`);
  return path;
}

/**
 * A URL the browser can show the PDF from. A data URL is turned into a blob
 * link (browsers will not frame a data: PDF); the caller revokes it when done.
 */
export async function openDocFile(provider: DataProviderKind, filePath: string): Promise<{ url: string; revoke: () => void }> {
  if (filePath.startsWith("data:")) {
    const blob = await (await fetch(filePath)).blob();
    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }
  if (provider !== "supabase") throw new DocFileError("This file is kept in another workspace's storage.");
  const { data, error } = await getSupabaseClient().storage.from(DOCS_BUCKET).createSignedUrl(filePath, SIGNED_SECONDS);
  if (error || !data) throw new DocFileError(`Could not open the file: ${error?.message ?? "no link"}`);
  return { url: data.signedUrl, revoke: () => undefined };
}

/** Removes a doc's file. Never throws: a stray file is harmless, a doc that will not delete is not. */
export async function deleteDocFile(provider: DataProviderKind, filePath: string | null): Promise<void> {
  if (provider !== "supabase" || !filePath || filePath.startsWith("data:")) return;
  await getSupabaseClient()
    .storage.from(DOCS_BUCKET)
    .remove([filePath])
    .catch(() => undefined);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new DocFileError("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}
