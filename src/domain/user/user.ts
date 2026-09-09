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
  /**
   * Added after the first accounts were made, so absent on a row nobody has
   * edited since: which stakeholder group they sit with (Settings → Lists), and
   * when their day starts and ends in their own timezone ("09:00").
   */
  stakeholderGroup?: string | null;
  workHoursStart?: string | null;
  workHoursEnd?: string | null;
  /** Deactivated users keep their history but cannot sign in or be assigned. */
  deactivatedAt: string | null;
}

/** "9:00am – 5:30pm", or null when nobody has said. */
export function formatWorkHours(user: Pick<User, "workHoursStart" | "workHoursEnd">): string | null {
  if (!user.workHoursStart || !user.workHoursEnd) return null;
  return `${formatClock(user.workHoursStart)} – ${formatClock(user.workHoursEnd)}`;
}

/** "09:00" → "9:00am". Anything unparseable is handed back as it was typed. */
export function formatClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  if (!Number.isFinite(hours) || hours > 23) return value;
  const suffix = hours < 12 ? "am" : "pm";
  const shown = hours % 12 === 0 ? 12 : hours % 12;
  return `${shown}:${match[2]}${suffix}`;
}

export type UserInput = Omit<User, "id" | "createdAt" | "updatedAt" | "deactivatedAt">;

export function userInitials(user: Pick<User, "firstName" | "lastName" | "displayName">): string {
  const first = user.firstName.trim().charAt(0);
  const last = user.lastName.trim().charAt(0);
  if (first || last) return `${first}${last}`.toUpperCase();
  return user.displayName.slice(0, 2).toUpperCase();
}
