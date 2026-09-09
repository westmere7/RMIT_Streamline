"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

/**
 * The one boundary between the two experiences.
 *
 * Below 768 CSS pixels the phone shell takes over; at 768 and above the
 * existing interface is served unchanged, tablet behaviour included. Width, not
 * the user agent: a narrow desktop window is a phone as far as layout goes, and
 * a tablet in landscape is not.
 *
 * It is hydration-safe by construction — useSyncExternalStore hands the server
 * snapshot (false) to the hydrating render, so the markup matches and the swap
 * happens on the first commit afterwards.
 */
export const MOBILE_MAX_WIDTH = 767;

export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
}

/**
 * The window is too narrow for the sidebar to sit open beside the page, but not
 * a phone. Tablets have always folded it up; that stays true, and — unlike
 * before — it is no longer written into the reader's own preference.
 */
export function useAutoCollapseSidebar(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
