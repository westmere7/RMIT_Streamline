import type { EntityId, Timestamps } from "@/domain/common/types";

export interface User extends Timestamps {
  id: EntityId;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  timezone: string;
  /** Deactivated users keep their history but cannot sign in or be assigned. */
  deactivatedAt: string | null;
}

export type UserInput = Omit<User, "id" | "createdAt" | "updatedAt" | "deactivatedAt">;

export function userInitials(user: Pick<User, "firstName" | "lastName" | "displayName">): string {
  const first = user.firstName.trim().charAt(0);
  const last = user.lastName.trim().charAt(0);
  if (first || last) return `${first}${last}`.toUpperCase();
  return user.displayName.slice(0, 2).toUpperCase();
}
