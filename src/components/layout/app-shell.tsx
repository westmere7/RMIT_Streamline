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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCommandPaletteOpen]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <main id="main" className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}
