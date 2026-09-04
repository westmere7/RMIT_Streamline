import type { ColorToken, EntityId, Timestamps } from "@/domain/common/types";

export const BOARD_TYPES = ["MAIN", "PRIVATE", "SHAREABLE"] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

export const BOARD_VISIBILITIES = ["WORKSPACE", "TEAM", "PRIVATE"] as const;
export type BoardVisibility = (typeof BOARD_VISIBILITIES)[number];

export const BOARD_ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

export const BOARD_VIEWS = ["table", "kanban", "timeline", "calendar", "files"] as const;
export type BoardViewKind = (typeof BOARD_VIEWS)[number];

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
}

export interface BoardMember {
  id: EntityId;
  boardId: EntityId;
  userId: EntityId;
  role: BoardRole;
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
>;
