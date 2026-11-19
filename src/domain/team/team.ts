import type { TeamSystemKind } from "@/domain/booking/booking";
import type { ColorToken, EntityId, Timestamps } from "@/domain/common/types";

export interface Team extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  description: string | null;
  color: ColorToken;
  /** Lucide icon name, e.g. "palette". */
  icon: string;
  archivedAt: string | null;
  /** Set when the app created the team itself (the "Admin" team). Renamable, never removable. */
  system?: TeamSystemKind | null;
  /**
   * The board bookings for this team land on directly. Null means they wait on
   * the Task Allocation board for a manager to place them.
   */
  bookingBoardId?: EntityId | null;
  /**
   * Who sees the team's boards (migration 0120): everyone in the workspace,
   * read only, or the team alone, which then hides the team, and its trackers
   * and docs, from everyone else. Absent reads as WORKSPACE.
   */
  boardVisibility?: TeamBoardVisibility;
  /** Superseded by `boardEdit` (migration 0123): still stored, no longer read. */
  membersCanEdit?: boolean;
  /**
   * Who edits the team's boards, beyond admins and the people added to each
   * (migration 0123). Absent reads as ADDED.
   */
  boardEdit?: BoardEditScope;
}

export type TeamBoardVisibility = "WORKSPACE" | "TEAM";

/**
 * Who can edit a board, beyond admins and the people added to it: nobody
 * else, the team's members, or everyone who can see it.
 */
export type BoardEditScope = "ADDED" | "TEAM" | "VIEWERS";

export type TeamRole = "LEAD" | "MEMBER";

export interface TeamMember {
  id: EntityId;
  teamId: EntityId;
  userId: EntityId;
  role: TeamRole;
}

export type TeamInput = Pick<Team, "workspaceId" | "name" | "description" | "color" | "icon"> & Partial<Pick<Team, "system" | "bookingBoardId">>;
