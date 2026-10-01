import type { BoardSystemKind } from "@/domain/booking/booking";
import type { ColorToken, EntityId, Timestamps } from "@/domain/common/types";

export const BOARD_TYPES = ["MAIN", "PRIVATE", "SHAREABLE"] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

export const BOARD_VISIBILITIES = ["WORKSPACE", "TEAM", "PRIVATE"] as const;
export type BoardVisibility = (typeof BOARD_VISIBILITIES)[number];

export const BOARD_ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

export const BOARD_VIEWS = ["table", "kanban", "timeline", "calendar", "gantt", "workload"] as const;
export type BoardViewKind = (typeof BOARD_VIEWS)[number];

/**
 * The views a board offers. Bug reports have no dates to lay out and one
 * person carrying them, so App development keeps the table, the lanes and the
 * chart; every other board has all seven.
 */
export function boardViewsFor(board: { system?: BoardSystemKind | null }): readonly BoardViewKind[] {
  return board.system === "APP_DEVELOPMENT" ? ["table", "kanban"] : BOARD_VIEWS;
}

/** What a board gives the Assets tab and the Assets recap: nothing for bug reports, which have no deliverables. */
export function boardHasDeliverables(board: { system?: BoardSystemKind | null }): boolean {
  return board.system !== "APP_DEVELOPMENT";
}

export interface Board extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  teamId: EntityId | null;
  name: string;
  slug: string;
  description: string | null;
  type: BoardType;
  visibility: BoardVisibility;
  ownerId: EntityId;
  color: ColorToken;
  /** Lucide icon name. */
  icon: string;
  archivedAt: string | null;
  /** Set when the app created the board itself (Task Allocation). Renamable, never removable, admins only. */
  system?: BoardSystemKind | null;
  /** Someone put in charge of an asset line is added to the task's PIC. Missing means on. */
  assetsFillPic?: boolean;
  /** Someone whose last asset line on a task is taken off them leaves its PIC. Missing means off. */
  assetsClearPic?: boolean;
}

/** Whether asset lines keep the PIC column up to date, and which way. */
export function picFromAssets(board: Pick<Board, "assetsFillPic" | "assetsClearPic">): { fill: boolean; clear: boolean } {
  return { fill: board.assetsFillPic ?? true, clear: board.assetsClearPic ?? false };
}

export interface BoardMember {
  id: EntityId;
  boardId: EntityId;
  userId: EntityId;
  role: BoardRole;
}

/** A task someone starred, for My Work's Starred tab. Strictly theirs. */
export interface ItemFavourite {
  id: EntityId;
  userId: EntityId;
  itemId: EntityId;
  /** The task's board, so a workspace's stars are read without the items. */
  boardId: EntityId;
  createdAt: string;
}

export interface BoardFavourite {
  id: EntityId;
  boardId: EntityId;
  userId: EntityId;
  createdAt: string;
}

export interface BoardGroup {
  id: EntityId;
  boardId: EntityId;
  name: string;
  color: ColorToken;
  position: number;
  collapsed: boolean;
  createdAt: string;
}

export type BoardInput = Pick<
  Board,
  "workspaceId" | "teamId" | "name" | "description" | "type" | "visibility" | "ownerId" | "color" | "icon"
> &
  Partial<Pick<Board, "system">>;
