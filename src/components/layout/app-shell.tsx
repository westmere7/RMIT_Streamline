"use client";

import { Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { ConfettiCanvas } from "@/components/shared/confetti";
import { useOsNotifications } from "@/features/notifications/use-os-notifications";
import { CommandPalette } from "@/features/search/command-palette";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useUiStore } from "@/stores/ui-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const isNarrow = useMediaQuery("(max-width: 1023px)");
  const ws = useWorkspace();
  const pathname = usePathname();
  // On a phone the sidebar is a drawer. It remembers the path it was opened on,
  // so following any link (which changes the path) closes it without an effect.
  const [drawerPath, setDrawerPath] = React.useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;

  // Raises an operating-system notification when something loud arrives while
  // the app is open in a tab the reader is not looking at.
  useOsNotifications();

  // Rehydrate persisted UI preferences after mount to avoid SSR mismatches.
  React.useEffect(() => {
    void useUiStore.persist.rehydrate();
  }, []);

  React.useEffect(() => {
    if (isNarrow) setSidebarCollapsed(true);
  }, [isNarrow, setSidebarCollapsed]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl/⌘ F takes over the browser's find bar: in here, search is the app's own.
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && (key === "k" || key === "f")) {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCommandPaletteOpen]);

  return (
    <div className="flex h-screen w-full gap-2 overflow-hidden bg-canvas p-2 max-md:gap-0 max-md:p-0">
      <div className="hidden h-full md:contents">
        <Sidebar />
      </div>
      <main id="main" className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background shadow-sm max-md:rounded-none">
        {/* Phone-only top bar: the sidebar lives behind the menu button. */}
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border/70 px-2 md:hidden" data-testid="mobile-top-bar">
          <Button variant="ghost" size="icon-sm" aria-label="Open navigation" aria-expanded={drawerOpen} onClick={() => setDrawerPath(pathname)} data-testid="mobile-menu">
            <Menu />
          </Button>
          <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
            R
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">{ws.workspace.name}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Search" onClick={() => setCommandPaletteOpen(true)}>
            <Search />
          </Button>
        </header>
        {children}
      </main>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Workspace navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/40" onClick={() => setDrawerPath(null)} />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] p-2" data-testid="mobile-drawer">
            <Sidebar variant="drawer" onNavigate={() => setDrawerPath(null)} />
          </div>
        </div>
      )}
      <CommandPalette />
      <ConfettiCanvas />
    </div>
  );
}
