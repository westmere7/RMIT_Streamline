import type { BoardShareGate, EntityId, ItemShare, PublicItemPayload } from "@/domain";
import { generateShareToken, isPlausibleShareToken, refuseShare, toPublicUser, type ShareLike } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { hashPassword, newSalt } from "@/lib/auth/password-hash";
import { todayISO } from "@/lib/dates/dates";
import { checkShareAccess, checkSharePassword, shareAccessMessage, ShareAccessError, shareGate, type ShareSettings, type ShareViewer } from "./board-share-service";

/** How much of the task's history travels with it. */
const ITEM_ACTIVITY_LIMIT = 100;

/**
 * How a visitor's browser reaches the task behind a link. Local mode reads its
 * own IndexedDB; with Supabase both calls go to /api/share/item/<token>.
 */
export interface PublicItemTransport {
  gate(token: string): Promise<BoardShareGate>;
  load(token: string, password: string | null): Promise<PublicItemPayload>;
}

/**
 * Sharing one task by link.
 *
 * The same door as a board's link — off/on, an expiry, a password, and either
 * the whole internet or signed-in members of the workspace — around a much
 * smaller room: this task, its subitems, the columns that describe it, its
 * assets, its updates and its history. Nothing else from the board travels, so
 * a link to one brief cannot be walked back into the board it came from.
 */
export class ItemShareService {
  constructor(
    private readonly repos: Repositories,
    private readonly transport: PublicItemTransport | null = null,
  ) {}

  /** The task's link, or null when it has never been shared. */
  async get(itemId: EntityId): Promise<ItemShare | null> {
    return this.repos.itemShares.getByItem(itemId);
  }

  /** Creates the link on first use and applies whatever the dialog changed. */
  async save(itemId: EntityId, actorId: EntityId, settings: ShareSettings): Promise<ItemShare> {
    const existing = await this.repos.itemShares.getByItem(itemId);
    const passwordHash = await nextPasswordHash(existing, settings.password);
    if (!existing) {
      return this.repos.itemShares.create({
        itemId,
        token: generateShareToken(),
        enabled: settings.enabled ?? true,
        expiresAt: settings.expiresAt ?? null,
        passwordHash,
        access: settings.access ?? "PRIVATE",
        createdBy: actorId,
      });
    }
    return this.repos.itemShares.update(existing.id, {
      enabled: settings.enabled ?? existing.enabled,
      expiresAt: settings.expiresAt === undefined ? existing.expiresAt : settings.expiresAt,
      passwordHash,
      access: settings.access ?? existing.access,
    });
  }

  /** Issues a new token, which retires every copy of the old link. */
  async regenerate(itemId: EntityId, actorId: EntityId): Promise<ItemShare> {
    const existing = await this.repos.itemShares.getByItem(itemId);
    if (!existing) return this.save(itemId, actorId, { enabled: true });
    return this.repos.itemShares.update(existing.id, { token: generateShareToken() });
  }

  /** Forgets the link entirely. Sharing again later starts from a new address. */
  async remove(itemId: EntityId): Promise<void> {
    const existing = await this.repos.itemShares.getByItem(itemId);
    if (existing) await this.repos.itemShares.delete(existing.id);
  }

  async gate(token: string): Promise<BoardShareGate> {
    if (this.transport) return this.transport.gate(token);
    return gateItemShare(this.repos, token);
  }

  async load(token: string, password: string | null): Promise<PublicItemPayload> {
    if (this.transport) return this.transport.load(token, password);
    return loadSharedItem(this.repos, token, password, { userId: "local", isWorkspaceMember: true });
  }
}

async function nextPasswordHash(existing: ShareLike | null, password: string | null | undefined): Promise<string | null> {
  if (password === undefined) return existing?.passwordHash ?? null;
  if (password === null || password === "") return null;
  const salt = newSalt();
  return `${salt}:${await hashPassword(password, salt)}`;
}

/** Whether a task's link is live, and what it wants before it opens. */
export async function gateItemShare(repos: Repositories, token: string): Promise<BoardShareGate> {
  const share = isPlausibleShareToken(token) ? await repos.itemShares.getByToken(token) : null;
  return shareGate(share);
}

/**
 * One task, in the shape the board's own components read.
 *
 * The payload looks like a board's — the shared page renders it with the item
 * panel — but holds only this task and its subitems, so nothing else on the
 * board can be reached from it. The columns come along because they are what
 * the panel shows; the groups, because an item belongs to one.
 */
export async function loadSharedItem(repos: Repositories, token: string, password: string | null, viewer: ShareViewer | null): Promise<PublicItemPayload> {
  const share = isPlausibleShareToken(token) ? await repos.itemShares.getByToken(token) : null;
  const refusal = refuseShare(share, todayISO());
  if (refusal || !share) throw new ShareAccessError(refusal ?? "unknown", shareAccessMessage(refusal ?? "unknown"));
  checkShareAccess(share, viewer);
  await checkSharePassword(share, password);

  const item = await repos.items.getById(share.itemId);
  if (!item || item.archivedAt !== null) throw new ShareAccessError("unknown", shareAccessMessage("unknown"));
  const board = await repos.boards.getById(item.boardId);
  if (!board) throw new NotFoundError("Board", item.boardId);

  const [workspace, groups, columns, boardItems, assets, activities, users] = await Promise.all([
    repos.workspaces.getById(board.workspaceId),
    repos.boards.listGroups(board.id),
    repos.boards.listColumns(board.id),
    repos.items.listByBoard(board.id),
    repos.itemAssets.listByBoard(board.id),
    repos.activities.listByItem(item.id),
    repos.users.list(),
  ]);

  // The task and whatever hangs off it; nothing beside it on the board.
  const items = boardItems.filter((candidate) => candidate.id === item.id || candidate.parentItemId === item.id);
  const itemIds = new Set(items.map((i) => i.id));
  const [values, comments] = await Promise.all([repos.items.listValuesByBoard(board.id), repos.comments.listByItems([...itemIds])]);

  const shownAssets = assets.filter((asset) => itemIds.has(asset.itemId));
  const named = new Set<EntityId>([board.ownerId, item.createdBy]);
  for (const one of items) named.add(one.createdBy);
  for (const value of values) if (itemIds.has(value.itemId) && value.value.type === "PERSON") for (const id of value.value.userIds) named.add(id);
  for (const asset of shownAssets) {
    named.add(asset.createdBy);
    for (const id of asset.assigneeIds) named.add(id);
  }
  for (const comment of comments) {
    named.add(comment.authorId);
    for (const id of comment.mentionUserIds) named.add(id);
  }
  for (const entry of activities) named.add(entry.actorId);

  return {
    itemId: item.id,
    board,
    groups,
    columns,
    items,
    values: values.filter((value) => itemIds.has(value.itemId)),
    // A link to another task would name something the visitor cannot see.
    links: [],
    assets: shownAssets,
    comments,
    activities: activities.slice(0, ITEM_ACTIVITY_LIMIT),
    users: users.filter((u) => named.has(u.id)).map(toPublicUser),
    workspaceName: workspace?.name ?? "",
    expiresAt: share.expiresAt,
  };
}
