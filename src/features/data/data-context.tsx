"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type { AuthProvider } from "@/domain";
import { createRepositories } from "@/data/provider";
import { HttpReallocationTransport } from "@/data/supabase/reallocation-transport";
import { HttpBookingTransport } from "@/data/supabase/booking-transport";
import { HttpSendBackTransport } from "@/data/supabase/send-back-transport";
import { HttpTaskLinkTransport } from "@/data/supabase/task-link-transport";
import { HttpBugReportTransport } from "@/data/supabase/bug-report-transport";
import { HttpDashboardTransport } from "@/data/supabase/dashboard-transport";
import { HttpAutomationTransport } from "@/data/supabase/automation-transport";
import { HttpPortalTransport } from "@/data/supabase/portal-transport";
import { HttpItemShareTransport, HttpShareTransport } from "@/data/supabase/share-transport";
import { HttpSharedListTransport } from "@/data/supabase/shared-list-transport";
import { createAuthProvider } from "@/features/auth/auth-provider-factory";
import { getAppConfig, type DataProviderKind } from "@/lib/config";
import { createServices, type Services } from "@/services";

export interface DataContextValue {
  providerKind: DataProviderKind;
  services: Services;
  auth: AuthProvider;
}

const DataContext = createContext<DataContextValue | null>(null);

/**
 * Builds the repository → service graph once per app instance. The provider
 * kind comes from configuration; components only ever see `Services`.
 */
export function DataProviderContext({ children, value }: { children: React.ReactNode; value?: DataContextValue }) {
  const built = useMemo<DataContextValue>(() => {
    if (value) return value;
    const providerKind = getAppConfig().dataProvider;
    const repos = createRepositories(providerKind);
    const supabase = providerKind === "supabase";
    const services = createServices(repos, {
      bookingTransport: supabase ? new HttpBookingTransport() : null,
      sendBackTransport: supabase ? new HttpSendBackTransport() : null,
      taskLinkTransport: supabase ? new HttpTaskLinkTransport() : null,
      reallocationTransport: supabase ? new HttpReallocationTransport() : null,
      bugReportTransport: supabase ? new HttpBugReportTransport() : null,
      shareTransport: supabase ? new HttpShareTransport() : null,
      itemShareTransport: supabase ? new HttpItemShareTransport() : null,
      dashboardTransport: supabase ? new HttpDashboardTransport() : null,
      portalTransport: supabase ? new HttpPortalTransport() : null,
      automationTransport: supabase ? new HttpAutomationTransport() : null,
      sharedListTransport: supabase ? new HttpSharedListTransport() : null,
    });
    const auth = createAuthProvider(providerKind, repos);
    return { providerKind, services, auth };
  }, [value]);

  // A change that could not reach a linked task (on a board the person only views): theirs stands, and the page says where.
  useEffect(
    () =>
      built.services.links.onSyncSkipped(({ boardNames, what }) => {
        const where = boardNames.length === 1 ? boardNames[0] : `${boardNames.length} boards`;
        toast.warning(what === "update" ? `Not posted on the linked task on ${where}` : `Not updated on ${where}`, { description: "You can't edit it there. Saved here." });
      }),
    [built],
  );

  return <DataContext.Provider value={built}>{children}</DataContext.Provider>;
}

export function useDataContext(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useDataContext must be used inside DataProviderContext");
  return ctx;
}

export function useServices(): Services {
  return useDataContext().services;
}
