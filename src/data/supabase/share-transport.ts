import type { BoardShareGate, ItemOpenings, PublicBoardPayload, PublicItemPayload } from "@/domain";
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
  private readonly held = new HeldPayloads<PublicBoardPayload>();

  async gate(token: string): Promise<BoardShareGate> {
    return call<BoardShareGate>(`/api/share/${encodeURIComponent(token)}`, { method: "GET" });
  }

  async load(token: string, password: string | null): Promise<PublicBoardPayload> {
    return this.held.refresh([token, password], (revision) =>
      call<RefreshReply<PublicBoardPayload>>(`/api/share/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ password, revision }) }),
    );
  }
}

/** The same, for a link to one task. */
export class HttpItemShareTransport implements PublicItemTransport {
  private readonly held = new HeldPayloads<PublicItemPayload>();

  async gate(token: string): Promise<BoardShareGate> {
    return call<BoardShareGate>(`/api/share/item/${encodeURIComponent(token)}`, { method: "GET" });
  }

  async load(token: string, password: string | null): Promise<PublicItemPayload> {
    return this.held.refresh([token, password], (revision) =>
      call<RefreshReply<PublicItemPayload>>(`/api/share/item/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ password, revision }) }),
    );
  }

  async openings(token: string, password: string | null): Promise<ItemOpenings> {
    return call<ItemOpenings>(`/api/share/item/${encodeURIComponent(token)}/openings`, { method: "POST", body: JSON.stringify({ password }) });
  }
}

/** What the share routes answer: the payload and its revision, or word that the one held is still current. */
type RefreshReply<T> = (T & { revision?: string | null }) | { unchanged: true; revision: string };

/** Payloads kept for their revision: one per link and password, the latest few. */
const PAYLOADS_KEPT = 8;

/**
 * The last payload read for each link, with its revision.
 *
 * A shared page refreshes every few seconds. Sending the revision back lets
 * the route answer "unchanged" in a few bytes instead of reading the board
 * again; the payload held here is then handed back as it is, the same object,
 * so the page does not even re-render.
 */
class HeldPayloads<T extends object> {
  private readonly payloads = new Map<string, { revision: string; payload: T }>();

  async refresh(parts: unknown[], ask: (revision: string | null) => Promise<RefreshReply<T>>): Promise<T> {
    const key = JSON.stringify(parts);
    const held = this.payloads.get(key);
    let reply = await ask(held?.revision ?? null);
    if ("unchanged" in reply) {
      if (held) return held.payload;
      // Nothing held to stand for it (never expected): ask for the payload itself.
      reply = await ask(null);
      if ("unchanged" in reply) throw new Error("The link could not be read.");
    }
    const { revision, ...rest } = reply as T & { revision?: string | null };
    const payload = rest as unknown as T;
    this.payloads.delete(key);
    if (revision) {
      this.payloads.set(key, { revision, payload });
      if (this.payloads.size > PAYLOADS_KEPT) this.payloads.delete(this.payloads.keys().next().value as string);
    }
    return payload;
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
