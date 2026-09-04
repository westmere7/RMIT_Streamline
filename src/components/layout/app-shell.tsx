"use client";

import * as React from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/features/search/command-palette";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useUiStore } from "@/stores/ui-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const isNarrow = useMediaQuery("(max-width: 1023px)");

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
    <div className="flex h-screen w-full gap-2 overflow-hidden bg-canvas p-2">
      <Sidebar />
      <main id="main" className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background shadow-sm">
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}
