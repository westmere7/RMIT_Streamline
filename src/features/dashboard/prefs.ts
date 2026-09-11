"use client";

import * as React from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { MeasureKind, PeriodMode, ReportingBasis } from "./metrics";

/** The three things the dashboard is for, in the order a manager meets them. */
export const DASHBOARD_VIEWS = ["overview", "demand", "resourcing"] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export const VIEW_META: Record<DashboardView, { label: string; hint: string }> = {
  overview: { label: "Overview", hint: "Output so far, and what needs attention today." },
  demand: { label: "Demand & Delivery", hint: "Requests and volume, by period, team, department and asset type." },
  resourcing: { label: "Resourcing", hint: "Who is carrying what, and what nobody has picked up." },
};

export interface DashboardPrefs {
  view: DashboardView;
  /**
   * What the page is read in: hours, tasks or asset units. One choice for the
   * whole dashboard rather than a switch per chart — the point of the page is
   * that the splits agree with each other, and they cannot while each panel
   * counts what it likes.
   */
  measure: MeasureKind;
  basis: ReportingBasis;
  periodMode: PeriodMode;
  /** Null means "the current year"; a number pins the report to that year. */
  year: number | null;
  /** Null means "the year before the selected one". */
  comparisonYear: number | null;
  quarter: 1 | 2 | 3 | 4;
  month: number;
  from: string | null;
  to: string | null;
  teamIds: string[] | null;
  /** How far ahead the resourcing view looks. */
  weeks: 2 | 4 | 8;
  /**
   * The stakeholder group the per-person figures are narrowed to, by the key
   * `workloadDepartments` hands out, or null for every group. A key the window
   * no longer holds work for is ignored rather than emptying the panel.
   */
  stakeholderGroup: string | null;
}

export const DEFAULT_PREFS: DashboardPrefs = {
  view: "overview",
  measure: "tasks",
  // Created, not due: every task has a creation date, so the default report is
  // the one with no coverage gap. Due is a click away and says what it excludes.
  basis: "created",
  // The default a manager asked for: this year so far, against the same span
  // last year. Never a partial year against a whole one.
  periodMode: "ytd",
  year: null,
  comparisonYear: null,
  quarter: 1,
  month: 1,
  from: null,
  to: null,
  teamIds: null,
  weeks: 4,
  stakeholderGroup: null,
};

interface PrefsStore {
  /** Keyed by `<userId>:<workspaceId>`. */
  byScope: Record<string, DashboardPrefs>;
  set: (scope: string, patch: Partial<DashboardPrefs>) => void;
  reset: (scope: string) => void;
}

/**
 * How one person likes one workspace's dashboard.
 *
 * Keyed by user and workspace, not by browser. The old store was a single
 * `streamline.dashboard` key, so two people sharing a machine — or one person
 * with two workspaces — inherited each other's filters, and a team filter
 * naming a team the next workspace has never heard of quietly emptied the page.
 * `usePrefs` drops a team that is no longer selectable for exactly that reason.
 */
const useStore = create<PrefsStore>()(
  persist(
    (set) => ({
      byScope: {},
      set: (scope, patch) => set((s) => ({ byScope: { ...s.byScope, [scope]: { ...DEFAULT_PREFS, ...s.byScope[scope], ...patch } } })),
      reset: (scope) => set((s) => ({ byScope: { ...s.byScope, [scope]: DEFAULT_PREFS } })),
    }),
    {
      name: "streamline.dashboard.v2",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 2,
      /**
       * The browser-wide settings, carried once into whatever scope is read
       * first. Only the two that still exist are taken: the old `span` and
       * `basis` vocabularies are gone, and guessing at a mapping would be
       * worse than starting from the default.
       */
      migrate: (persisted) => {
        if (persisted && typeof persisted === "object" && "byScope" in persisted) return persisted as PrefsStore;
        return { byScope: {} } as PrefsStore;
      },
    },
  ),
);

let hydrated = false;

/**
 * This person's preferences for this workspace.
 *
 * Rehydrated on the first mount rather than during render, so the server and
 * the first client render agree; until then everybody gets the defaults, which
 * is a correct dashboard rather than an empty one.
 */
export function useDashboardPrefs(userId: string, workspaceId: string, selectableTeams: string[]) {
  const scope = `${userId}:${workspaceId}`;
  React.useEffect(() => {
    if (hydrated) return;
    hydrated = true;
    void useStore.persist.rehydrate();
  }, []);

  const stored = useStore((s) => s.byScope[scope]);
  const write = useStore((s) => s.set);
  const resetAll = useStore((s) => s.reset);

  const prefs = React.useMemo<DashboardPrefs>(() => {
    const base = { ...DEFAULT_PREFS, ...stored };
    // A team that is no longer in this workspace, or that this person can no
    // longer see, must not silently filter the page down to nothing.
    if (base.teamIds) {
      const kept = base.teamIds.filter((id) => selectableTeams.includes(id));
      return { ...base, teamIds: kept.length > 0 ? kept : null };
    }
    return base;
  }, [stored, selectableTeams]);

  const set = React.useCallback((patch: Partial<DashboardPrefs>) => write(scope, patch), [write, scope]);
  const reset = React.useCallback(() => resetAll(scope), [resetAll, scope]);
  return { prefs, set, reset };
}
