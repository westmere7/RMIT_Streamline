"use client";

import * as React from "react";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useUnreadCounts } from "@/features/notifications/hooks";

/** The mark drawn over the favicon, in the brand red. */
const DOT = "#e61e2a";
/** Above this the icon says "9+", because a two-digit badge on a 32px tab is a smudge. */
const MAX_ON_ICON = 9;

/**
 * Says how much is waiting on the browser tab itself.
 *
 * A tab is read in two states and needs a mark for each. Its **title** carries
 * the count — "(3) Streamline · RMIT VN MKT" — which is what shows while the
 * tab is wide enough for a few characters. Its **icon** carries a numbered dot,
 * which is what shows once the tab is too narrow for any title at all. Between
 * them there is no width at which a waiting notification is invisible.
 *
 * This hook owns the icon and *returns* the count, rather than writing the
 * title itself. The shell already keeps the title honest with a MutationObserver
 * — Next writes the route's static metadata title back on every navigation, so
 * the title has to be watched and corrected rather than set once — and a second
 * writer would simply fight it. The count belongs in the title that watcher
 * enforces.
 *
 * Only the loud ones count. `UnreadCounts.notifications` is what the inbox
 * badges as needing an answer; quiet updates are left out deliberately, or the
 * tab would wear a number all day and stop meaning anything.
 */
export function useTabBadge(): number {
  const user = useCurrentUser();
  const counts = useUnreadCounts(user.id);
  const waiting = counts.notifications;

  React.useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    const plain = link.getAttribute("href");
    let cancelled = false;

    void badgedIcon(plain, waiting).then((href) => {
      if (!cancelled && href) link.setAttribute("href", href);
    });

    return () => {
      cancelled = true;
      // Back to the icon the document shipped with, so a badge cannot outlive
      // the count it was drawn for.
      if (plain) link.setAttribute("href", plain);
    };
  }, [waiting]);

  return waiting;
}

/** How the count reads in front of a title. Empty when there is nothing waiting. */
export function tabCountPrefix(waiting: number): string {
  if (waiting <= 0) return "";
  return `(${waiting > 99 ? "99+" : waiting}) `;
}

/**
 * The favicon with a numbered dot drawn on it, as a data URL.
 *
 * Drawn rather than shipped as a second file because the badge has to sit on
 * whatever icon the document is using and because it carries a number. Returns
 * null when the icon cannot be read — a cross-origin image, a browser with no
 * canvas — and the tab then keeps its plain icon and leans on the title, which
 * is the graceful half of the pair.
 */
async function badgedIcon(href: string | null, waiting: number): Promise<string | null> {
  if (!href) return null;
  if (waiting <= 0) return href;
  try {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(await loadImage(href), 0, 0, size, size);

    // Bottom-right, with a ring in the app's own dark ground so the dot reads
    // as sitting on top of the icon rather than merging into it.
    const r = size * 0.31;
    const cx = size - r - 2;
    const cy = size - r - 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = "#0b1020";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = DOT;
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(r * 1.2)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(waiting > MAX_ON_ICON ? "9+" : String(waiting), cx, cy + 1);

    return canvas.toDataURL("image/png");
  } catch {
    // A tainted canvas, or an icon that would not load. The title still says so.
    return null;
  }
}

function loadImage(href: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Same-origin today, but asking keeps the canvas untainted if the icon ever
    // moves to a CDN — a tainted canvas throws on toDataURL.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`icon did not load: ${href}`));
    image.src = href;
  });
}
