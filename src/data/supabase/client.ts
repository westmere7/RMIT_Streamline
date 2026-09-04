import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Shorthand for the shared browser client. */
export function db(): SupabaseClient {
  return getSupabaseClient();
}

interface Result<T> {
  data: T | null;
  error: { message: string; details?: string | null; hint?: string | null; code?: string } | null;
}

/**
 * Turns a PostgREST result into data or a thrown error. Supabase reports failures
 * in `error` rather than rejecting, so every call goes through here.
 */
export function unwrap<T>(result: Result<T>, context: string): T {
  if (result.error) throw new SupabaseQueryError(context, result.error);
  if (result.data === null) throw new SupabaseQueryError(context, { message: "no data returned" });
  return result.data;
}

/** Like `unwrap`, but an empty result set is valid. */
export function unwrapList<T>(result: Result<T[]>, context: string): T[] {
  if (result.error) throw new SupabaseQueryError(context, result.error);
  return result.data ?? [];
}

/** Like `unwrap`, but "no rows" maps to null instead of throwing (maybeSingle). */
export function unwrapMaybe<T>(result: Result<T>, context: string): T | null {
  if (result.error) throw new SupabaseQueryError(context, result.error);
  return result.data;
}

/** Asserts a write succeeded without needing its returned rows. */
export function assertOk(result: { error: Result<unknown>["error"] }, context: string): void {
  if (result.error) throw new SupabaseQueryError(context, result.error);
}

export class SupabaseQueryError extends Error {
  readonly code: string | undefined;

  constructor(context: string, error: { message: string; details?: string | null; hint?: string | null; code?: string }) {
    const parts = [error.message, error.details, error.hint].filter(Boolean);
    super(`${context}: ${parts.join(" — ")}`);
    this.name = "SupabaseQueryError";
    this.code = error.code;
  }
}

/** Raised by operations that only make sense against the local (browser) store. */
export class NotSupportedError extends Error {
  constructor(operation: string, reason: string) {
    super(`${operation} is not available with the Supabase provider. ${reason}`);
    this.name = "NotSupportedError";
  }
}

/** PostgREST caps `in` lists; chunk long id lists so large boards keep working. */
export const ID_CHUNK = 200;

export function chunk<T>(values: T[], size = ID_CHUNK): T[][] {
  if (values.length <= size) return values.length ? [values] : [];
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}
