import type { EntityId } from "@/domain/common/types";
import type { WorkspaceRole } from "./workspace";

/**
 * One invitation link for a pending member.
 *
 * Streamline is standalone and sends no email: an admin adds the person to the
 * member list (status INVITED), then hands them this link by whatever channel
 * they like. Opening it lets the person set a password and finish their profile,
 * after which their membership becomes ACTIVE. A member has at most one live
 * invitation; generating a new link revokes the previous one.
 */
export interface WorkspaceInvitation {
  id: EntityId;
  workspaceId: EntityId;
  userId: EntityId;
  /** The secret in the link. Only workspace admins can read it back. */
  token: string;
  createdBy: EntityId | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

/** How long a freshly generated link stays usable. */
export const INVITATION_TTL_DAYS = 30;

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | "INVALID";

export function invitationStatus(invitation: WorkspaceInvitation | null | undefined, now: Date = new Date()): InvitationStatus {
  if (!invitation) return "INVALID";
  if (invitation.acceptedAt) return "ACCEPTED";
  if (invitation.revokedAt) return "REVOKED";
  if (new Date(invitation.expiresAt).getTime() <= now.getTime()) return "EXPIRED";
  return "PENDING";
}

/** The sentence the join page and the complete step show for a link that cannot be used. */
export function invitationStatusMessage(status: InvitationStatus): string {
  switch (status) {
    case "ACCEPTED":
      return "This invitation has already been used. Sign in with your email and password instead.";
    case "EXPIRED":
      return "This invitation link has expired. Ask a workspace admin for a new one.";
    case "REVOKED":
      return "This invitation link was replaced or cancelled. Ask a workspace admin for the current one.";
    case "PENDING":
      return "This invitation is still open.";
    default:
      return "This invitation link is not valid.";
  }
}

/** What the join page may show before anyone has signed in. */
export type InvitationPreview =
  | { status: Exclude<InvitationStatus, "PENDING">; workspaceName: string | null }
  | {
      status: "PENDING";
      workspaceName: string;
      workspaceSlug: string;
      email: string;
      firstName: string;
      lastName: string;
      jobTitle: string | null;
      expiresAt: string;
    };

export interface InviteMemberInput {
  workspaceId: EntityId;
  invitedBy: EntityId;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  role: WorkspaceRole;
  teamIds: EntityId[];
}

export interface CompleteOnboardingInput {
  token: string;
  password: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
}

export const PASSWORD_MIN_LENGTH = 8;

/** Base64url of 32 random bytes: unguessable, and safe in a URL path. */
export function generateInvitationToken(random: (bytes: Uint8Array) => void = (b) => crypto.getRandomValues(b)): string {
  const bytes = new Uint8Array(32);
  random(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isPlausibleInvitationToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}
