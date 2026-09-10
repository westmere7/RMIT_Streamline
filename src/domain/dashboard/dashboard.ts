import type { AssetRates } from "@/domain/workspace/asset-rate";
import type { Board, BoardGroup } from "@/domain/board/board";
import type { BoardColumn } from "@/domain/board/column";
import type { BoardShareGate, ShareRefusal } from "@/domain/board/board-share";
import type { EntityId, ISODate, ISODateTime, Timestamps } from "@/domain/common/types";
import type { Item, ItemColumnValue } from "@/domain/item/item";
import type { ItemAsset } from "@/domain/item/item-asset";
import type { ItemLink } from "@/domain/item/item-link";
import type { StakeholderDepartment } from "@/domain/portal/stakeholder-portal";
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
  /**
   * `assetRates` is how the dashboard weighs deliverables into hours. It is
   * absent from the public payload on purpose — see `publicDashboardSnapshot`.
   */
  workspace: { id: EntityId; name: string; slug: string; assetRates?: AssetRates | null };
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
  /**
   * The workspace's stakeholder departments (Settings -> Lists, via the
   * registry migration 0030).
   *
   * Carried so the dashboard can name a department by its durable identity
   * rather than by whatever a cell happens to spell today: a department that
   * was renamed keeps one row in the reporting, and a name nobody recognises
   * becomes Unknown rather than a category of one.
   */
  departments: StakeholderDepartment[];
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

/**
 * The snapshot a public link serves.
 *
 * Built field by field. The previous version spread the internal snapshot and
 * deleted a few things from it, which meant anything added to `DashboardSnapshot`
 * later was published by default — the wrong way round for a payload that leaves
 * the building. Nothing is spread here; every field is written out, and a new
 * field on a row has to be added deliberately to appear.
 *
 * A link is the same dashboard the workspace sees. It reports the same figures
 * from the same panels — the effort a rate turns deliverables into, and who is
 * carrying what — because a report that quietly leaves half of itself out is
 * read as the whole and is wrong. What a visitor is handed is therefore the
 * team's workload; that is the price of the link, and the way not to pay it is
 * not to send one.
 *
 * Two categories still never travel:
 *
 *  · **Words.** Descriptions, briefs, notes, long text and the links on a
 *    deliverable: working material, and none of it is drawn on this page. The
 *    exception is a department name, which is a category the charts group by.
 *  · **Anything not drawn.** If no chart reads a field, it is not in the payload
 *    — which is why a person arrives as a name, a face and nothing else, and
 *    `createdBy` and a board's owner stay behind.
 */
