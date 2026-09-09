"use client";

import { Check, LoaderCircle, Moon, Sun, SunMoon } from "lucide-react";
import * as React from "react";
import { BrandMark } from "@/features/auth/components/auth-shell";
import type { PortalTheme, PortalTotals } from "@/domain";
import { cn } from "@/lib/utils";

/**
 * The portal's own frame.
 *
 * Not the application's: a stakeholder has no sidebar, no workspace and no
 * account, and giving them a chrome that implies otherwise would be an
 * invitation to try doors that are locked. What they get is the team's name,
 * their own department's, and the two things they came for.
 */
export function PortalShell({ children, fill = false }: { children: React.ReactNode; fill?: boolean }) {
  // A board owns its own scrolling — it has a sticky header row, a horizontal
  // scrollport and a panel that has to sit beside them — so on that tab the
  // shell is a column exactly one window tall. A form is happier scrolling with
  // the page.
  return <div className={cn("bg-canvas text-foreground", fill ? "flex h-dvh min-h-0 flex-col overflow-hidden" : "min-h-dvh")}>{children}</div>;
}

/**
 * A theme the visitor chooses, remembered for this portal alone.
 *
 * It must not touch the internal app's preference — a stakeholder and a member
 * of staff may well be the same person on the same browser, and choosing dark
 * for a portal is not choosing dark for their workspace. The key is scoped to
 * the token for the same reason.
 *
 * Applied on the first commit rather than during render, and the server default
 * is used until then, so there is no flash of the wrong theme and no hydration
 * mismatch.
 */
export function PortalThemeScope({ token, preferred, children }: { token: string; preferred: PortalTheme; children: React.ReactNode }) {
  const storageKey = `streamline.portal-theme:${token}`;
  // Read through useSyncExternalStore so the server snapshot is "nothing
  // stored" — the configured default paints first, the visitor's own choice
  // arrives on the first commit, and neither a hydration mismatch nor a flash
  // of the wrong theme is possible.
  const stored = React.useSyncExternalStore(
    (onChange) => subscribeToStorage(storageKey, onChange),
    () => readStoredTheme(storageKey),
    () => null,
  );
  const [override, setOverride] = React.useState<PortalTheme | null>(null);
  const theme = override ?? stored ?? preferred;

  const systemDark = React.useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );

  const dark = theme === "dark" || (theme === "system" && systemDark);

  const set = React.useCallback(
    (next: PortalTheme) => {
      setOverride(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // The choice then lasts this visit, which is better than failing.
      }
    },
    [storageKey],
  );

  return (
    <PortalThemeContext.Provider value={{ theme, set }}>
      {/* Scoped to this subtree: the class goes here, never on <html>, so the
          application's own theme is untouched even in another tab. Both classes
          are stated, never just the dark one — a portal set to light inside an
          app set to dark has to say so, or it inherits the dark it is sitting
          in (see the `dark` custom variant in globals.css). */}
      <div className={cn(dark ? "dark" : "light")}>{children}</div>
    </PortalThemeContext.Provider>
  );
}

/**
 * Whether the page is current, as a glyph.
 *
 * A portal that quietly shows an hour-old board is worse than one that says so,
 * but a line of prose about it in the header was louder than the figures beside
 * it. Three states in one small mark: turning while a read is in flight, a tick
 * for a moment when one lands, and a resting dot the rest of the time. The
 * words are still there for anyone who wants them — as the tooltip and, for a
 * screen reader, in a live region.
 */
function FreshnessMark({ stale, servedAt }: { stale: boolean; servedAt: string | null }) {
  // A new `servedAt` means a read landed. Noticed during render rather than in
  // an effect — an effect that sets state as it runs costs an extra render of
  // the whole header every four seconds.
  const [landedAt, setLandedAt] = React.useState<string | null>(null);
  const [seen, setSeen] = React.useState(servedAt);
  if (servedAt !== seen) {
    setSeen(servedAt);
    setLandedAt(servedAt);
  }
  React.useEffect(() => {
    if (!landedAt) return;
    const timer = window.setTimeout(() => setLandedAt(null), 1600);
    return () => window.clearTimeout(timer);
  }, [landedAt]);

  const justLanded = !!landedAt && !stale;
  const label = stale ? "Updating…" : servedAt ? `Updated ${new Date(servedAt).toLocaleTimeString()}` : "Loading";
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center text-muted-foreground"
      title={label}
      data-testid="portal-served-at"
      data-state={stale ? "updating" : justLanded ? "updated" : "idle"}
    >
      {stale ? (
        <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
      ) : justLanded ? (
        <Check aria-hidden className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <span aria-hidden className="size-1.5 rounded-full bg-current opacity-40" />
      )}
      {/* Announced rather than drawn: the glyph carries no text of its own. */}
      <span className="sr-only" aria-live="polite">
        {stale ? "Updating" : servedAt ? "Updated" : ""}
      </span>
    </span>
  );
}

