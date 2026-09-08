import type { Board, BoardGroup } from "@/domain/board/board";
import type { BoardColumn } from "@/domain/board/column";
import type { BoardShareGate, ShareRefusal } from "@/domain/board/board-share";
import type { EntityId, ISODate, ISODateTime, Timestamps } from "@/domain/common/types";
import type { Item, ItemColumnValue } from "@/domain/item/item";
import type { ItemAsset } from "@/domain/item/item-asset";
import type { ItemLink } from "@/domain/item/item-link";
import type { Team } from "@/domain/team/team";
import type { User } from "@/domain/user/user";

/**
 * The workspace dashboard: what every team delivers, in tasks and in assets,
 * across the boards a reader can see.
 *
 * Nothing here is stored. A snapshot is read straight from the boards each time
 * the page loads or a realtime event says something changed, and every figure
 * on the page is derived from it in the browser (src/features/dashboard/analytics.ts),
 * so a span or team filter never costs another request.
 */
export interface DashboardSnapshot {
  workspace: { id: EntityId; name: string; slug: string };
  teams: Team[];
  /** The boards the snapshot was read from — active ones only. */
  boards: Board[];
  groups: BoardGroup[];
  columns: BoardColumn[];
  /** Every item on those boards, subitems included; the analytics decide what counts as a task. */
  items: Item[];
  values: ItemColumnValue[];
  assets: ItemAsset[];
  /** Links between items on these boards, so a task mirrored on two boards is counted once. */
  links: ItemLink[];
  /** The people the snapshot refers to, for names and avatars. */
  users: User[];
  generatedAt: ISODateTime;
}

/**
 * The public link of a workspace's dashboard.
 *
 * Modelled on BoardShare, one per workspace: a token in the address, a switch, an
 * optional expiry and an optional password. What the link serves is a
 * DashboardSnapshot trimmed of anything personal (see publicDashboardSnapshot),
 * enough to draw every chart and nothing to read a brief from.
 */
export interface DashboardShare extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  /** The secret in the link (/dashboard/<token>). */
  token: string;
  /** Off keeps the row — and the token — but serves nothing. */
  enabled: boolean;
  /** The day after which the link stops working, or null for no expiry. */
  expiresAt: ISODate | null;
  /** "salt:hash" of the password a visitor must type, or null when there is none. */
  passwordHash: string | null;
  createdBy: EntityId;
}

export type DashboardShareInput = Pick<DashboardShare, "workspaceId" | "token" | "enabled" | "expiresAt" | "passwordHash" | "createdBy">;

/** The same door as a board link: open or not, and whether it wants a password. */
export type DashboardShareGate = BoardShareGate;

export function refuseDashboardShare(share: DashboardShare | null, today: ISODate): ShareRefusal | null {
  if (!share) return "unknown";
  if (!share.enabled) return "off";
  if (share.expiresAt && share.expiresAt < today) return "expired";
  return null;
}

/** What the public dashboard page receives: the trimmed snapshot and when the link stops working. */
export interface PublicDashboardPayload {
  snapshot: DashboardSnapshot;
  expiresAt: ISODate | null;
}

/** The one kind of free text the charts read: which school or department asked. Everything else typed into a text cell stays home. */
const DEPARTMENT_COLUMN_HINTS = ["department", "school", "faculty", "portfolio", "unit", "college"];

function isPersonalColumn(column: BoardColumn): boolean {
  if (column.type === "LONG_TEXT" || column.type === "LINK") return true;
  if (column.type !== "TEXT") return false;
  const name = column.name.toLowerCase();
  return !DEPARTMENT_COLUMN_HINTS.some((hint) => name.includes(hint));
}

/**
 * The snapshot a public link serves.
 *
 * The charts need counts, dates, statuses, types, teams and departments. They do
 * not need briefs, notes, emails, links or the names of the people who booked
 * the work, so every text cell but the department goes, along with descriptions
 * and asset notes. Members of the workspace are reduced to what an avatar needs.
 */
export function publicDashboardSnapshot(snapshot: DashboardSnapshot): DashboardSnapshot {
  const personal = new Set(snapshot.columns.filter(isPersonalColumn).map((c) => c.id));
  return {
    ...snapshot,
    items: snapshot.items.map((item) => ({ ...item, description: null, coverUrl: null })),
    values: snapshot.values.filter((v) => !personal.has(v.columnId)),
    assets: snapshot.assets.map((asset) => ({ ...asset, notes: null })),
    users: snapshot.users.map((user) => ({ ...user, email: "", jobTitle: null, department: null })),
  };
}
