import type { Activity, Board, Comment, EntityId, ISODate, Item, ItemAsset, ItemColumnValue, User } from "@/domain";
import {
  type BoardShare,
  type BoardShareGate,
  generateShareToken,
  isPlausibleShareToken,
  type PublicBoardPayload,
  refuseShare,
  type ShareRefusal,
  toPublicUser,
} from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { hashPassword, newSalt, verifyPassword } from "@/lib/auth/password-hash";
import { todayISO } from "@/lib/dates/dates";

/** How much of the board's history travels with a public payload. */
const PUBLIC_ACTIVITY_LIMIT = 200;

/** What the Share dialog sends back. An absent field is left as it is. */
export interface ShareSettings {
  enabled?: boolean;
  expiresAt?: ISODate | null;
  /** A new password, null to remove the one there is, or undefined to keep it. */
  password?: string | null;
}

export type ShareFailure = ShareRefusal | "password";

/** Why a visitor is not being shown the board. The message is written for them. */
export class ShareAccessError extends Error {
  constructor(
    readonly reason: ShareFailure,
    message: string,
  ) {
    super(message);
    this.name = "ShareAccessError";
  }
}

export function shareAccessMessage(reason: ShareFailure): string {
  switch (reason) {
    case "unknown":
      return "This link does not open anything. Check you copied all of it, or ask whoever sent it for a new one.";
    case "off":
      return "Sharing has been turned off for this board. Ask whoever sent you the link to turn it back on.";
    case "expired":
      return "This link has expired. Ask whoever sent it for a new one.";
    case "password":
      return "That password is not right.";
  }
}

/**
 * How a visitor's browser reaches the board behind a link.
 *
 * Local mode reads its own IndexedDB, so there is nothing to send anywhere. With
 * Supabase there is no session to read with, so both calls go to
 * /api/share/<token>, which does the same work with the service role.
 */
export interface PublicShareTransport {
  gate(token: string): Promise<BoardShareGate>;
  load(token: string, password: string | null): Promise<PublicBoardPayload>;
}

/**
 * Board sharing: the link a board's managers hand out, and the read that link
 * performs.
 *
 * The management half runs as the signed-in person and is guarded by the
 * board_shares policies. The visiting half is deliberately narrow: a token buys
 * one board, the items on it and the people shown on those, all read-only.
 * Nothing here writes on a visitor's behalf, so there is no way back from a
 * public link into the workspace.
 */
export class BoardShareService {
  constructor(
    private readonly repos: Repositories,
    private readonly transport: PublicShareTransport | null = null,
  ) {}

  /** The board's link, or null when it has never been shared. */
  async get(boardId: EntityId): Promise<BoardShare | null> {
    return this.repos.boardShares.getByBoard(boardId);
  }

  /**
   * Creates the link on first use and applies whatever the dialog changed. A
   * board keeps one link, so turning sharing off and on again hands back the
   * same address.
   */
  async save(boardId: EntityId, actorId: EntityId, settings: ShareSettings): Promise<BoardShare> {
    const existing = await this.repos.boardShares.getByBoard(boardId);
    const passwordHash = await this.nextPasswordHash(existing, settings.password);
    if (!existing) {
      return this.repos.boardShares.create({
        boardId,
        token: generateShareToken(),
        enabled: settings.enabled ?? true,
        expiresAt: settings.expiresAt ?? null,
        passwordHash,
        createdBy: actorId,
      });
    }
    return this.repos.boardShares.update(existing.id, {
      enabled: settings.enabled ?? existing.enabled,
      expiresAt: settings.expiresAt === undefined ? existing.expiresAt : settings.expiresAt,
      passwordHash,
    });
  }

  /** Issues a new token, which retires every copy of the old link. */
  async regenerate(boardId: EntityId, actorId: EntityId): Promise<BoardShare> {
    const existing = await this.repos.boardShares.getByBoard(boardId);
    if (!existing) return this.save(boardId, actorId, { enabled: true });
    return this.repos.boardShares.update(existing.id, { token: generateShareToken() });
  }

  /** Forgets the link entirely. Sharing again later starts from a new address. */
  async remove(boardId: EntityId): Promise<void> {
    const existing = await this.repos.boardShares.getByBoard(boardId);
    if (existing) await this.repos.boardShares.delete(existing.id);
  }

  /** What the public page can say before a password is typed. */
  async gate(token: string): Promise<BoardShareGate> {
    if (this.transport) return this.transport.gate(token);
    return gateShare(this.repos, token);
  }

  /** The board behind the link. Throws ShareAccessError when the link or the password does not hold up. */
  async load(token: string, password: string | null): Promise<PublicBoardPayload> {
    if (this.transport) return this.transport.load(token, password);
    return loadSharedBoard(this.repos, token, password);
  }

