import type { EntityId, Timestamps } from "@/domain/common/types";

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER", "GUEST"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface Workspace extends Timestamps {
  id: EntityId;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export type WorkspaceMemberStatus = "ACTIVE" | "INVITED" | "DEACTIVATED";

export interface WorkspaceMember {
  id: EntityId;
  workspaceId: EntityId;
  userId: EntityId;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  joinedAt: string;
}
