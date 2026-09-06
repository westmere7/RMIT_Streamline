import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Calls one of the app's own route handlers (src/app/api/**) from the browser.
 *
 * `auth: "required"` attaches the signed-in session's access token and fails
 * without one; `"optional"` attaches it when there is one (the booking form,
 * which a member fills in signed in and a stakeholder fills in without an
 * account); `"none"` sends nothing (the join page, before any account exists).
 * Errors come back as the `{ error }` body the handlers write (see
 * src/server/http.ts) and are rethrown with that message.
 */
export async function callApi<T>(path: string, init: RequestInit, options: { auth: "required" | "optional" | "none" }): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (options.auth !== "none") {
    const { data } = await getSupabaseClient().auth.getSession();
    if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
    else if (options.auth === "required") throw new Error("Your session has expired. Sign in again to manage members.");
  }
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}