  private async nextPasswordHash(existing: BoardShare | null, password: string | null | undefined): Promise<string | null> {
    if (password === undefined) return existing?.passwordHash ?? null;
    if (password === null || password === "") return null;
    const salt = newSalt();
    return `${salt}:${await hashPassword(password, salt)}`;
  }
}

/**
 * Whether a link is live and whether it wants a password. A wrong token and a
 * switched-off one both come back closed, so the page can explain itself
 * without confirming which boards exist.
 */
export async function gateShare(repos: Repositories, token: string): Promise<BoardShareGate> {
  const share = isPlausibleShareToken(token) ? await repos.boardShares.getByToken(token) : null;
  const refusal = refuseShare(share, todayISO());
  if (refusal || !share) return { open: false, refusal: refusal ?? "unknown", needsPassword: false };
  return { open: true, refusal: null, needsPassword: !!share.passwordHash };
}

/**
 * Everything a shared board needs, in one read.
 *
 * Used by the local provider directly and by the service-role route for
 * Supabase, so a visitor sees the same thing either way. It reads one board: the
 * items on it, their assets and updates, its recent history, and the people
 * those refer to.
 */
export async function loadSharedBoard(repos: Repositories, token: string, password: string | null): Promise<PublicBoardPayload> {
  const share = await resolveShare(repos, token);
  await checkSharePassword(share, password);

  const board = await repos.boards.getById(share.boardId);
  if (!board) throw new NotFoundError("Board", share.boardId);

  const [workspace, groups, columns, items, values, assets, activities, users] = await Promise.all([
    repos.workspaces.getById(board.workspaceId),
    repos.boards.listGroups(board.id),
    repos.boards.listColumns(board.id),
    repos.items.listByBoard(board.id),
    repos.items.listValuesByBoard(board.id),
    repos.itemAssets.listByBoard(board.id),
    repos.activities.listByBoard(board.id, PUBLIC_ACTIVITY_LIMIT),
    repos.users.list(),
  ]);
  const itemIds = items.map((i) => i.id);
  const [allLinks, comments] = await Promise.all([repos.links.listByItems(itemIds), repos.comments.listByItems(itemIds)]);
  // A link to a task on another board would name something the visitor has no
  // right to see, so only links that stay inside this board travel.
  const onBoard = new Set(itemIds);
  const links = allLinks.filter((l) => onBoard.has(l.itemAId) && onBoard.has(l.itemBId));

  return {
    board,
    groups,
    columns,
    items,
    values,
    links,
    assets,
    comments,
    activities,
    users: peopleOnBoard(users, { board, items, values, assets, comments, activities }),
    workspaceName: workspace?.name ?? "",
    expiresAt: share.expiresAt,
  };
}

/**
 * The people this board actually names, trimmed to what a card shows of them.
 *
 * The workspace's directory is nobody's business at the end of a public link,
 * so only those the board points at travel: its owner, whoever is in a person
 * cell, on an asset line, behind an update or in its history.
 */
function peopleOnBoard(
  users: User[],
  board: { board: Board; items: Item[]; values: ItemColumnValue[]; assets: ItemAsset[]; comments: Comment[]; activities: Activity[] },
): User[] {
  const named = new Set<EntityId>([board.board.ownerId]);
  for (const item of board.items) named.add(item.createdBy);
  for (const value of board.values) if (value.value.type === "PERSON") for (const id of value.value.userIds) named.add(id);
  for (const asset of board.assets) {
    named.add(asset.createdBy);
    for (const id of asset.assigneeIds) named.add(id);
  }
  for (const comment of board.comments) {
    named.add(comment.authorId);
    for (const id of comment.mentionUserIds) named.add(id);
  }
  for (const activity of board.activities) named.add(activity.actorId);
  return users.filter((u) => named.has(u.id)).map(toPublicUser);
}

/** Finds the share a token names, if it is still serving. */
async function resolveShare(repos: Repositories, token: string): Promise<BoardShare> {
  const share = isPlausibleShareToken(token) ? await repos.boardShares.getByToken(token) : null;
  const refusal = refuseShare(share, todayISO());
  if (refusal || !share) throw new ShareAccessError(refusal ?? "unknown", shareAccessMessage(refusal ?? "unknown"));
  return share;
}

/** Throws unless the visitor typed the password the link was given, if it has one. */
async function checkSharePassword(share: BoardShare, password: string | null): Promise<void> {
  if (!share.passwordHash) return;
  const [salt, expected] = share.passwordHash.split(":");
  const ok = !!salt && !!expected && !!password && (await verifyPassword(password, salt, expected));
  if (!ok) throw new ShareAccessError("password", shareAccessMessage("password"));
}
