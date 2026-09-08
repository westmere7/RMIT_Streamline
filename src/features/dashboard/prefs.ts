"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DateBasis, SpanMode, Unit } from "./analytics";

/** Every panel the dashboard can show, in the order they are laid out. */
export const PANEL_IDS = ["kpis", "teams", "requests", "year", "assetMix", "status", "distribution", "requestDetail", "people", "boards", "delivered"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_META: Record<PanelId, { title: string; hint: string }> = {
  kpis: { title: "Headline figures", hint: "Assets and tasks delivered, with completion, overdue and on-time rates." },
  teams: { title: "Delivery by team", hint: "Tasks and asset units per team." },
  requests: { title: "Stakeholder requests", hint: "Bookings received, how many are open, and where they came from." },
  year: { title: "Workload across the year", hint: "Monthly volume with one dot per task." },
  assetMix: { title: "Asset mix", hint: "Units delivered by asset type." },
  status: { title: "Progress by team", hint: "Each team's tasks split by status." },
  distribution: { title: "Asset distribution", hint: "How each asset type splits across teams." },
  requestDetail: { title: "Request breakdown", hint: "Requests by team, urgency and asset type." },
  people: { title: "People", hint: "Who carries the most tasks and assets." },
  boards: { title: "Boards", hint: "Every board's tasks, assets and progress." },
  delivered: { title: "Recently delivered", hint: "The latest tasks finished." },
};

interface DashboardPrefs {
  unit: Unit;
  basis: DateBasis;
  span: SpanMode;
  hiddenPanels: PanelId[];
  setUnit: (unit: Unit) => void;
  setBasis: (basis: DateBasis) => void;
  setSpan: (span: SpanMode) => void;
  togglePanel: (id: PanelId, visible?: boolean) => void;
  showAllPanels: () => void;
}

/**
 * How this browser likes the dashboard drawn. Persisted per browser like the
 * sidebar width: a view preference, not shared state, and hydrated after mount
 * to keep server and client markup the same.
 */
export const useDashboardPrefs = create<DashboardPrefs>()(
  persist(
    (set) => ({
      unit: "assets",
      basis: "due",
      span: "year",
      hiddenPanels: [],
      setUnit: (unit) => set({ unit }),
      setBasis: (basis) => set({ basis }),
      setSpan: (span) => set({ span }),
      togglePanel: (id, visible) =>
        set((s) => {
          const hidden = new Set(s.hiddenPanels);
          const show = visible ?? hidden.has(id);
          if (show) hidden.delete(id);
          else hidden.add(id);
          return { hiddenPanels: PANEL_IDS.filter((p) => hidden.has(p)) };
        }),
      showAllPanels: () => set({ hiddenPanels: [] }),
    }),
    {
      name: "streamline.dashboard",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ unit: s.unit, basis: s.basis, span: s.span, hiddenPanels: s.hiddenPanels }),
    },
  ),
);
