"use client";

import { Compass, Ellipsis, House, Inbox, ListTodo, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { BrandMark } from "@/features/auth/components/auth-shell";
import { Button } from "@/components/ui/button";
import { useUnreadCounts } from "@/features/notifications/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

/**
 * The phone's chrome: a compact bar that says where you are, and five
 * destinations along the bottom.
 *
 * It is not the sidebar squeezed down. The sidebar is a directory of everything
 * in the workspace, which is the wrong shape for a thumb; Browse is that
 * directory as its own screen, and More holds what is reached rarely. Every
 * existing destination is still reachable, at its existing URL.
 */

export interface MobileDestination {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Marked current for this path and anything under it. */
  match: (pathname: string) => boolean;
  badge?: number;
}

function useDestinations(): MobileDestination[] {
  const ws = useWorkspace();
  const unread = useUnreadCounts(ws.currentUser.id);
  const home = routes.workspace(ws.slug);
  return [
    { href: home, label: "Home", icon: House, match: (p) => p === home },
    { href: routes.myWork(ws.slug), label: "My Work", icon: ListTodo, match: (p) => p.startsWith(routes.myWork(ws.slug)) },
    {
      href: routes.browse(ws.slug),
      label: "Browse",
      icon: Compass,
      // Boards, teams and trackers are all reached through Browse, so they keep it lit.
      match: (p) => p.startsWith(routes.browse(ws.slug)) || p.includes("/boards/") || p.includes("/teams/") || p.includes("/trackers"),
    },
    { href: routes.inbox(ws.slug), label: "Inbox", icon: Inbox, match: (p) => p.startsWith(routes.inbox(ws.slug)), badge: unread.notifications },
    { href: routes.more(ws.slug), label: "More", icon: Ellipsis, match: (p) => p.startsWith(routes.more(ws.slug)) },
  ];
}

/** Says where you are and offers the one control every screen needs. */
export function MobileTopBar({ title, subtitle }: { title?: string; subtitle?: string }) {
  const ws = useWorkspace();
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  return (
    <header
      className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background px-3 pt-[env(safe-area-inset-top)]"
      data-testid="mobile-top-bar"
    >
      <BrandMark className="size-8 shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-tight">{title ?? ws.workspace.name}</span>
        {subtitle && <span className="block truncate text-2xs text-muted-foreground">{subtitle}</span>}
      </span>
      <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Search" onClick={() => setCommandPaletteOpen(true)} data-testid="mobile-search">
        <Search className="size-5" />
      </Button>
    </header>
  );
}

/**
 * Five destinations, thumb-sized, clear of the home indicator.
 *
 * Each target is 44px tall before the safe-area padding, and the bar reserves
 * its own height in the layout above rather than floating over the content, so
 * nothing is left underneath it.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const destinations = useDestinations();
  return (
    <nav
      aria-label="Main"
      className="shrink-0 border-t border-border/70 bg-background pb-[env(safe-area-inset-bottom)]"
      data-testid="mobile-bottom-nav"
    >
      <ul className="flex items-stretch">
        {destinations.map((destination) => {
          const current = destination.match(pathname);
          const Icon = destination.icon;
          return (
            <li key={destination.href} className="flex-1">
              <Link
                href={destination.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative flex h-14 min-w-11 flex-col items-center justify-center gap-0.5 text-2xs font-medium transition-colors",
                  current ? "text-primary" : "text-muted-foreground",
                )}
                data-testid={`mobile-nav-${destination.label.toLowerCase().replace(" ", "-")}`}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {!!destination.badge && destination.badge > 0 && (
                    <span
                      className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white tabular"
                      aria-label={`${destination.badge} unread`}
                    >
                      {destination.badge > 99 ? "99+" : destination.badge}
                    </span>
                  )}
                </span>
                {destination.label}
                {/* Not colour alone: the current destination also carries a bar. */}
                {current && <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
