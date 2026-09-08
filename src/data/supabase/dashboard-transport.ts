import type { DashboardShareGate, PublicDashboardPayload } from "@/domain";
import type { PublicDashboardTransport } from "@/services/dashboard-service";
import { ShareAccessError, type ShareFailure } from "@/services/board-share-service";

/**
 * Reading a shared dashboard against Supabase goes through the app's own route
 * handler (src/app/api/dashboard/[token]/route.ts, backed by
 * src/server/dashboard-share.ts). A visitor has no account, so the read runs
 * with the service role behind the token; the password travels in the body.
 */
export class HttpDashboardTransport implements PublicDashboardTransport {
  async gate(token: string): Promise<DashboardShareGate> {
    return call<DashboardShareGate>(`/api/dashboard/${encodeURIComponent(token)}`, { method: "GET" });
  }

  async load(token: string, password: string | null): Promise<PublicDashboardPayload> {
    return call<PublicDashboardPayload>(`/api/dashboard/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ password }) });
  }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (init.body) headers.set("Content-Type", "application/json");
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
