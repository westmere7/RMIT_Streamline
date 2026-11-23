import type { BoardEditScope } from "../team/team";
import type { BoardSystemKind } from "@/domain/booking/booking";
import type { ColorToken, EntityId, Timestamps } from "@/domain/common/types";
import type { ToolbarSlot } from "./toolbar-buttons";

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
  /** The toolbar's first button and the board's own buttons for it. Missing means New item alone. */
  primaryAction?: ToolbarSlot | null;
  /** View only for everyone, against accidental change. Not a permission; a board manager turns it off. */
  viewOnly?: boolean;
  /**
   * A team's board takes its team's "who can see" and "who can edit"; off,
   * it has its own (`visibility` and `editScope`). Absent reads as following.
   * A board with no team always has its own. Migration 0123.
   */
  followsTeam?: boolean;
  /** The board's own "who can edit", while it does not follow a team. Absent reads as ADDED. */
  editScope?: BoardEditScope;
  /**
   * Where a task from another board lands (allocated, moved, booked straight
   * here): one of this board's groups. Absent or null: the top group. Never set
   * on a built-in board. Migration 0153.
   */
  landingGroupId?: EntityId | null;
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
  /**
   * INTAKE: where bookings arrive on Task Allocation (migration 0132). It can be
   * renamed, recoloured and moved, never deleted, and only the app sets it.
   */
  role?: BoardGroupRole | null;
}

export type BoardGroupRole = "INTAKE";

/** Why a task a team made cannot be moved into the intake group (the database says the same, migration 0136). */
export const INTAKE_MOVE_MESSAGE = "Only tasks booked through the form can go in Booked by Form.";

/**
 * A new order for a board's groups with Task Allocation's intake group kept
 * first: it does not move, and nothing is put above it. Other boards' orders
 * pass through as they are.
 */
export function pinIntakeFirst<G extends Pick<BoardGroup, "id" | "name" | "position"> & { role?: BoardGroupRole | null }>(orderedIds: readonly string[], groups: readonly G[], boardSystem: string | null | undefined): string[] {
  if (boardSystem !== "TASK_ALLOCATION") return [...orderedIds];
  const intake = intakeGroupOf(groups)?.id;
  if (!intake || !orderedIds.includes(intake)) return [...orderedIds];
  return [intake, ...orderedIds.filter((id) => id !== intake)];
}

/** Why a task cannot be added to the intake group by hand (the database says the same, migration 0133). */
export const INTAKE_MANUAL_MESSAGE = "Booked by Form takes only bookings from the form. Add the task to another group.";

/** What a booking is called when it arrives, and its group's name on a new Task Allocation board. */
export const INTAKE_GROUP_NAME = "Booked by Form";

/**
 * The group bookings arrive in: the one marked INTAKE, else (data from before
 * 0132, the local demo) the group called "New" or "Booked by Form", else the first.
 */
export function intakeGroupOf<G extends Pick<BoardGroup, "name" | "position"> & { role?: BoardGroupRole | null }>(groups: readonly G[]): G | null {
  const marked = groups.find((g) => g.role === "INTAKE");
  if (marked) return marked;
  const ordered = groups.slice().sort((a, b) => a.position - b.position);
  const named = ordered.find((g) => ["new", INTAKE_GROUP_NAME.toLowerCase()].includes(g.name.trim().toLowerCase()));
  return named ?? ordered[0] ?? null;
}

/**
 * The group a task arriving from another board lands in: the board's chosen
 * landing group while it is still one of its groups, else its top group. Task
 * Allocation's intake group is never a landing place (bookings reach it on
 * their own); the built-in boards have no landing group.
 */
export function landingGroupOf<G extends Pick<BoardGroup, "id" | "position"> & { role?: BoardGroupRole | null }>(board: Pick<Board, "landingGroupId" | "system">, groups: readonly G[]): G | null {
  const open = groups.filter((g) => g.role !== "INTAKE").sort((a, b) => a.position - b.position);
  const chosen = !board.system && board.landingGroupId ? open.find((g) => g.id === board.landingGroupId) : undefined;
  return chosen ?? open[0] ?? null;
}

export type BoardInput = Pick<
  Board,
  "workspaceId" | "teamId" | "name" | "description" | "type" | "visibility" | "ownerId" | "color" | "icon"
> &
  Partial<Pick<Board, "system" | "followsTeam" | "editScope">>;
