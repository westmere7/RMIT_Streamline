import type { Team, TeamInput, TeamMember, TeamRole } from "@/domain";
import type { TeamRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalTeamRepository implements TeamRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByWorkspace(workspaceId: string): Promise<Team[]> {
    const db = await this.conn.getDb();
    const teams = await db.getAllFromIndex("teams", "byWorkspace", workspaceId);
    return teams.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(id: string): Promise<Team | null> {
    const db = await this.conn.getDb();
    return (await db.get("teams", id)) ?? null;
  }

  async create(input: TeamInput): Promise<Team> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const team: Team = { ...input, id: newId(), archivedAt: null, createdAt: now, updatedAt: now };
    await db.put("teams", team);
    return team;
  }

  async update(id: string, patch: Partial<Omit<Team, "id" | "createdAt">>): Promise<Team> {
    const db = await this.conn.getDb();
    const existing = await db.get("teams", id);
    if (!existing) throw new NotFoundError("Team", id);
    const updated: Team = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("teams", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    const tx = db.transaction(["teams", "teamMembers", "boards"], "readwrite");
    const members = await tx.objectStore("teamMembers").index("byTeam").getAllKeys(id);
    await Promise.all(members.map((key) => tx.objectStore("teamMembers").delete(key)));
    // Boards keep existing but become unassigned from the team.
    const boards = await tx.objectStore("boards").getAll();
    await Promise.all(
      boards.filter((b) => b.teamId === id).map((b) => tx.objectStore("boards").put({ ...b, teamId: null })),
    );
    await tx.objectStore("teams").delete(id);
    await tx.done;
  }

  async listMembersByWorkspace(workspaceId: string): Promise<TeamMember[]> {
    const db = await this.conn.getDb();
    const teams = await db.getAllFromIndex("teams", "byWorkspace", workspaceId);
    const teamIds = new Set(teams.map((t) => t.id));
    const all = await db.getAll("teamMembers");
    return all.filter((m) => teamIds.has(m.teamId));
  }

  async listMembers(teamId: string): Promise<TeamMember[]> {
    const db = await this.conn.getDb();
    return db.getAllFromIndex("teamMembers", "byTeam", teamId);
  }

  async addMember(teamId: string, userId: string, role: TeamRole): Promise<TeamMember> {
    const db = await this.conn.getDb();
    const existing = (await db.getAllFromIndex("teamMembers", "byTeam", teamId)).find((m) => m.userId === userId);
    if (existing) {
      const updated = { ...existing, role };
      await db.put("teamMembers", updated);
      return updated;
    }
    const member: TeamMember = { id: newId(), teamId, userId, role };
    await db.put("teamMembers", member);
    return member;
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const db = await this.conn.getDb();
    const members = await db.getAllFromIndex("teamMembers", "byTeam", teamId);
    await Promise.all(members.filter((m) => m.userId === userId).map((m) => db.delete("teamMembers", m.id)));
  }
}
