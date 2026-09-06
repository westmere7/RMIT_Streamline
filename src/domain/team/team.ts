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
}

export type TeamRole = "LEAD" | "MEMBER";

export interface TeamMember {
  id: EntityId;
  teamId: EntityId;
  userId: EntityId;
  role: TeamRole;
}

export type TeamInput = Pick<Team, "workspaceId" | "name" | "description" | "color" | "icon"> & Partial<Pick<Team, "system" | "bookingBoardId">>;
