import type { Board, BoardGroup } from "@/domain/board/board";
import type { BoardColumn } from "@/domain/board/column";
import type { EntityId, ISODate, Timestamps } from "@/domain/common/types";
import type { Activity } from "@/domain/activity/activity";
import type { Comment } from "@/domain/comment/comment";
import type { Item, ItemColumnValue } from "@/domain/item/item";
import type { ItemAsset } from "@/domain/item/item-asset";
import type { ItemLink } from "@/domain/item/item-link";
import type { User } from "@/domain/user/user";

/**
 * Who a link opens for.
 *
 * "PUBLIC" is the internet: anyone holding the link, with no account at all.
 * "PRIVATE" is the workspace: the visitor must be signed in as one of its
 * members, though not necessarily a member of the board — which is the point,
 * since it is how work is shown to a colleague who is not on it.
 */
export const SHARE_ACCESS = ["PUBLIC", "PRIVATE"] as const;
export type ShareAccess = (typeof SHARE_ACCESS)[number];

/**
 * A board shared by link.
 *
 * One link per board, and it is read-only: whoever opens it sees the board in
 * any of its views and can open an item, but cannot change a thing and cannot
 * reach anything else in the workspace. The link can be given an expiry date, a
 * password, or both, it opens either to the workspace or to the internet, and
 * it can be switched off or replaced at any time.
 *
 * The token is the only secret. Nothing about the board is served until the
 * token matches a share that is on, unexpired, past its password, and — when it
 * is private — read by a signed-in member of the workspace.
 */
export interface BoardShare extends Timestamps {
  id: EntityId;
  boardId: EntityId;
  /** The secret in the link (/share/<token>). */
  token: string;
  /** Off keeps the row — and the token — but serves nothing. */
  enabled: boolean;
  /** The day after which the link stops working, or null for no expiry. */
  expiresAt: ISODate | null;
  /** "salt:hash" of the password a visitor must type, or null when there is none. */
  passwordHash: string | null;
  /** Whether the link opens for anyone or only for signed-in members. */
  access: ShareAccess;
  createdBy: EntityId;
}

export type BoardShareInput = Pick<BoardShare, "boardId" | "token" | "enabled" | "expiresAt" | "passwordHash" | "access" | "createdBy">;

/**
 * One task shared by link, on the same terms as a board.
 *
 * A task is the smaller thing to hand over — a printer, an agency or a colleague
 * on another team needs this brief and its deliverables, not the board it sits
 * on. What travels is the task itself, its subitems, the columns that describe
 * it, its assets, its updates and its history: nothing else from the board.
 */
export interface ItemShare extends Timestamps {
  id: EntityId;
  itemId: EntityId;
  /** The secret in the link (/share/item/<token>). */
  token: string;
  enabled: boolean;
  expiresAt: ISODate | null;
  passwordHash: string | null;
  access: ShareAccess;
  createdBy: EntityId;
}

export type ItemShareInput = Pick<ItemShare, "itemId" | "token" | "enabled" | "expiresAt" | "passwordHash" | "access" | "createdBy">;

/** What both kinds of link have in common, and all the gate needs to judge one. */
export type ShareLike = Pick<BoardShare, "enabled" | "expiresAt" | "passwordHash" | "access">;

export const BOARD_SHARE_TOKEN_LENGTH = 22;

/** No look-alike characters: these links get read aloud and typed by hand. */
const TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function generateShareToken(): string {
  const bytes = new Uint8Array(BOARD_SHARE_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

export function isPlausibleShareToken(value: string): boolean {
  return /^[a-z0-9]{16,64}$/.test(value);
}

/**
 * Why a link is not serving what it names, or null when it is. A password is
 * asked for separately; "signin" means the link is private and whoever opened
 * it is not signed in as a member of the workspace.
 */
export type ShareRefusal = "unknown" | "off" | "expired" | "signin";

export function refuseShare(share: ShareLike | null, today: ISODate): ShareRefusal | null {
  if (!share) return "unknown";
  if (!share.enabled) return "off";
  if (share.expiresAt && share.expiresAt < today) return "expired";
  return null;
}

/** What a visitor is told before they are let in: enough to explain the door, nothing about what is behind it. */
export interface BoardShareGate {
  /** True when the token names a share that is on and unexpired. */
  open: boolean;
  refusal: ShareRefusal | null;
  /** Whether a password stands between the visitor and the board. */
  needsPassword: boolean;
  /** Whether the link wants a signed-in member rather than anyone at all. */
  access: ShareAccess;
}

/**
 * Everything the public page renders, gathered in one response: no session, no
 * second request, and nothing beyond this board. People are trimmed to what a
 * card or an avatar needs.
 */
export interface PublicBoardPayload {
  board: Board;
  groups: BoardGroup[];
  columns: BoardColumn[];
  items: Item[];
  values: ItemColumnValue[];
  links: ItemLink[];
  assets: ItemAsset[];
  comments: Comment[];
  activities: Activity[];
  users: User[];
  /** The workspace's name, for the page's own header. Nothing else of it travels. */
  workspaceName: string;
  /** When the link stops working, so the page can say so. */
  expiresAt: ISODate | null;
}

/**
 * One task behind a link. The same shape as a shared board — the page renders it
 * with the board's own components — narrowed to that task and its subitems, with
 * the one it is about named.
 */
export interface PublicItemPayload extends PublicBoardPayload {
  itemId: EntityId;
}

/** Strips a person down to what a shared board shows of them. */
export function toPublicUser(user: User): User {
  return { ...user, email: "" };
}