/**
 * What the department has, at a glance.
 *
 * Computed on the server over every request the department has, not over what
 * the board happens to be filtering to — a figure that moved when somebody
 * typed in the search box would be answering a different question from the one
 * being asked. Each is dropped when there is nothing to say: no overdue work,
 * nobody assigned, no deliverables.
 */
function PortalRecap({ totals }: { totals: PortalTotals }) {
  const { deliverables } = totals;
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0.5 border-border/70 sm:ml-2 sm:border-l sm:pl-5" data-testid="portal-totals">
      <Figure value={totals.requests} label={totals.requests === 1 ? "request" : "requests"} />
      <Figure value={totals.done} label="done" tone="text-emerald-600 dark:text-emerald-400" />
      {totals.overdue > 0 && <Figure value={totals.overdue} label="overdue" tone="text-destructive" />}
      {totals.byPerson.length > 0 && <Figure value={totals.byPerson.length} label="working on it" />}
      {deliverables.total > 0 && <Figure value={deliverables.total} label={deliverables.total === 1 ? "deliverable" : "deliverables"} />}
      {deliverables.types > 0 && <Figure value={deliverables.types} label={deliverables.types === 1 ? "asset type" : "asset types"} />}
    </div>
  );
}

function Figure({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={cn("text-[15px] font-semibold tabular tracking-tight", tone)}>{value}</span>
      <span className="text-2xs text-muted-foreground">{label}</span>
    </span>
  );
}

const PortalThemeContext = React.createContext<{ theme: PortalTheme; set: (theme: PortalTheme) => void } | null>(null);

function readStoredTheme(key: string): PortalTheme | null {
  try {
    const value = window.localStorage.getItem(key);
    return value === "light" || value === "dark" || value === "system" ? value : null;
  } catch {
    // A browser with storage blocked simply gets the configured default.
    return null;
  }
}

/** Another tab of the same portal changing its theme; nothing else. */
function subscribeToStorage(key: string, onChange: () => void): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key === key) onChange();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

const THEME_ICONS: Record<PortalTheme, React.ComponentType<{ className?: string }>> = { light: Sun, dark: Moon, system: SunMoon };

export function PortalHeader({
  token,
  departmentName,
  creativeTeamName,
  viewerName,
  servedAt,
  stale,
  totals,
  description,
}: {
  token: string;
  departmentName: string;
  creativeTeamName: string;
  viewerName: string | null;
  servedAt: string | null;
  stale: boolean;
  /** The figures over the whole department, shown beside its name. */
  totals?: PortalTotals | null;
  /** The team's own line about this department, in place of the standing subtitle. */
  description?: string | null;
}) {
  const themeContext = React.useContext(PortalThemeContext);
  return (
    <header className="border-b border-border/70 bg-background">
      {/* Edge to edge, like everything under it. Boxed to a column of its own it
          left the name floating in the middle of a full-width page. */}
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <BrandMark className="size-9 shrink-0 rounded-lg" />
        {/* The department leads. Whoever is reading this works in it, and the
            page is about their work; the team's name is the answer to "who is
            doing it", which is context, not the title. */}
        <div className="min-w-0 shrink-0">
          <p className="truncate text-[15px] font-semibold tracking-tight" data-testid="portal-department-name">
            {departmentName}
          </p>
          <p className="truncate text-2xs text-muted-foreground">{description?.trim() || `${creativeTeamName} · requests and bookings`}</p>
        </div>

        {totals && <PortalRecap totals={totals} />}

        <div className="flex flex-1 items-center justify-end gap-3">
          <FreshnessMark stale={stale} servedAt={servedAt} />

        {themeContext && (
          <div role="radiogroup" aria-label="Theme" className="inline-flex shrink-0 items-center rounded-full border border-border/70 p-0.5">
            {(["light", "dark", "system"] as const).map((option) => {
              const Icon = THEME_ICONS[option];
              const active = themeContext.theme === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${option} theme`}
                  onClick={() => themeContext.set(option)}
                  className={cn("flex size-9 items-center justify-center rounded-full transition-colors", active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                  data-testid={`portal-theme-${option}`}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        )}

        {viewerName ? (
          <span className="shrink-0 rounded-full bg-surface-strong/70 px-2.5 py-1 text-2xs font-medium" data-testid="portal-viewer">
            {viewerName}
          </span>
        ) : (
          <a
            href={`/login?next=${encodeURIComponent(`/portal/${token}`)}`}
            className="shrink-0 rounded-full border border-border/70 px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
            data-testid="portal-signin"
          >
            Staff sign in
          </a>
        )}
        </div>
      </div>
    </header>
  );
}
