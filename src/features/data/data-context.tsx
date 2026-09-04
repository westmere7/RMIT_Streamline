"use client";

import { createContext, useContext, useMemo } from "react";
import type { AuthProvider } from "@/domain";
import { createRepositories } from "@/data/provider";
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
    const services = createServices(repos);
    const auth = createAuthProvider(providerKind, repos);
    return { providerKind, services, auth };
  }, [value]);

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
