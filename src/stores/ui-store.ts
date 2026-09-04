"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** The expanded sidebar can be dragged wider, never narrower than its designed width. */
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 480;

interface UiState {
  sidebarCollapsed: boolean;
  /** Expanded sidebar width in px (clamped to the min/max above). */
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  /** Team ids expanded in the sidebar. */
  expandedTeamIds: string[];
  /** Whether the Favourites section is expanded. */
  favouritesExpanded: boolean;
  commandPaletteOpen: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleTeam: (teamId: string) => void;
  setTeamExpanded: (teamId: string, expanded: boolean) => void;
  toggleFavourites: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
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
      setSidebarWidth: (width) => set({ sidebarWidth: Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))) }),
      expandedTeamIds: [],
      favouritesExpanded: true,
      commandPaletteOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleTeam: (teamId) =>
        set((s) => ({
          expandedTeamIds: s.expandedTeamIds.includes(teamId)
            ? s.expandedTeamIds.filter((id) => id !== teamId)
            : [...s.expandedTeamIds, teamId],
        })),
      setTeamExpanded: (teamId, expanded) =>
        set((s) => ({
          expandedTeamIds: expanded
            ? s.expandedTeamIds.includes(teamId)
              ? s.expandedTeamIds
              : [...s.expandedTeamIds, teamId]
            : s.expandedTeamIds.filter((id) => id !== teamId),
        })),
      toggleFavourites: () => set((s) => ({ favouritesExpanded: !s.favouritesExpanded })),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    }),
    {
      name: "streamline.ui",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        sidebarWidth: s.sidebarWidth,
        expandedTeamIds: s.expandedTeamIds,
        favouritesExpanded: s.favouritesExpanded,
      }),
    },
  ),
);
