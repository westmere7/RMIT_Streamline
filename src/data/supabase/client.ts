import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

let override: SupabaseClient | null = null;

/**
 * Points every repository at a different client. Server only: the booking route
 * handlers run the ordinary repositories and services with the service role
 * (there is no signed-in user behind a public booking), and the admin client is
 * one process-wide singleton, so a module-level switch is enough. Never call
 * this in the browser.
 */
export function routeRepositoriesThrough(client: SupabaseClient | null): void {
  override = client;
}

/** The client repositories talk to: the browser session, unless the server has switched it. */
export function db(): SupabaseClient {
  return override ?? getSupabaseClient();
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

/**
 * PostgREST's default `max-rows`.
 *
 * A select that asks for everything and gets back exactly this many rows has
 * almost certainly been truncated, and PostgREST reports no error when it does
 * — the caller just sees a short answer. Any read whose row count grows with
 * usage has to page.
 */
export const PAGE_ROWS = 1000;

/**
 * Reads every row of a query, a page at a time.
 *
 * `page` is handed the inclusive bounds for `.range()` and must return the same
 * query each time apart from those. A page shorter than the one asked for is
 * the last one.
 */
export async function unwrapAll<T>(page: (from: number, to: number) => PromiseLike<Result<T[]>>, context: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const batch = unwrapList<T>(await page(from, from + PAGE_ROWS - 1), context);
    rows.push(...batch);
    if (batch.length < PAGE_ROWS) return rows;
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
