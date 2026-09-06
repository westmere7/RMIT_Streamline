import type { CompleteOnboardingInput, InvitationPreview, InviteMemberInput, WorkspaceInvitation } from "@/domain";
import type { InviteResult, OnboardingRepository } from "@/data/repositories";
import { getSupabaseClient } from "@/lib/supabase/client";
import { db, unwrapList } from "../client";
import { INVITATION_COLUMNS, toWorkspaceInvitation, type WorkspaceInvitationRow } from "../rows";

/**
 * Onboarding against Supabase.
 *
 * Creating an account, setting its password and deleting it again all need the
 * service role, so those steps go through the app's own route handlers
 * (src/app/api/**, backed by src/server/onboarding.ts). Admin calls carry the
 * caller's access token so the server can check they may manage members; the
 * join page's calls carry nothing but the token in the link, because the person
 * has no account to sign in with yet. Reading invitations back is a plain
 * PostgREST query gated by RLS to workspace admins.
 */
export class SupabaseOnboardingRepository implements OnboardingRepository {
  async invite(input: InviteMemberInput): Promise<InviteResult> {
    const { invitedBy: _invitedBy, ...body } = input;
    return call<InviteResult>("/api/invitations", { method: "POST", body: JSON.stringify(body) }, { auth: true });
  }

  async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const result = await db().from("workspace_invitations").select(INVITATION_COLUMNS).eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    return unwrapList<WorkspaceInvitationRow>(result, "workspace_invitations.list").map(toWorkspaceInvitation);
  }

  async regenerate(workspaceId: string, userId: string): Promise<WorkspaceInvitation> {
    return call<WorkspaceInvitation>("/api/invitations/regenerate", { method: "POST", body: JSON.stringify({ workspaceId, userId }) }, { auth: true });
  }

  async reinitiate(workspaceId: string, userId: string): Promise<WorkspaceInvitation> {
    return call<WorkspaceInvitation>("/api/invitations/reinitiate", { method: "POST", body: JSON.stringify({ workspaceId, userId }) }, { auth: true });
  }

  async cancel(workspaceId: string, userId: string): Promise<void> {
    await call<{ ok: true }>("/api/invitations/cancel", { method: "POST", body: JSON.stringify({ workspaceId, userId }) }, { auth: true });
  }

  async preview(token: string): Promise<InvitationPreview> {
    return call<InvitationPreview>(`/api/join/${encodeURIComponent(token)}`, { method: "GET" }, { auth: false });
  }

  async complete(input: CompleteOnboardingInput): Promise<{ email: string; userId: string }> {
    const { token, ...body } = input;
    return call<{ email: string; userId: string }>(`/api/join/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify(body) }, { auth: false });
  }
}

async function call<T>(path: string, init: RequestInit, options: { auth: boolean }): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (options.auth) {
    const { data } = await getSupabaseClient().auth.getSession();
    if (!data.session) throw new Error("Your session has expired. Sign in again to manage members.");
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
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
