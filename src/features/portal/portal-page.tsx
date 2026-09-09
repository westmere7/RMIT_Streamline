"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardPen, ListTodo, Lock, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortalGate } from "@/domain";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import type { PortalCredentials } from "@/features/portal/portal-client";
import { PortalBooking } from "@/features/portal/portal-booking";
import { PortalHeader, PortalShell, PortalThemeScope } from "@/features/portal/portal-shell";
import { PortalTaskDetailPanel } from "@/features/portal/portal-task-detail";
import { PortalTaskList } from "@/features/portal/portal-task-list";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PortalAccessError } from "@/services/stakeholder-portal-service";

/** How often the list is refreshed while somebody is looking at it. */
const PORTAL_REFRESH_MS = 15_000;

/**
 * A department's portal.
 *
 * Four steps in order, the same shape the share links use: ask what the link
 * is, take a password if it wants one, then read the department's requests and
 * render them. Nothing about the department is fetched until the link has
 * answered for itself.
 *
 * The whole page is read-only for a stakeholder by construction — every write
 * it can reach is a route handler that re-checks a board seat, and a visitor
 * has none.
 */
export function PortalPage({ token }: { token: string }) {
  const services = useServices();
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  const gate = useQuery({
    queryKey: ["portal-gate", token],
    queryFn: () => services.portals.publicGate(token),
    retry: false,
    staleTime: 60_000,
  });

  const needsPassword = gate.data?.needsPassword ?? false;
  // Who is asking, for the local provider only. Under Supabase the transport
  // drops this and the server resolves the viewer from a bearer token it
  // verifies itself — a browser claiming to be somebody proves nothing.
  const viewer = auth.user ? { userId: auth.user.id, displayName: auth.user.displayName, isWorkspaceMember: true } : null;
  const credentials: PortalCredentials = { token, password, credentialVersion: gate.data?.credentialVersion, viewer };

  const page = useQuery({
    queryKey: ["portal-tasks", token, gate.data?.credentialVersion, password, debouncedSearch],
    queryFn: () => services.portals.publicTasks(credentials, { search: debouncedSearch || undefined }),
    enabled: !!gate.data?.open && (!needsPassword || password !== null),
    retry: false,
    staleTime: PORTAL_REFRESH_MS,
    // A department's work carries on while somebody reads about it, and there
    // is no session here to hang a subscription on. Polling is the honest floor;
    // it is bounded, it backs off when the tab is hidden, and the header says
    // when the figures were last true.
    refetchInterval: PORTAL_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // The open request lives in the URL, so Back, refresh and a pasted link all
  // behave, and the list keeps its place behind the panel.
  const openTaskId = searchParams.get("task");
  const setOpenTask = React.useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(window.location.search);
      if (id) next.set("task", id);
      else next.delete("task");
      const query = next.toString();
      router.replace(`${window.location.pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router],
  );

  const [tab, setTab] = React.useState<"tasks" | "book">("tasks");

  if (gate.isPending) {
    return (
      <PortalShell>
        <div className="mx-auto w-full max-w-5xl px-4 py-10">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      </PortalShell>
    );
  }

  if (gate.isError || !gate.data?.open) {
    return (
      <PortalShell>
        <Closed refusal={gate.data?.refusal ?? "unknown"} />
      </PortalShell>
    );
  }

  const context = page.data?.context ?? null;

  if (needsPassword && password === null) {
    return (
      <PortalThemeScope token={token} preferred={gate.data.defaultTheme}>
        <PortalShell>
          <PasswordPrompt gate={gate.data} onSubmit={setPassword} />
        </PortalShell>
      </PortalThemeScope>
    );
  }

  // A password that the server refused: ask again rather than showing an empty
  // department, and say why.
  const wrongPassword = page.isError && page.error instanceof PortalAccessError && page.error.reason === "password";
  if (wrongPassword) {
    return (
      <PortalThemeScope token={token} preferred={gate.data.defaultTheme}>
        <PortalShell>
          <PasswordPrompt gate={gate.data} onSubmit={setPassword} error="That password does not open this portal." />
        </PortalShell>
      </PortalThemeScope>
    );
  }

  // A link replaced while this tab was open: the gate is re-read, and if it is
  // gone the closed state takes over on the next tick.
  if (page.isError) {
    return (
      <PortalThemeScope token={token} preferred={gate.data.defaultTheme}>
        <PortalShell>
          <Closed refusal="unknown" onRetry={() => void gate.refetch()} />
        </PortalShell>
      </PortalThemeScope>
    );
  }

  return (
    <PortalThemeScope token={token} preferred={gate.data.defaultTheme}>
      <PortalShell>
        <PortalHeader
          token={token}
          departmentName={context?.departmentName ?? gate.data.departmentName}
          creativeTeamName={context?.creativeTeamName ?? gate.data.creativeTeamName}
          viewerName={context?.viewerName ?? null}
          servedAt={page.data?.servedAt ?? null}
          stale={page.isFetching}
        />

        <div className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
          <div role="tablist" aria-label="Portal" className="mb-4 flex items-end gap-0.5 border-b border-border/70">
            <PortalTab id="tasks" current={tab} onSelect={setTab} icon={ListTodo} label="Our tasks" />
            <PortalTab id="book" current={tab} onSelect={setTab} icon={ClipboardPen} label="Book a task" />
          </div>

          {tab === "tasks" ? (
            <>
              <label className="relative mb-4 flex items-center">
                <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
                <span className="sr-only">Search this department&rsquo;s requests</span>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title or ID"
                  className="h-11 pl-9 pr-10 text-base"
                  data-testid="portal-search"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                    className="absolute right-1.5 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent/70"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </label>

              <PortalTaskList
                page={page.data ?? null}
                loading={page.isLoading}
                searching={!!debouncedSearch}
                onOpen={setOpenTask}
                onLoadMore={
                  page.data?.nextCursor
                    ? async () => {
                        const more = await services.portals.publicTasks(credentials, { cursor: page.data!.nextCursor, search: debouncedSearch || undefined });
                        return more.tasks;
                      }
                    : null
                }
              />
            </>
          ) : (
            <PortalBooking
              credentials={credentials}
              departmentName={gate.data.departmentName}
              onView={(itemId) => {
                void page.refetch();
                setOpenTask(itemId);
              }}
              onBackToTasks={() => {
                setTab("tasks");
                void page.refetch();
              }}
            />
          )}
        </div>

        {openTaskId && <PortalTaskDetailPanel credentials={credentials} itemId={openTaskId} onClose={() => setOpenTask(null)} />}
      </PortalShell>
    </PortalThemeScope>
  );
}

function PortalTab({
  id,
  current,
  onSelect,
  icon: Icon,
  label,
}: {
  id: "tasks" | "book";
  current: string;
  onSelect: (id: "tasks" | "book") => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const active = current === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(id)}
      className={`relative -mb-px inline-flex h-11 items-center gap-1.5 rounded-t-lg px-3 text-[13px] font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-[2.5px] after:rounded-full after:bg-transparent max-md:h-12 ${
        active ? "text-foreground after:bg-ring" : "text-muted-foreground hover:text-foreground"
      }`}
      data-testid={`portal-tab-${id}`}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </button>
  );
}

/** Everything that is not "this link opens". Deliberately one message. */
function Closed({ refusal, onRetry }: { refusal: string; onRetry?: () => void }) {
  const message =
    refusal === "off"
      ? "This portal is closed at the moment. Ask the creative team when it will be back."
      : refusal === "revoked"
        ? "This link has been replaced. Ask the creative team for the current one."
        : "This link does not open a portal. Check that you copied all of it, or ask the creative team for a new one.";
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-20 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-strong/70 text-muted-foreground">
        <Lock className="size-5" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold tracking-tight">This link does not open a portal</h1>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

function PasswordPrompt({ gate, onSubmit, error }: { gate: PortalGate; onSubmit: (password: string) => void; error?: string }) {
  const [value, setValue] = React.useState("");
  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-16">
      <span className="mb-4 flex size-12 items-center justify-center self-center rounded-full bg-surface-strong/70 text-muted-foreground">
        <Lock className="size-5" aria-hidden />
      </span>
      <h1 className="text-center text-lg font-semibold tracking-tight">{gate.departmentName} asks for a password</h1>
      <p className="mt-1.5 text-center text-[13px] text-muted-foreground">Whoever sent you this link will have given you one.</p>
      <form
        className="mt-5 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (value) onSubmit(value);
        }}
      >
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Password"
          aria-label="Portal password"
          aria-invalid={!!error}
          autoFocus
          autoComplete="current-password"
          className="h-11 text-base"
          data-testid="portal-password"
        />
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11" disabled={!value}>
          Open the portal
        </Button>
      </form>
    </div>
  );
}
