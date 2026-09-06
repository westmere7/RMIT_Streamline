import type { CompleteOnboardingInput, InvitationPreview, InviteMemberInput, WorkspaceInvitation } from "@/domain";
import type { InviteResult, OnboardingRepository } from "@/data/repositories";
import { callApi } from "../api-call";
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
    return callApi<InviteResult>("/api/invitations", { method: "POST", body: JSON.stringify(body) }, { auth: "required" });
  }

  async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const result = await db().from("workspace_invitations").select(INVITATION_COLUMNS).eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    return unwrapList<WorkspaceInvitationRow>(result, "workspace_invitations.list").map(toWorkspaceInvitation);
  }

  async regenerate(workspaceId: string, userId: string): Promise<WorkspaceInvitation> {
    return callApi<WorkspaceInvitation>("/api/invitations/regenerate", { method: "POST", body: JSON.stringify({ workspaceId, userId }) }, { auth: "required" });
  }

  async reinitiate(workspaceId: string, userId: string): Promise<WorkspaceInvitation> {
    return callApi<WorkspaceInvitation>("/api/invitations/reinitiate", { method: "POST", body: JSON.stringify({ workspaceId, userId }) }, { auth: "required" });
  }

  async cancel(workspaceId: string, userId: string): Promise<void> {
    await callApi<{ ok: true }>("/api/invitations/cancel", { method: "POST", body: JSON.stringify({ workspaceId, userId }) }, { auth: "required" });
  }

  async preview(token: string): Promise<InvitationPreview> {
    return callApi<InvitationPreview>(`/api/join/${encodeURIComponent(token)}`, { method: "GET" }, { auth: "none" });
  }

  async complete(input: CompleteOnboardingInput): Promise<{ email: string; userId: string }> {
    const { token, ...body } = input;
    return callApi<{ email: string; userId: string }>(`/api/join/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify(body) }, { auth: "none" });
  }
}
