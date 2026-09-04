import type { Team, TeamInput, TeamMember, TeamRole } from "@/domain";
import type { TeamRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined, toTeam, toTeamMember, type TeamMemberRow, type TeamRow } from "../rows";

const TEAM = "id, workspace_id, name, description, color, icon, archived_at, created_at, updated_at";
const MEMBER = "id, team_id, user_id, role";

export class SupabaseTeamRepository implements TeamRepository {
  async listByWorkspace(workspaceId: string): Promise<Team[]> {
    const result = await db().from("teams").select(TEAM).eq("workspace_id", workspaceId).order("name", { ascending: true });
    return unwrapList<TeamRow>(result, "teams.listByWorkspace").map(toTeam);
  }

  async getById(id: string): Promise<Team | null> {
    const result = await db().from("teams").select(TEAM).eq("id", id).maybeSingle();
    const row = unwrapMaybe<TeamRow>(result, "teams.getById");
    return row ? toTeam(row) : null;
  }

  async create(input: TeamInput): Promise<Team> {
    const payload = {
      workspace_id: input.workspaceId,
      name: input.name,
      description: input.description,
      color: input.color,
      icon: input.icon,
    };
    const result = await db().from("teams").insert(payload).select(TEAM).single();
    return toTeam(unwrap<TeamRow>(result, "teams.create"));
  }

  async update(id: string, patch: Partial<Omit<Team, "id" | "createdAt">>): Promise<Team> {
    const payload = pruneUndefined({
      name: patch.name,
      description: patch.description,
      color: patch.color,
      icon: patch.icon,
      archived_at: patch.archivedAt,
    });
    const result = await db().from("teams").update(payload).eq("id", id).select(TEAM).single();
    return toTeam(unwrap<TeamRow>(result, "teams.update"));
  }

  /** Members cascade; boards keep existing with `team_id` set to null by the FK. */
  async delete(id: string): Promise<void> {
    assertOk(await db().from("teams").delete().eq("id", id), "teams.delete");
  }

  async listMembersByWorkspace(workspaceId: string): Promise<TeamMember[]> {
    const teams = await db().from("teams").select("id").eq("workspace_id", workspaceId);
    const ids = unwrapList<{ id: string }>(teams, "teams.listMembersByWorkspace.teams").map((t) => t.id);
    if (ids.length === 0) return [];
    const result = await db().from("team_members").select(MEMBER).in("team_id", ids);
    return unwrapList<TeamMemberRow>(result, "team_members.listMembersByWorkspace").map(toTeamMember);
  }

  async listMembers(teamId: string): Promise<TeamMember[]> {
    const result = await db().from("team_members").select(MEMBER).eq("team_id", teamId);
    return unwrapList<TeamMemberRow>(result, "team_members.listMembers").map(toTeamMember);
  }

  async addMember(teamId: string, userId: string, role: TeamRole): Promise<TeamMember> {
    const result = await db()
      .from("team_members")
      .upsert({ team_id: teamId, user_id: userId, role }, { onConflict: "team_id,user_id" })
      .select(MEMBER)
      .single();
    return toTeamMember(unwrap<TeamMemberRow>(result, "team_members.addMember"));
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    assertOk(
      await db().from("team_members").delete().eq("team_id", teamId).eq("user_id", userId),
      "team_members.removeMember",
    );
  }
}
