import type { Workspace, WorkspaceMember } from "@/domain";
import type { WorkspaceRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";
import { ALL_STORES, type StoreName, type StreamlineDatabase } from "../database";

/** Where the Owners are kept: one meta record holding their ids, as JSON. */
const OWNERS_KEY = "appOwners";

/** The messages the database raises for the same refusals, so both providers read alike. */
export const OWNER_RULES = {
  onlyOwnersHoldOwner: "Only Owners hold the Owner role. Make them an Owner from Members instead.",
  ownerSeatIsFixed: "This person is an Owner. Remove them as an Owner before changing their access.",
  ownerCannotLeave: "This person is an Owner. Remove them as an Owner before taking them out of a workspace.",
  keepOneOwner: "There must always be at least one Owner. Make somebody else an Owner first.",
  notOnboarded: "Only somebody who has finished onboarding can be made an Owner.",
  deactivated: "A deactivated person cannot be made an Owner.",
  keepOneWorkspace: "The last workspace cannot be deleted.",
} as const;

/**
 * The Owners. A database seeded or written before Owners existed has no record
 * yet, and gets one from its active OWNER memberships: the same backfill the
 * Supabase migration does.
 */
async function readOwners(db: StreamlineDatabase): Promise<string[]> {
  const stored = await db.get("meta", OWNERS_KEY);
  if (stored) return JSON.parse(stored.value) as string[];
  const members = await db.getAll("workspaceMembers");
  const owners = [...new Set(members.filter((m) => m.role === "OWNER" && m.status === "ACTIVE").map((m) => m.userId))];
  await db.put("meta", { key: OWNERS_KEY, value: JSON.stringify(owners) });
  return owners;
}

async function writeOwners(db: StreamlineDatabase, owners: readonly string[]): Promise<void> {
  await db.put("meta", { key: OWNERS_KEY, value: JSON.stringify([...new Set(owners)]) });
}

/** Seats every Owner in the workspace as an active OWNER, keeping the seat any of them already had. */
async function seatOwners(db: StreamlineDatabase, workspaceId: string, owners: readonly string[]): Promise<void> {
  const members = await db.getAllFromIndex("workspaceMembers", "byWorkspace", workspaceId);
  for (const userId of owners) {
    const existing = members.find((m) => m.userId === userId);
    if (existing) await db.put("workspaceMembers", { ...existing, role: "OWNER", status: "ACTIVE" });
    else await db.put("workspaceMembers", { id: newId(), workspaceId, userId, role: "OWNER", status: "ACTIVE", joinedAt: nowIso() });
  }
}

/** The ids of a store's rows that name `key` from `parents`. */
async function idsUnder(db: StreamlineDatabase, store: StoreName, key: string, parents: ReadonlySet<string>): Promise<Set<string>> {
  const rows = (await db.getAll(store)) as unknown as Array<Record<string, unknown>>;
  return new Set(rows.filter((row) => typeof row[key] === "string" && parents.has(row[key] as string)).map((row) => row.id as string));
}

export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly conn: LocalConnection) {}

  async list(): Promise<Workspace[]> {
    const db = await this.conn.getDb();
    return db.getAll("workspaces");
  }

  async getById(id: string): Promise<Workspace | null> {
    const db = await this.conn.getDb();
    return (await db.get("workspaces", id)) ?? null;
  }

  async getBySlug(slug: string): Promise<Workspace | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("workspaces", "bySlug", slug)) ?? null;
  }

  async update(id: string, patch: Partial<Omit<Workspace, "id" | "createdAt">>): Promise<Workspace> {
    const db = await this.conn.getDb();
    const existing = await db.get("workspaces", id);
    if (!existing) throw new NotFoundError("Workspace", id);
    const updated: Workspace = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("workspaces", updated);
    return updated;
  }

  async create(input: { name: string; slug: string }): Promise<Workspace> {
    const db = await this.conn.getDb();
    if (await db.getFromIndex("workspaces", "bySlug", input.slug)) throw new Error(`A workspace already uses the address "${input.slug}".`);
    const now = nowIso();
    const workspace: Workspace = { id: newId(), name: input.name, slug: input.slug, logoUrl: null, createdAt: now, updatedAt: now };
    await db.put("workspaces", workspace);
    await seatOwners(db, workspace.id, await readOwners(db));
    return workspace;
  }

  /**
   * Everything that belongs to the workspace goes with it: what names it
   * directly, and what hangs off its boards, items, comments, teams, trackers,
   * rules and portals. The people stay; they are the directory's.
   */
  async delete(id: string, confirmName: string): Promise<void> {
    const db = await this.conn.getDb();
    const found = await db.get("workspaces", id);
    if (!found) throw new NotFoundError("Workspace", id);
    if (confirmName.trim() !== found.name.trim()) throw new Error("Type the workspace's name exactly to delete it");
    if ((await db.count("workspaces")) <= 1) throw new Error(OWNER_RULES.keepOneWorkspace);
    const workspace = new Set([id]);
    const boards = await idsUnder(db, "boards", "workspaceId", workspace);
    const items = await idsUnder(db, "items", "boardId", boards);
    const parents: Array<[StoreName, string, Set<string>]> = [
      ["workspaces", "workspaceId", workspace],
      ["boards", "boardId", boards],
      ["items", "itemId", items],
      ["comments", "commentId", await idsUnder(db, "comments", "itemId", items)],
      ["teams", "teamId", await idsUnder(db, "teams", "workspaceId", workspace)],
      ["trackers", "trackerId", await idsUnder(db, "trackers", "workspaceId", workspace)],
      ["automationRules", "ruleId", await idsUnder(db, "automationRules", "workspaceId", workspace)],
      ["departmentPortals", "portalId", await idsUnder(db, "departmentPortals", "workspaceId", workspace)],
    ];
    const keep = new Set<StoreName>(["users", "credentials", "notificationPreferences", "meta"]);
    for (const store of ALL_STORES) {
      if (keep.has(store)) continue;
      const own = parents.find(([name]) => name === store)?.[2];
      const tx = db.transaction(store, "readwrite");
      let cursor = await tx.store.openCursor();
      while (cursor) {
        const row = cursor.value as unknown as Record<string, unknown>;
        const gone = (own?.has(row.id as string) ?? false) || parents.some(([, key, ids]) => typeof row[key] === "string" && ids.has(row[key] as string));
        if (gone) await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    }
  }

  /** The same removal the server does (src/server/snapshots.ts, removePerson), inside IndexedDB. */
  async removePerson(input: { workspaceId: string; userId: string; handTo: string; confirmName: string }): Promise<void> {
    const db = await this.conn.getDb();
    const { userId, handTo } = input;
    const user = await db.get("users", userId);
    if (!user) throw new NotFoundError("User", userId);
    if (input.confirmName.trim() !== user.displayName.trim()) throw new Error("Type their name exactly to remove them.");
    const owners = await readOwners(db);
    if (owners.includes(userId)) throw new Error(`${user.displayName} is an Owner. Remove them as an Owner first.`);
    if (userId === handTo) throw new Error("You cannot remove yourself.");
    const seats = await db.getAllFromIndex("workspaceMembers", "byUser", userId);
    if (!seats.some((s) => s.workspaceId === input.workspaceId)) throw new Error("That person is not in this workspace.");
    if (!owners.includes(handTo) && seats.some((s) => s.workspaceId !== input.workspaceId)) {
      throw new Error(`${user.displayName} is in another workspace too. Only an Owner can remove them completely; you can deactivate them here.`);
    }

    // Their work stays, and is the remover's now.
    const handOver: Array<[StoreName, string]> = [
      ["items", "createdBy"],
      ["boards", "ownerId"],
      ["itemAssets", "createdBy"],
      ["trackers", "createdBy"],
      ["bookingTemplates", "createdBy"],
      ["boardTemplates", "createdBy"],
      ["savedViews", "createdBy"],
      ["bookingSavedBlocks", "createdBy"],
      ["automationRules", "createdBy"],
      ["boardShares", "createdBy"],
      ["itemShares", "createdBy"],
      ["dashboardShares", "createdBy"],
      ["itemLinks", "createdBy"],
    ];
    for (const [store, field] of handOver) {
      for (const row of (await db.getAll(store)) as unknown as Array<Record<string, unknown>>) {
        if (row[field] === userId) await db.put(store, { ...row, [field]: handTo } as never);
      }
    }
    // Off every people cell and deliverable.
    for (const value of await db.getAll("itemColumnValues")) {
      const v = value.value as { userIds?: string[] };
      if (Array.isArray(v.userIds) && v.userIds.includes(userId)) await db.put("itemColumnValues", { ...value, value: { ...value.value, userIds: v.userIds.filter((id) => id !== userId) } as never });
    }
    for (const asset of await db.getAll("itemAssets")) {
      if (asset.assigneeIds?.includes(userId)) await db.put("itemAssets", { ...asset, assigneeIds: asset.assigneeIds.filter((id) => id !== userId) });
    }
    // Their history goes: their updates (and the replies under them), and their reactions on anybody's.
    const comments = await db.getAll("comments");
    const gone = new Set(comments.filter((c) => c.authorId === userId).map((c) => c.id));
    for (const c of comments) if (c.parentId && gone.has(c.parentId)) gone.add(c.id);
    for (const c of comments) {
      if (gone.has(c.id)) await db.delete("comments", c.id);
      else if (c.reactions?.some((r) => r.userId === userId)) await db.put("comments", { ...c, reactions: c.reactions.filter((r) => r.userId !== userId) });
    }
    const byField: Array<[StoreName, string[]]> = [
      ["activities", ["actorId"]],
      ["notifications", ["userId", "actorId"]],
      ["directMessages", ["senderId", "recipientId"]],
      ["itemReads", ["userId"]],
      ["boardFavourites", ["userId"]],
      ["boardVisits", ["userId"]],
      ["boardMembers", ["userId"]],
      ["teamMembers", ["userId"]],
      ["workspaceMembers", ["userId"]],
      ["workspaceInvitations", ["userId"]],
    ];
    for (const [store, fields] of byField) {
      const tx = db.transaction(store, "readwrite");
      let cursor = await tx.store.openCursor();
      while (cursor) {
        const row = cursor.value as unknown as Record<string, unknown>;
        if (fields.some((f) => row[f] === userId)) await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    }
    await db.delete("notificationPreferences", userId).catch(() => undefined);
    await db.delete("credentials", userId).catch(() => undefined);
    await db.delete("users", userId);
  }

  async listOwners(): Promise<string[]> {
    return readOwners(await this.conn.getDb());
  }

  async listDirectory(): Promise<string[]> {
    const db = await this.conn.getDb();
    return [...new Set((await db.getAll("workspaceMembers")).filter((m) => m.status === "ACTIVE").map((m) => m.userId))];
  }

  async addOwner(userId: string): Promise<void> {
    const db = await this.conn.getDb();
    const owners = await readOwners(db);
    if (owners.includes(userId)) return;
    const user = await db.get("users", userId);
    if (!user) throw new NotFoundError("User", userId);
    if (user.deactivatedAt) throw new Error(OWNER_RULES.deactivated);
    const memberships = await db.getAllFromIndex("workspaceMembers", "byUser", userId);
    if (!memberships.some((m) => m.status === "ACTIVE")) throw new Error(OWNER_RULES.notOnboarded);
    await writeOwners(db, [...owners, userId]);
    for (const workspace of await db.getAll("workspaces")) await seatOwners(db, workspace.id, [userId]);
  }

  async removeOwner(userId: string): Promise<void> {
    const db = await this.conn.getDb();
    const owners = await readOwners(db);
    if (!owners.includes(userId)) return;
    if (owners.length <= 1) throw new Error(OWNER_RULES.keepOneOwner);
    await writeOwners(db, owners.filter((id) => id !== userId));
    for (const member of await db.getAllFromIndex("workspaceMembers", "byUser", userId)) {
      if (member.role === "OWNER") await db.put("workspaceMembers", { ...member, role: "MEMBER" });
    }
  }

  /** The booking counter, bumped inside one transaction like the ticket counter below. */
  async countFormBooking(workspaceId: string): Promise<void> {
    const db = await this.conn.getDb();
    const tx = db.transaction("workspaces", "readwrite");
    const existing = await tx.store.get(workspaceId);
    if (existing) await tx.store.put({ ...existing, bookingFormBookings: (existing.bookingFormBookings ?? 0) + 1 });
    await tx.done;
  }

  /**
   * The same bargain as the Supabase provider, inside one IndexedDB
   * transaction: read the counter, add to it and write it back with nothing
   * able to interleave. One browser tab is the whole world here, but the rule
   * this upholds is the same one.
   */
  async allocateTicketNumbers(workspaceId: string, count = 1): Promise<number> {
    if (count < 1) throw new Error("workspaces.allocateTicketNumbers: count must be at least 1");
    const db = await this.conn.getDb();
    const tx = db.transaction("workspaces", "readwrite");
    const existing = await tx.store.get(workspaceId);
    if (!existing) {
      await tx.done;
      throw new NotFoundError("Workspace", workspaceId);
    }
    const taken = (existing.ticketCounter ?? 0) + count;
    await tx.store.put({ ...existing, ticketCounter: taken, updatedAt: nowIso() });
    await tx.done;
    return taken - count + 1;
  }

  async allocateBugTicketNumbers(workspaceId: string, count = 1): Promise<number> {
    if (count < 1) throw new Error("workspaces.allocateBugTicketNumbers: count must be at least 1");
    const db = await this.conn.getDb();
    const tx = db.transaction("workspaces", "readwrite");
    const existing = await tx.store.get(workspaceId);
    if (!existing) {
      await tx.done;
      throw new NotFoundError("Workspace", workspaceId);
    }
    const taken = (existing.bugTicketCounter ?? 0) + count;
    await tx.store.put({ ...existing, bugTicketCounter: taken, updatedAt: nowIso() });
    await tx.done;
    return taken - count + 1;
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const db = await this.conn.getDb();
    return db.getAllFromIndex("workspaceMembers", "byWorkspace", workspaceId);
  }

  async listMembershipsForUser(userId: string): Promise<WorkspaceMember[]> {
    const db = await this.conn.getDb();
    return db.getAllFromIndex("workspaceMembers", "byUser", userId);
  }

  async addMember(input: Omit<WorkspaceMember, "id">): Promise<WorkspaceMember> {
    const db = await this.conn.getDb();
    if (input.role === "OWNER" && !(await readOwners(db)).includes(input.userId)) throw new Error(OWNER_RULES.onlyOwnersHoldOwner);
    const member: WorkspaceMember = { ...input, id: newId() };
    await db.put("workspaceMembers", member);
    return member;
  }

  async updateMember(id: string, patch: Partial<Omit<WorkspaceMember, "id">>): Promise<WorkspaceMember> {
    const db = await this.conn.getDb();
    const existing = await db.get("workspaceMembers", id);
    if (!existing) throw new NotFoundError("WorkspaceMember", id);
    const updated: WorkspaceMember = { ...existing, ...patch, id };
    const owners = await readOwners(db);
    if (updated.role === "OWNER" && !owners.includes(updated.userId)) throw new Error(OWNER_RULES.onlyOwnersHoldOwner);
    if (owners.includes(existing.userId) && (updated.role !== "OWNER" || updated.status !== "ACTIVE" || updated.userId !== existing.userId || updated.workspaceId !== existing.workspaceId)) {
      throw new Error(OWNER_RULES.ownerSeatIsFixed);
    }
    await db.put("workspaceMembers", updated);
    return updated;
  }

  async removeMember(id: string): Promise<void> {
    const db = await this.conn.getDb();
    const existing = await db.get("workspaceMembers", id);
    if (existing && (await readOwners(db)).includes(existing.userId)) throw new Error(OWNER_RULES.ownerCannotLeave);
    await db.delete("workspaceMembers", id);
  }
}
