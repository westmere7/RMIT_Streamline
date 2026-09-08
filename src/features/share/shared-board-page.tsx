"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { KeyRound, LoaderCircle, LockKeyhole } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthProvider, AuthSession, PublicBoardPayload, User } from "@/domain";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { AuthContextProvider, type AuthContextValue } from "@/features/auth/auth-context";
import { createMemoryRepositories, shareGuestUser } from "@/data/memory";
import { DataProviderContext, useServices, type DataContextValue } from "@/features/data/data-context";
import { SharedBoardScreen } from "@/features/share/shared-board-screen";
import { WorkspaceContextProvider, type WorkspaceContextValue } from "@/features/workspace/workspace-context";
import { buildPermissionContext } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { createServices } from "@/services";
import { ShareAccessError } from "@/services";

/** How often a shared board looks for changes. */
const SHARE_REFRESH_MS = 10_000;

/**
 * The page behind a public board link.
 *
 * Three steps, in order: ask what the link is (live, expired, password), take
 * the password if it wants one, then read the board and render it. Nothing about
 * the board is fetched until the link has answered for itself, and the whole
 * page is read-only by construction — the repositories behind it refuse to
 * write, so no button can do damage even if one were left on screen.
 */
export function SharedBoardPage({ token }: { token: string }) {
  const services = useServices();
  const [password, setPassword] = React.useState<string | null>(null);

  const gate = useQuery({
    queryKey: ["share-gate", token],
    queryFn: () => services.shares.gate(token),
    retry: false,
    staleTime: 60_000,
  });
  const needsPassword = gate.data?.needsPassword ?? false;
  // The board carries on moving while somebody is reading it, so the payload is
  // fetched again on a short cycle and whenever the tab is looked at again.
  // There is no session here for a realtime subscription to ride on, and the
  // whole board is one request, so polling is both the simplest and the only
  // honest way to keep the page current.
  const payload = useQuery({
    queryKey: ["share-board", token],
    queryFn: () => services.shares.load(token, password),
    enabled: !!gate.data?.open && (!needsPassword || password !== null),
    retry: false,
    staleTime: SHARE_REFRESH_MS,
    refetchInterval: SHARE_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  if (gate.isPending) return <SharePlaceholder />;

  if (gate.isError || !gate.data?.open) {
    const message =
      gate.data?.refusal === "expired"
        ? "This link has expired. Ask whoever sent it for a new one."
        : gate.data?.refusal === "off"
          ? "Sharing has been turned off for this board. Ask whoever sent you the link to turn it back on."
          : "This link does not open anything. Check that you copied all of it, or ask whoever sent it for a new one.";
    return <ShareClosed message={message} />;
  }

  if (payload.data) return <SharedBoardShell payload={payload.data} token={token} />;

  const wrongPassword = payload.error instanceof ShareAccessError && payload.error.reason === "password";
  if (needsPassword && (password === null || wrongPassword)) {
    return <SharePasswordPrompt busy={payload.isFetching} wrong={wrongPassword} onSubmit={setPassword} />;
  }
  if (payload.isError) {
    return <ShareClosed message={payload.error instanceof Error ? payload.error.message : "This board could not be opened."} />;
  }
  return <SharePlaceholder />;
}

/**
 * Everything under here believes it is an ordinary Streamline page: the data
 * layer, the signed-in person and the workspace are all made up from the
 * payload, so the board's own components need no idea that nobody is signed in.
 * A separate query cache keeps this page's made-up board out of the app's own,
 * in case both are open in the same tab.
 */
function SharedBoardShell({ payload, token }: { payload: PublicBoardPayload; token: string }) {
  const [queryClient] = React.useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: SHARE_REFRESH_MS, retry: false, refetchOnWindowFocus: false } } }));
  const guest = React.useMemo(() => shareGuestUser(), []);
  // Each poll builds the data layer again over the newer board — the objects are
  // plain and cheap — and then asks the page to read through it.
  const data = React.useMemo<DataContextValue>(
    () => ({ providerKind: "local", services: createServices(createMemoryRepositories(payload)), auth: guestAuthProvider(guest) }),
    [payload, guest],
  );
  React.useEffect(() => {
    void queryClient.invalidateQueries();
  }, [payload, queryClient]);
  const auth = React.useMemo<AuthContextValue>(() => guestAuthContext(guest), [guest]);
  const workspace = React.useMemo<WorkspaceContextValue>(() => guestWorkspace(payload, guest, token), [payload, guest, token]);

  useLinksStayHere();

  return (
    <QueryClientProvider client={queryClient}>
      <DataProviderContext value={data}>
        <AuthContextProvider value={auth}>
          <WorkspaceContextProvider value={workspace}>
            <SharedBoardScreen payload={payload} />
          </WorkspaceContextProvider>
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
function useLinksStayHere(): void {
  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/share/")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

/** The app's own loading screen: a visitor waits on the same page a member does. */
function SharePlaceholder() {
  return <FullPageLoader label="Opening the shared board…" />;
}

function ShareClosed({ message }: { message: string }) {
  return (
    <AuthShell headline="Shared with you." lead="Boards shared from Streamline open here, without an account." cardTestId="share-closed">
      <div className="space-y-4 p-7 sm:p-8">
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-muted-foreground">
          <LockKeyhole className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">This link does not open a board</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{message}</p>
        </div>
      </div>
    </AuthShell>
  );
}

function SharePasswordPrompt({ busy, wrong, onSubmit }: { busy: boolean; wrong: boolean; onSubmit: (password: string) => void }) {
  const [value, setValue] = React.useState("");
  return (
    <AuthShell headline="Shared with you." lead="Boards shared from Streamline open here, without an account." cardTestId="share-password-prompt" progress={busy}>
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
          <h2 className="text-lg font-semibold tracking-tight">This board asks for a password</h2>
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
          {busy ? <LoaderCircle className="animate-spin" /> : null} Open the board
        </Button>
      </form>
    </AuthShell>
  );
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
 * The workspace as a visitor sees it: one board, the people shown on it, and no
 * rights at all. Every path back into the app points at this same link, so a
 * board name or a linked task keeps the visitor on the page they were given.
 */
function guestWorkspace(payload: PublicBoardPayload, guest: User, token: string): WorkspaceContextValue {
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
  const here = (itemId?: string | null) => `${routes.share(token)}${itemId ? `?item=${itemId}` : ""}`;

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
