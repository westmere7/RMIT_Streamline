"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KeyRound, LoaderCircle, LockKeyhole, LogIn } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthProvider, AuthSession, PublicBoardPayload, User } from "@/domain";
import { createMemoryRepositories, shareGuestUser } from "@/data/memory";
import { AuthContextProvider, type AuthContextValue } from "@/features/auth/auth-context";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { DataProviderContext, type DataContextValue } from "@/features/data/data-context";
import { WorkspaceContextProvider, type WorkspaceContextValue } from "@/features/workspace/workspace-context";
import { buildPermissionContext } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { createServices } from "@/services";

/** How often a shared page looks for changes. */
export const SHARE_REFRESH_MS = 10_000;

/** The app's own loading screen: a visitor waits on the same page a member does. */
export function SharePlaceholder({ label }: { label: string }) {
  return <FullPageLoader label={label} />;
}

/** The doorway's own wording, shared by both kinds of link. */
const LEAD = "Work shared from Streamline opens here.";

export function ShareClosed({ title, message }: { title: string; message: string }) {
  return (
    <AuthShell headline="Shared with you." lead={LEAD} cardTestId="share-closed">
      <div className="space-y-4 p-7 sm:p-8">
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-muted-foreground">
          <LockKeyhole className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{message}</p>
        </div>
      </div>
    </AuthShell>
  );
}

/**
 * What a private link shows someone who is not signed in. Signing in comes back
 * here, so the link they were sent still works once they have.
 */
export function ShareSignIn({ what, path }: { what: string; path: string }) {
  return (
    <AuthShell headline="Shared with you." lead={LEAD} cardTestId="share-sign-in">
      <div className="space-y-4 p-7 sm:p-8">
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-muted-foreground">
          <LogIn className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">This {what} is shared inside the workspace</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Sign in with your Streamline account to open it. You do not have to be on the board — the link is enough.
          </p>
        </div>
        <Button asChild data-testid="share-sign-in-button">
          <Link href={routes.login(path)}>
            <LogIn /> Sign in
          </Link>
        </Button>
      </div>
    </AuthShell>
  );
}

export function SharePasswordPrompt({ what, busy, wrong, onSubmit }: { what: string; busy: boolean; wrong: boolean; onSubmit: (password: string) => void }) {
  const [value, setValue] = React.useState("");
  return (
    <AuthShell headline="Shared with you." lead={LEAD} cardTestId="share-password-prompt" progress={busy}>
      <form
        className="space-y-4 p-7 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-muted-foreground">
          <KeyRound className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">This {what} asks for a password</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Whoever shared it will have sent you one.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="share-visitor-password">Password</Label>
          <Input
            id="share-visitor-password"
            type="password"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            aria-invalid={wrong}
            data-testid="share-visitor-password"
          />
          {wrong && (
            <p className="text-[13px] text-destructive" role="alert">
              That password is not right.
            </p>
          )}
        </div>
        <Button type="submit" disabled={busy || !value.trim()} data-testid="share-visitor-submit">
          {busy ? <LoaderCircle className="animate-spin" /> : null} Open it
        </Button>
      </form>
    </AuthShell>
  );
}

/**
 * Everything under here believes it is an ordinary Streamline page: the data
 * layer, the signed-in person and the workspace are all made up from the
 * payload, so the app's own components need no idea that nobody is signed in.
 * A separate query cache keeps this page's made-up board out of the app's own,
 * in case both are open in the same tab.
 */
export function ShareGuestProviders({ payload, path, children }: { payload: PublicBoardPayload; path: string; children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: SHARE_REFRESH_MS, retry: false, refetchOnWindowFocus: false } } }));
  const guest = React.useMemo(() => shareGuestUser(), []);
  // Each poll builds the data layer again over the newer payload — the objects
  // are plain and cheap — and then asks the page to read through it.
  const data = React.useMemo<DataContextValue>(
    () => ({ providerKind: "local", services: createServices(createMemoryRepositories(payload)), auth: guestAuthProvider(guest) }),
    [payload, guest],
  );
  React.useEffect(() => {
    void queryClient.invalidateQueries();
  }, [payload, queryClient]);
  const auth = React.useMemo<AuthContextValue>(() => guestAuthContext(guest), [guest]);
  const workspace = React.useMemo<WorkspaceContextValue>(() => guestWorkspace(payload, guest, path), [payload, guest, path]);

  useLinksStayHere();

  return (
    <QueryClientProvider client={queryClient}>
      <DataProviderContext value={data}>
        <AuthContextProvider value={auth}>
          <WorkspaceContextProvider value={workspace}>{children}</WorkspaceContextProvider>
        </AuthContextProvider>
      </DataProviderContext>
    </QueryClientProvider>
  );
}

/**
 * A last line of defence for links out of the shared page.
 *
 * The board's own components are told where they are — boardPath points back at
 * this link — but they were written for a workspace, and one may still render a
 * link into it. Anything pointing at this site but outside /share/ is stopped
 * here, because on the other side of it is a page a visitor has no account for.
 * Links to other sites are left alone: a reference URL on a task is the visitor's
 * to follow.
 */
export function useLinksStayHere(): void {
  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/share/") || url.pathname.startsWith("/login")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

/** A session that exists only so the app's hooks have somebody to render for. */
function guestAuthContext(guest: User): AuthContextValue {
  return {
    status: "signed-in",
    session: guestSession(guest),
    user: guest,
    signIn: async () => {
      throw new Error("This is a shared link. Open Streamline itself to sign in.");
    },
    signOut: async () => undefined,
  };
}

function guestSession(guest: User): AuthSession {
  return { userId: guest.id, email: "", provider: "local" };
}

function guestAuthProvider(guest: User): AuthProvider {
  return {
    kind: "local",
    getSession: async () => guestSession(guest),
    signIn: async () => {
      throw new Error("This is a shared link. Open Streamline itself to sign in.");
    },
    signOut: async () => undefined,
    onSessionChange: () => () => undefined,
  };
}

/**
 * The workspace as a visitor sees it: what the link opens, the people shown on
 * it, and no rights at all. Every path back into the app points at this same
 * link, so a board name or a linked task keeps the visitor on the page they
 * were given.
 */
function guestWorkspace(payload: PublicBoardPayload, guest: User, path: string): WorkspaceContextValue {
  const board = payload.board;
  const workspace = {
    id: board.workspaceId,
    name: payload.workspaceName,
    slug: "",
    logoUrl: null,
    bookingKey: null,
    bookingForm: null,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
  const permissions = buildPermissionContext({ userId: guest.id, workspaceMembers: [], teamMembers: [], boardMembers: [] });
  const usersById = new Map(payload.users.map((u) => [u.id, u]));
  const here = (itemId?: string | null) => `${path}${itemId ? `?item=${itemId}` : ""}`;

  return {
    workspace,
    slug: workspace.slug,
    currentUser: guest,
    viewingAs: null,
    members: [],
    users: payload.users,
    activeUsers: payload.users.filter((u) => u.deactivatedAt === null),
    teams: [],
    teamMembers: [],
    boards: [board],
    boardMembers: [],
    favourites: [],
    permissions,
    ownPermissions: permissions,
    userById: (id) => (id ? usersById.get(id) : undefined),
    teamById: () => undefined,
    boardById: (id) => (id === board.id ? board : undefined),
    boardsForTeam: () => [],
    isFavourite: () => false,
    myTeams: [],
    boardPath: (_board, options) => here(options?.itemId),
    refresh: async () => undefined,
  };
}
