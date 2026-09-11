import type { BookingForm, BookingReceipt, BookingRequest, PortalContext, PortalGate, PortalScope, PortalTaskDetail, PortalTaskPage, PortalBoardPayload } from "@/domain";
import { formatPortalRange } from "@/domain";
import type { PortalGrant, PortalTransport } from "@/services/stakeholder-portal-service";
import { PortalAccessError } from "@/services/stakeholder-portal-service";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Reading a department's portal against Supabase goes through the app's own
 * route handlers (src/app/api/portal, backed by src/server/portal.ts).
 *
 * A stakeholder has no account, so there is no session for row level security
 * to judge and the read runs with the service role behind the token instead.
 * The token, the password and the credential version travel in the body rather
 * than the query string, so none of them reaches a server log, a browser
 * history entry or a referrer header.
 */
export class HttpPortalTransport implements PortalTransport {
  async gate(token: string): Promise<PortalGate> {
    return call<PortalGate>(`/api/portal/${encodeURIComponent(token)}`, { method: "GET" });
  }

  async board(grant: PortalGrant, scope: PortalScope): Promise<PortalBoardPayload & { context: PortalContext }> {
    return call(`/api/portal/${encodeURIComponent(grant.token)}/board`, { method: "POST", body: JSON.stringify({ ...body(grant), ...wire(scope) }) });
  }

  async tasks(grant: PortalGrant, options: { cursor?: string | null; limit?: number; search?: string; scope?: PortalScope }): Promise<PortalTaskPage & { context: PortalContext }> {
    const { scope, ...rest } = options;
    return call(`/api/portal/${encodeURIComponent(grant.token)}/tasks`, { method: "POST", body: JSON.stringify({ ...body(grant), ...rest, ...(scope ? wire(scope) : {}) }) });
  }

  async task(grant: PortalGrant, itemId: string): Promise<PortalTaskDetail> {
    return call<PortalTaskDetail>(`/api/portal/${encodeURIComponent(grant.token)}/tasks/${encodeURIComponent(itemId)}`, { method: "POST", body: JSON.stringify(body(grant)) });
  }

  async bookingForm(grant: PortalGrant): Promise<BookingForm> {
    return call<BookingForm>(`/api/portal/${encodeURIComponent(grant.token)}/book`, { method: "PUT", body: JSON.stringify(body(grant)) });
  }

  async book(grant: PortalGrant, submissionKey: string, request: BookingRequest, departmentId: string): Promise<BookingReceipt> {
    return call<BookingReceipt>(`/api/portal/${encodeURIComponent(grant.token)}/book`, {
      method: "POST",
      body: JSON.stringify({ ...body(grant), submissionKey, request, departmentId }),
    });
  }

  async comment(grant: PortalGrant, itemId: string, text: string): Promise<void> {
    await call(`/api/portal/${encodeURIComponent(grant.token)}/comments`, { method: "POST", body: JSON.stringify({ ...body(grant), itemId, body: text }) });
  }

  async setDeliverableDone(grant: PortalGrant, itemId: string, assetId: string, done: boolean): Promise<void> {
    await call(`/api/portal/${encodeURIComponent(grant.token)}/assets`, {
      method: "POST",
      body: JSON.stringify({ ...body(grant), itemId, assetId, patch: { completedAt: done ? new Date().toISOString() : null } }),
    });
  }
}

/** The scope as it travels: the range goes as its short string, not as an object. */
function wire(scope: PortalScope) {
  return { stakeholderId: scope.stakeholderId, range: formatPortalRange(scope.range) };
}

/** Only the grant travels; `viewer` is deliberately not sent — the server decides who you are. */
function body(grant: PortalGrant) {
  return { password: grant.password, credentialVersion: grant.credentialVersion };
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (init.body) headers.set("Content-Type", "application/json");
  // A stakeholder has no session; a member of staff reading their department's
  // portal does, and it is what lets them comment or tick a deliverable off.
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  } catch {
    // No Supabase client configured; the portal is then read anonymously.
  }

  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (response.ok) return parsed as T;

  const shaped = (parsed ?? {}) as { error?: unknown };
  const message = typeof shaped.error === "string" ? shaped.error : `Request failed (${response.status})`;
  // 401 is the one refusal the page acts on: ask for the password again.
  // Everything else says the same thing whether the token is wrong, closed, or
  // another department's.
  throw new PortalAccessError(response.status === 401 ? "password" : "unknown", message);
}
