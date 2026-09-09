import type { BoardShareGate, PublicBoardPayload, PublicItemPayload } from "@/domain";
import type { PublicShareTransport } from "@/services/board-share-service";
import { ShareAccessError, type ShareFailure } from "@/services/board-share-service";
import type { PublicItemTransport } from "@/services/item-share-service";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Reading a shared board against Supabase goes through the app's own route
 * handler (src/app/api/share/[token]/route.ts, backed by src/server/share.ts).
 *
 * A visitor has no account, so there is no session for row level security to
 * judge and the read runs with the service role behind the token instead.
 * Nothing is sent but the token and, when the link has one, the password — in
 * the body rather than the query string, so it stays out of logs and history.
 */
export class HttpShareTransport implements PublicShareTransport {
  async gate(token: string): Promise<BoardShareGate> {
    return call<BoardShareGate>(`/api/share/${encodeURIComponent(token)}`, { method: "GET" });
  }

  async load(token: string, password: string | null): Promise<PublicBoardPayload> {
    return call<PublicBoardPayload>(`/api/share/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ password }) });
  }
}

/** The same, for a link to one task. */
export class HttpItemShareTransport implements PublicItemTransport {
  async gate(token: string): Promise<BoardShareGate> {
    return call<BoardShareGate>(`/api/share/item/${encodeURIComponent(token)}`, { method: "GET" });
  }

  async load(token: string, password: string | null): Promise<PublicItemPayload> {
    return call<PublicItemPayload>(`/api/share/item/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ password }) });
  }
}

/**
 * Like callApi, but it keeps the refusal's reason: the page says something
 * different for a wrong password than for a link that has expired.
 */
async function call<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (init.body) headers.set("Content-Type", "application/json");
  // A public link needs nobody; a private one is opened as whoever is signed in
  // on this browser, so the session travels when there is one.
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  } catch {
    // No Supabase client configured: the link can only be a public one.
  }
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (response.ok) return body as T;

  const shaped = (body ?? {}) as { error?: unknown; reason?: unknown };
  const message = typeof shaped.error === "string" ? shaped.error : `Request failed (${response.status})`;
  if (typeof shaped.reason === "string") throw new ShareAccessError(shaped.reason as ShareFailure, message);
  throw new Error(message);
}
