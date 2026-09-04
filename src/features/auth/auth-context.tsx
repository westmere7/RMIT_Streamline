"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthSession, User } from "@/domain";
import { useDataContext } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";

export type AuthStatus = "loading" | "signed-out" | "signed-in";

export interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  /** Resolved profile of the signed-in user. Null while loading or signed out. */
  user: User | null;
  signIn: (email: string, password?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProviderContext({ children }: { children: React.ReactNode }) {
  const { auth, services } = useDataContext();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    auth
      .getSession()
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch((error) => {
        console.error("[auth] failed to restore session", error);
        if (!cancelled) setSession(null);
      });
    const unsubscribe = auth.onSessionChange((s) => setSession(s));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [auth]);

  const userId = session?.userId ?? null;
  const userQuery = useQuery({
    queryKey: queryKeys.currentUser(userId),
    queryFn: () => (userId ? services.repos.users.getById(userId) : Promise.resolve(null)),
    enabled: userId !== null,
    staleTime: 60_000,
  });

  const signIn = useCallback(
    async (email: string, password?: string) => {
      const next = await auth.signIn({ email, password });
      setSession(next);
    },
    [auth],
  );

  const signOut = useCallback(async () => {
    await auth.signOut();
    setSession(null);
    queryClient.clear();
  }, [auth, queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    let status: AuthStatus = "loading";
    if (session === null) status = "signed-out";
    else if (session && userQuery.data) status = "signed-in";
    else if (session && userQuery.isError) status = "signed-out";
    return { status, session: session ?? null, user: session ? (userQuery.data ?? null) : null, signIn, signOut };
  }, [session, userQuery.data, userQuery.isError, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProviderContext");
  return ctx;
}

/** Use inside authenticated routes only. */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser called while signed out");
  return user;
}
