import type { Board, DashboardShare, DashboardShareGate, DashboardSnapshot, EntityId, ISODate, PublicDashboardPayload, User } from "@/domain";
import { generateShareToken, isPlausibleShareToken, publicDashboardSnapshot, refuseDashboardShare } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { hashPassword, newSalt, verifyPassword } from "@/lib/auth/password-hash";
import { todayISO } from "@/lib/dates/dates";
import { ShareAccessError } from "./board-share-service";

/** What the Share dialog sends back. An absent field is left as it is. */
export interface DashboardShareSettings {
  enabled?: boolean;
  expiresAt?: ISODate | null;
  /** A new password, null to remove the one there is, or undefined to keep it. */
  password?: string | null;
}

/**
 * How a visitor's browser reaches the dashboard behind a link. Local mode reads
 * its own IndexedDB; with Supabase both calls go to /api/dashboard/<token>,
 * which does the same work with the service role.
 */
export interface PublicDashboardTransport {
  gate(token: string): Promise<DashboardShareGate>;
  load(token: string, password: string | null): Promise<PublicDashboardPayload>;
}

/**
 * The workspace dashboard: the read every chart is built from, and the public
 * link that lets people without an account see the same charts.
 *
 * The read is one snapshot across boards. A signed-in reader gets whatever
 * boards their session can see (RLS with Supabase, the caller's board list
 * locally); a visitor gets every active board through the service role, trimmed
 * by publicDashboardSnapshot. Nothing here writes on a visitor's behalf.
 */
export class DashboardService {
  constructor(
    private readonly repos: Repositories,
    private readonly transport: PublicDashboardTransport | null = null,
  ) {}

  /** The figures behind the dashboard for the given boards, read fresh. */
  async loadSnapshot(workspaceId: EntityId, boards: Board[]): Promise<DashboardSnapshot> {
    return loadDashboardSnapshot(this.repos, workspaceId, boards);
  }

  /** The workspace's link, or null when it has never been shared. */
  async getShare(workspaceId: EntityId): Promise<DashboardShare | null> {
    return this.repos.dashboardShares.getByWorkspace(workspaceId);
  }

  /** Creates the link on first use and applies whatever the dialog changed. */
  async saveShare(workspaceId: EntityId, actorId: EntityId, settings: DashboardShareSettings): Promise<DashboardShare> {
    const existing = await this.repos.dashboardShares.getByWorkspace(workspaceId);
    const passwordHash = await this.nextPasswordHash(existing, settings.password);
    if (!existing) {
      return this.repos.dashboardShares.create({
        workspaceId,
        token: generateShareToken(),
        enabled: settings.enabled ?? true,
        expiresAt: settings.expiresAt ?? null,
        passwordHash,
        createdBy: actorId,
      });
    }
    return this.repos.dashboardShares.update(existing.id, {
      enabled: settings.enabled ?? existing.enabled,
      expiresAt: settings.expiresAt === undefined ? existing.expiresAt : settings.expiresAt,
      passwordHash,
    });
  }

  /** Issues a new token, which retires every copy of the old link. */
  async regenerateShare(workspaceId: EntityId, actorId: EntityId): Promise<DashboardShare> {
    const existing = await this.repos.dashboardShares.getByWorkspace(workspaceId);
    if (!existing) return this.saveShare(workspaceId, actorId, { enabled: true });
    return this.repos.dashboardShares.update(existing.id, { token: generateShareToken() });
  }

  /** Forgets the link entirely. Sharing again later starts from a new address. */
  async removeShare(workspaceId: EntityId): Promise<void> {
    const existing = await this.repos.dashboardShares.getByWorkspace(workspaceId);
    if (existing) await this.repos.dashboardShares.delete(existing.id);
  }

  /** What the public page can say before a password is typed. */
  async gate(token: string): Promise<DashboardShareGate> {
    if (this.transport) return this.transport.gate(token);
    return gateDashboardShare(this.repos, token);
  }

  /** The dashboard behind the link. Throws ShareAccessError when the link or the password does not hold up. */
  async loadPublic(token: string, password: string | null): Promise<PublicDashboardPayload> {
    if (this.transport) return this.transport.load(token, password);
    return loadSharedDashboard(this.repos, token, password);
  }

  private async nextPasswordHash(existing: DashboardShare | null, password: string | null | undefined): Promise<string | null> {
    if (password === undefined) return existing?.passwordHash ?? null;
    if (password === null || password === "") return null;
    const salt = newSalt();
    return `${salt}:${await hashPassword(password, salt)}`;
  }
}

/**
 * Reads the boards' groups, columns, items, values and asset lines in parallel,
 * plus the links between those items and the people they name. One round of
 * requests per board; the boards a workspace has are few and the reads are
 * independent, so they all go at once.
 */
