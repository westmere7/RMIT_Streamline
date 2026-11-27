"use client";

import { Eye, EyeOff, Link2, MoreVertical, PanelsTopLeft, SquareKanban } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ItemOpenings } from "@/domain";
import { useAuth } from "@/features/auth/auth-context";
import { useDataContext } from "@/features/data/data-context";

/**
 * What a shared task's page can offer its reader, from the page around the panel.
 *
 * Both of a task's links (Share by link, and a booking's task link) open the
 * same page. Nothing here is saved anywhere: the link is copied, the task is
 * opened somewhere else, and the hidden columns are shown on this page only,
 * until it is closed.
 */
export interface SharedTaskMenu {
  /** Where else the task opens for this reader; null until the server has said. */
  openings: ItemOpenings | null;
  hiddenCount: number;
  showHidden: boolean;
  setShowHidden: (show: boolean) => void;
}

const SharedTaskMenuContext = React.createContext<SharedTaskMenu | null>(null);

export const SharedTaskMenuProvider = SharedTaskMenuContext.Provider;

/** The "…" on a shared task's page. */
export function SharedPanelMenu() {
  const menu = React.useContext(SharedTaskMenuContext);
  const openings = menu?.openings ?? null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link. Copy it from the address bar.");
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="More actions for this task" data-testid="shared-menu">
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => void copy()} data-testid="shared-menu-copy">
          <Link2 /> Copy link
        </DropdownMenuItem>
        {/* Checked on the server for this reader: their own session sees the board; the portal is open and shows it. */}
        {openings?.board && (
          <DropdownMenuItem onSelect={() => window.location.assign(openings.board!)} data-testid="shared-menu-open-board">
            <SquareKanban /> Open in its board
          </DropdownMenuItem>
        )}
        {openings?.portal && (
          <DropdownMenuItem onSelect={() => window.location.assign(openings.portal!)} data-testid="shared-menu-open-portal">
            <PanelsTopLeft /> Open in the portal
          </DropdownMenuItem>
        )}
        {menu && menu.hiddenCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => menu.setShowHidden(!menu.showHidden)} data-testid="shared-menu-show-hidden">
              {menu.showHidden ? <EyeOff /> : <Eye />} {menu.showHidden ? "Hide hidden columns" : `Show hidden columns (${menu.hiddenCount})`}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The openings as this reader may use them. The server decides on Supabase;
 * the local demo's answer assumes its one user, so the board is dropped here
 * while nobody is signed in on this browser.
 */
export function useReaderOpenings(openings: ItemOpenings | undefined): ItemOpenings | null {
  const { providerKind } = useDataContext();
  const { status } = useAuth();
  if (!openings) return null;
  return providerKind === "local" && status !== "signed-in" ? { ...openings, board: null } : openings;
}