export function publicDashboardSnapshot(snapshot: DashboardSnapshot): DashboardSnapshot {
  const publishedColumns = snapshot.columns.filter(isPublishableColumn);
  const publishable = new Set(publishedColumns.map((c) => c.id));

  return {
    // The rates travel, because the effort figure is drawn from them and a
    // dashboard without it is a different dashboard. They are output rates, not
    // anybody's hours.
    workspace: { id: snapshot.workspace.id, name: snapshot.workspace.name, slug: snapshot.workspace.slug, assetRates: snapshot.workspace.assetRates ?? null },
    teams: snapshot.teams.map((team) => ({
      id: team.id,
      workspaceId: team.workspaceId,
      name: team.name,
      // A team's description is written for the team, not for a visitor.
      description: null,
      color: team.color,
      icon: team.icon,
      archivedAt: team.archivedAt,
      system: team.system,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    })),
    boards: snapshot.boards.map((board) => ({
      id: board.id,
      workspaceId: board.workspaceId,
      teamId: board.teamId,
      name: board.name,
      slug: board.slug,
      description: null,
      type: board.type,
      visibility: board.visibility,
      // Nobody owns anything in public: the owner is a person.
      ownerId: PUBLIC_NOBODY,
      color: board.color,
      icon: board.icon,
      archivedAt: board.archivedAt,
      system: board.system,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    })),
    groups: snapshot.groups.map((group) => ({
      id: group.id,
      boardId: group.boardId,
      name: group.name,
      color: group.color,
      position: group.position,
      collapsed: group.collapsed,
      createdAt: group.createdAt,
    })),
    columns: publishedColumns.map((column) => ({
      id: column.id,
      boardId: column.boardId,
      name: column.name,
      type: column.type,
      settings: column.settings,
      position: column.position,
      width: column.width,
      hidden: column.hidden,
      createdAt: column.createdAt,
    })),
    items: snapshot.items.map((item) => ({
      id: item.id,
      boardId: item.boardId,
      groupId: item.groupId,
      parentItemId: item.parentItemId,
      name: item.name,
      description: null,
      position: item.position,
      createdBy: PUBLIC_NOBODY,
      archivedAt: item.archivedAt,
      coverUrl: null,
      reference: item.reference ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    values: snapshot.values
      .filter((value) => publishable.has(value.columnId))
      .map((value) => ({ id: value.id, itemId: value.itemId, columnId: value.columnId, value: value.value, updatedAt: value.updatedAt })),
    assets: snapshot.assets.map((asset) => ({
      id: asset.id,
      itemId: asset.itemId,
      boardId: asset.boardId,
      name: asset.name,
      assetType: asset.assetType,
      quantity: asset.quantity,
      assigneeIds: asset.assigneeIds,
      dueDate: asset.dueDate,
      completedAt: asset.completedAt,
      notes: null,
      // Neither link travels. A review link is working material and a final
      // file is the team's to hand over deliberately, not by being on a page
      // somebody was sent.
      previewUrl: null,
      artworkUrl: null,
      position: asset.position,
      createdBy: PUBLIC_NOBODY,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    })),
    links: snapshot.links.map((link) => ({
      id: link.id,
      workspaceId: link.workspaceId,
      itemAId: link.itemAId,
      itemBId: link.itemBId,
      excluded: [],
      createdBy: PUBLIC_NOBODY,
      createdAt: link.createdAt,
    })),
    // A name and a face, which is what the workload rows draw. No email, no job
    // title, no department, no working hours: none of it is on the page.
    users: snapshot.users.map((user) => ({
      id: user.id,
      email: "",
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      jobTitle: null,
      department: null,
      timezone: user.timezone,
      deactivatedAt: user.deactivatedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })),
    departments: snapshot.departments.map((department) => ({
      id: department.id,
      workspaceId: department.workspaceId,
      name: department.name,
      color: department.color,
      position: department.position,
      status: department.status,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    })),
    generatedAt: snapshot.generatedAt,
  };
}

/** Stands in wherever a row needs a person and the public payload will not name one. */
const PUBLIC_NOBODY = "00000000-0000-0000-0000-000000000000";

/** The one kind of free text the charts read: which school or department asked. */
const DEPARTMENT_COLUMN_HINTS = ["department", "school", "faculty", "portfolio", "unit", "college"];

/**
 * Whether a column's values may leave the building.
 *
 * An allowlist by type. STATUS, PRIORITY, DATE, TIMELINE, TAGS, SIZE,
 * ASSETS_RECAP and STAKEHOLDER are categories and quantities the charts group
 * by, and PERSON is who is carrying the work — the workload panel is drawn from
 * it. Free text is published only where the column is plainly a department.
 */
function isPublishableColumn(column: BoardColumn): boolean {
  switch (column.type) {
    case "STATUS":
    case "PRIORITY":
    case "DATE":
    case "TIMELINE":
    case "TAGS":
    case "SIZE":
    case "ASSETS_RECAP":
    case "STAKEHOLDER":
    case "NUMBER":
    case "CHECKBOX":
    case "PERSON":
      return true;
    case "TEXT": {
      const name = column.name.toLowerCase();
      return DEPARTMENT_COLUMN_HINTS.some((hint) => name.includes(hint));
    }
    default:
      // LONG_TEXT, LINK, DEPENDENCY and anything added later.
      return false;
  }
}