export async function loadDashboardSnapshot(repos: Repositories, workspaceId: EntityId, boards: Board[]): Promise<DashboardSnapshot> {
  const active = boards.filter((b) => b.workspaceId === workspaceId && b.archivedAt === null);
  const [workspace, teams, users, perBoard] = await Promise.all([
    repos.workspaces.getById(workspaceId),
    repos.teams.listByWorkspace(workspaceId),
    repos.users.list(),
    Promise.all(
      active.map(async (board) => {
        const [groups, columns, items, values, assets] = await Promise.all([
          repos.boards.listGroups(board.id),
          repos.boards.listColumns(board.id),
          repos.items.listByBoard(board.id),
          repos.items.listValuesByBoard(board.id),
          repos.itemAssets.listByBoard(board.id),
        ]);
        return { groups, columns, items, values, assets };
      }),
    ),
  ]);
  if (!workspace) throw new NotFoundError("Workspace", workspaceId);
  const items = perBoard.flatMap((b) => b.items);
  // One read for the workspace's links rather than a query per two hundred item ids: a
  // whole workspace's ids do not fit in a request URL.
  const onBoards = new Set(items.map((i) => i.id));
  const links = (await repos.links.listByWorkspace(workspaceId)).filter((l) => onBoards.has(l.itemAId) && onBoards.has(l.itemBId));
  return {
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    teams: teams.filter((t) => t.archivedAt === null),
    boards: active,
    groups: perBoard.flatMap((b) => b.groups),
    columns: perBoard.flatMap((b) => b.columns),
    items,
    values: perBoard.flatMap((b) => b.values),
    assets: perBoard.flatMap((b) => b.assets),
    links,
    users: peopleInSnapshot(users, { boards: active, items, values: perBoard.flatMap((b) => b.values), assets: perBoard.flatMap((b) => b.assets) }),
    generatedAt: new Date().toISOString(),
  };
}

/** Only the people the boards actually name travel with the snapshot. */
function peopleInSnapshot(users: User[], scope: Pick<DashboardSnapshot, "boards" | "items" | "values" | "assets">): User[] {
  const named = new Set<string>();
  for (const board of scope.boards) named.add(board.ownerId);
  for (const item of scope.items) named.add(item.createdBy);
  for (const value of scope.values) if (value.value.type === "PERSON") for (const id of value.value.userIds) named.add(id);
  for (const asset of scope.assets) for (const id of asset.assigneeIds) named.add(id);
  return users.filter((u) => named.has(u.id));
}

/** Whether a link is live and whether it wants a password. Says nothing about the workspace. */
export async function gateDashboardShare(repos: Repositories, token: string): Promise<DashboardShareGate> {
  const share = isPlausibleShareToken(token) ? await repos.dashboardShares.getByToken(token) : null;
  const refusal = refuseDashboardShare(share, todayISO());
  if (refusal || !share) return { open: false, refusal: refusal ?? "unknown", needsPassword: false };
  return { open: true, refusal: null, needsPassword: !!share.passwordHash };
}

/**
 * Everything the public dashboard needs, in one read: the snapshot over every
 * active board of the workspace, trimmed of anything personal. Used by the local
 * provider directly and by the service-role route for Supabase.
 */
export async function loadSharedDashboard(repos: Repositories, token: string, password: string | null): Promise<PublicDashboardPayload> {
  const share = isPlausibleShareToken(token) ? await repos.dashboardShares.getByToken(token) : null;
  const refusal = refuseDashboardShare(share, todayISO());
  if (refusal || !share) throw new ShareAccessError(refusal ?? "unknown", refusalMessage(refusal ?? "unknown"));
  if (share.passwordHash) {
    const [salt, hash] = share.passwordHash.split(":");
    const ok = password !== null && !!salt && !!hash && (await verifyPassword(password, salt, hash));
    if (!ok) throw new ShareAccessError("password", "That password is not right.");
  }
  const boards = await repos.boards.listByWorkspace(share.workspaceId);
  const snapshot = await loadDashboardSnapshot(repos, share.workspaceId, boards);
  return { snapshot: publicDashboardSnapshot(snapshot), expiresAt: share.expiresAt };
}

function refusalMessage(reason: "unknown" | "off" | "expired"): string {
  switch (reason) {
    case "off":
      return "Sharing has been turned off for this dashboard. Ask whoever sent you the link to turn it back on.";
    case "expired":
      return "This link has expired. Ask whoever sent it for a new one.";
    default:
      return "This link does not open anything. Check you copied all of it, or ask whoever sent it for a new one.";
  }
}
