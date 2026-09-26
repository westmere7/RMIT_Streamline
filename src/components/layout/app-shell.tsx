"use client";

import { usePathname } from "next/navigation";
import * as React from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileBottomNav, MobileTopBar } from "@/components/layout/mobile-shell";
import { ViewingAsBanner } from "@/features/workspace/components/viewing-as-banner";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { ConfettiCanvas } from "@/components/shared/confetti";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { UndoBar } from "@/features/undo/undo-bar";
import { useOsNotifications } from "@/features/notifications/use-os-notifications";
import { tabCountPrefix, useTabBadge } from "@/features/notifications/use-tab-badge";
import { CommandPalette } from "@/features/search/command-palette";
import { AppUpdatedNotice } from "@/features/version/app-updated-card";
import { VersionWatcher } from "@/features/version/version-watcher";
import { SaveBoardTemplateHost } from "@/features/boards/board-templates";
import { BugReportHost } from "@/features/bug-report/bug-report-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUiStore } from "@/stores/ui-store";

/**
 * The application's frame, in one of two shapes.
 *
 * Below 768px the phone shell is mounted — a compact bar, the page, and five
 * destinations along the bottom — and the sidebar is not rendered at all. At
 * 768 and above the existing frame is served exactly as it was. Only one of the
 * two is mounted: hiding the other with CSS would leave its subscriptions,
 * queries and focusable controls alive behind the one you can see.
 *
 * Everything above the frame — providers, notifications, the palette, the
 * version watcher — is shared, so neither shape owns the app's behaviour.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const onBoard = pathname.includes("/boards/");
  const ws = useWorkspace();

  // Raises an operating-system notification when something loud arrives while
  // the app is open in a tab the reader is not looking at.
  useOsNotifications();

  // …and marks the tab itself, so a count is visible without switching to it.
  // The icon is this hook's; the count goes into the title the watcher below
  // enforces, because two writers of document.title would fight each other.
  const waiting = useTabBadge();

  // Rehydrate persisted UI preferences after mount to avoid SSR mismatches.
  React.useEffect(() => {
    void useUiStore.persist.rehydrate();
    useUiStore.getState().restoreViewAs();
  }, []);

  // The tab is named after the workspace the reader is in, not the product's
  // default. The router writes the static metadata title back on every
  // navigation (search-param changes included), so the title is watched and
  // corrected rather than set once.
  React.useEffect(() => {
    const wanted = `${tabCountPrefix(waiting)}Streamline · ${ws.workspace.name}`;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [ws.workspace.name, waiting]);

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

  const overlays = (
    <>
      <CommandPalette />
      <UndoBar />
      <ConfettiCanvas />
      <VersionWatcher />
      <AppUpdatedNotice />
      <SaveBoardTemplateHost />
      <BugReportHost />
    </>
  );

  if (isMobile) {
    return (
      // Dynamic viewport height, so the bottom bar is not pushed under a
      // browser's own chrome as it grows and shrinks.
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-background" data-testid="mobile-shell">
        <ViewingAsBanner />
        {/* A board brings its own header, with back, name and menu; the
            workspace bar above it was a second header saying less, and the
            two together took a third of the screen before the first card. */}
        {!onBoard && <MobileTopBar />}
        <OfflineBanner />
        <main id="main" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
        <MobileBottomNav />
        {overlays}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full gap-2 overflow-hidden bg-canvas p-2">
      <Sidebar />
      <main id="main" className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background shadow-sm">
        <ViewingAsBanner />
        <OfflineBanner />
        {children}
      </main>
      {overlays}
    </div>
  );
}
