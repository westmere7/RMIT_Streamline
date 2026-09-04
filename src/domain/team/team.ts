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
}

export type TeamRole = "LEAD" | "MEMBER";

export interface TeamMember {
  id: EntityId;
  teamId: EntityId;
  userId: EntityId;
  role: TeamRole;
}

export type TeamInput = Pick<Team, "workspaceId" | "name" | "description" | "color" | "icon">;
