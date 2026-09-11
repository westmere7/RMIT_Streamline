"use client";

import { useCurrentUser } from "@/features/auth/auth-context";
import { useUnreadCounts } from "@/features/notifications/hooks";

/**
 * How much is waiting, for the browser tab to say.
 *
 * The count goes in the **title** — "(3) Streamline · RMIT VN MKT" — and
 * nowhere else. The icon used to carry a numbered dot drawn over it as well,
 * for the width at which no title shows; it was a red blob on a 16px mark that
 * said the same thing as the two characters beside it, so it is gone and the
 * favicon is the favicon.
 *
 * This hook *returns* the count rather than writing the title itself. The
 * shell already keeps the title honest with a MutationObserver — Next writes
 * the route's static metadata title back on every navigation, so the title has
 * to be watched and corrected rather than set once — and a second writer would
 * simply fight it.
 *
 * Only the loud ones count. `UnreadCounts.notifications` is what the inbox
 * badges as needing an answer; quiet updates are left out deliberately, or the
 * tab would wear a number all day and stop meaning anything.
 */
export function useTabBadge(): number {
  const user = useCurrentUser();
  return useUnreadCounts(user.id).notifications;
}

/** How the count reads in front of a title. Empty when there is nothing waiting. */
export function tabCountPrefix(waiting: number): string {
  if (waiting <= 0) return "";
  return `(${waiting > 99 ? "99+" : waiting}) `;
}
