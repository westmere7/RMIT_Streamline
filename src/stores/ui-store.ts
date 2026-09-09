"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** The expanded sidebar can be dragged wider, never narrower than its designed width. */
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 480;

/** How tracker grids are drawn; one preference set shared by every tracker. */
export interface TrackerViewSettings {
  gridLines: boolean;
  stripes: boolean;
  wrap: boolean;
  density: "compact" | "default" | "comfortable";
  /** Wash the active cell's whole row and column so the eye can follow them. */
  crosshair: boolean;
}

export const DEFAULT_TRACKER_VIEW: TrackerViewSettings = { gridLines: true, stripes: false, wrap: false, density: "default", crosshair: true };

/** Where a "view as" preview is kept: this tab only. */
const VIEW_AS_KEY = "streamline.view-as";

interface UiState {
  sidebarCollapsed: boolean;
  trackerView: TrackerViewSettings;
  setTrackerView: (patch: Partial<TrackerViewSettings>) => void;
  /** Expanded sidebar width in px (clamped to the min/max above). */
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  /** Team ids expanded in the sidebar. */
  expandedTeamIds: string[];
  /** Whether the Favourites section is expanded. */
  favouritesExpanded: boolean;
  /** Show the board/tracker tally beside each team in the sidebar. */
  showTeamCounts: boolean;
  setShowTeamCounts: (show: boolean) => void;
  /** Whether the asset recap above an item's tabs is open past its one-line form. */
  assetRecapExpanded: boolean;
  toggleAssetRecap: () => void;
  commandPaletteOpen: boolean;
  /** Chosen search scope, or null to follow whatever the user is looking at. */
  searchScope: "view" | "workspace" | null;
  /**
   * An admin looking at the workspace through a colleague's eyes: their id, or
   * null for your own. Kept for the tab, so the preview survives a page load and
   * following a link, and is gone once the tab is closed.
   */
  viewAsUserId: string | null;
  setViewAsUserId: (userId: string | null) => void;
  /** Picks the preview up again after a reload; called once the app has mounted. */
  restoreViewAs: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleTeam: (teamId: string) => void;
  setTeamExpanded: (teamId: string, expanded: boolean) => void;
  toggleFavourites: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchScope: (scope: "view" | "workspace" | null) => void;
}

/**
 * Ephemeral + lightly persisted UI preferences. Persisted keys are hydrated
 * manually (skipHydration) after mount to avoid SSR/CSR markup mismatches.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_MIN_WIDTH,
      trackerView: DEFAULT_TRACKER_VIEW,
      setTrackerView: (patch) => set((s) => ({ trackerView: { ...s.trackerView, ...patch } })),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))) }),
      expandedTeamIds: [],
      favouritesExpanded: true,
      showTeamCounts: false,
      setShowTeamCounts: (showTeamCounts) => set({ showTeamCounts }),
      assetRecapExpanded: false,
      toggleAssetRecap: () => set((s) => ({ assetRecapExpanded: !s.assetRecapExpanded })),
      commandPaletteOpen: false,
      searchScope: null,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleTeam: (teamId) =>
        set((s) => ({
          expandedTeamIds: s.expandedTeamIds.includes(teamId) ? s.expandedTeamIds.filter((id) => id !== teamId) : [...s.expandedTeamIds, teamId],
        })),
      setTeamExpanded: (teamId, expanded) =>
        set((s) => ({
          expandedTeamIds: expanded ? (s.expandedTeamIds.includes(teamId) ? s.expandedTeamIds : [...s.expandedTeamIds, teamId]) : s.expandedTeamIds.filter((id) => id !== teamId),
        })),
      toggleFavourites: () => set((s) => ({ favouritesExpanded: !s.favouritesExpanded })),
      // Opening search always starts from the current view's scope again.
      setCommandPaletteOpen: (commandPaletteOpen) => set(commandPaletteOpen ? { commandPaletteOpen, searchScope: null } : { commandPaletteOpen }),
      setSearchScope: (searchScope) => set({ searchScope }),
      viewAsUserId: null,
      setViewAsUserId: (viewAsUserId) => {
        try {
          if (viewAsUserId) sessionStorage.setItem(VIEW_AS_KEY, viewAsUserId);
          else sessionStorage.removeItem(VIEW_AS_KEY);
        } catch {
          // A tab that refuses storage simply forgets the preview on reload.
        }
        set({ viewAsUserId });
      },
      restoreViewAs: () => {
        try {
          const stored = sessionStorage.getItem(VIEW_AS_KEY);
          if (stored) set({ viewAsUserId: stored });
        } catch {
          // nothing to pick up
        }
      },
    }),
    {
      name: "streamline.ui",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        sidebarWidth: s.sidebarWidth,
        trackerView: s.trackerView,
        expandedTeamIds: s.expandedTeamIds,
        favouritesExpanded: s.favouritesExpanded,
        showTeamCounts: s.showTeamCounts,
        assetRecapExpanded: s.assetRecapExpanded,
      }),
    },
  ),
);
