"use client";

import { Minus, Moon, Plus, Sun } from "lucide-react";
import * as React from "react";
import { BOOKING_SCALE_MAX, BOOKING_SCALE_MIN, clampBookingScale } from "@/domain";
import { useThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The reader's view on every page someone outside the team opens: the booking
 * forms, the portal board, shared boards and tasks, and the shared dashboard.
 * One small pill, theme then size, the same on all of them.
 */

export type ViewTheme = "light" | "dark" | "system";

/** A theme to show and how to change it. Null leaves the theme half out. */
export interface ViewThemeControl {
  value: ViewTheme;
  set: (theme: ViewTheme) => void;
}

/** A size to show (percent), what it goes back to, and how to change it. Null leaves the size half out. */
export interface ViewScaleControl {
  value: number;
  base: number;
  set: (scale: number) => void;
}

const THEME_ICONS: Record<"light" | "dark", React.ComponentType<{ className?: string }>> = { light: Sun, dark: Moon };

/** Whether the device asks for dark, kept in step with it. */
function usePrefersDark(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

/** How far one press of − or + moves the size. */
export const VIEW_SCALE_STEP = 10;

/**
 * The pill itself. Nothing at all when there is neither a theme nor a size to
 * change. `navy` is for the booking pages' brand panel.
 */
export function ViewControls({
  theme,
  scale,
  tone = "canvas",
  className,
}: {
  theme: ViewThemeControl | null;
  scale: ViewScaleControl | null;
  tone?: "navy" | "canvas";
  className?: string;
}) {
  const prefersDark = usePrefersDark();
  if (!theme && !scale) return null;
  // Two choices only, light and dark: a page still set to follow the device
  // shows whichever that is, and picking one settles it.
  const shown = theme ? (theme.value === "system" ? (prefersDark ? "dark" : "light") : theme.value) : null;
  const navy = tone === "navy";
  const hover = navy ? "hover:bg-white/10 hover:text-white" : "hover:bg-accent hover:text-foreground";
  const button = cn("flex size-7 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-35", hover);
  const active = navy ? "bg-white/15 text-white" : "bg-foreground/10 text-foreground";
  return (
    <div
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full border p-0.5 text-2xs", navy ? "border-white/12 text-white/55" : "border-border/70 text-muted-foreground", className)}
      data-testid="view-controls"
    >
      {theme && (
        <div role="radiogroup" aria-label="Theme" className="flex items-center gap-0.5">
          {(["light", "dark"] as const).map((option) => {
            const Icon = THEME_ICONS[option];
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={shown === option}
                aria-label={`${option} theme`}
                title={`${option[0]!.toUpperCase()}${option.slice(1)} theme`}
                onClick={() => theme.set(option)}
                className={cn(button, shown === option && active)}
                data-testid={`view-theme-${option}`}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      )}
      {theme && scale && <span aria-hidden className={cn("mx-1 h-3.5 w-px", navy ? "bg-white/15" : "bg-border")} />}
      {scale && (
        <div role="group" aria-label="Interface size" className="flex items-center gap-0.5">
          <button type="button" className={button} onClick={() => scale.set(scale.value - VIEW_SCALE_STEP)} disabled={scale.value <= BOOKING_SCALE_MIN} aria-label="Smaller" title="Smaller" data-testid="view-scale-down">
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            className={cn("h-7 min-w-11 rounded-full px-1.5 font-medium tabular transition-colors", hover)}
            onClick={() => scale.set(scale.base)}
            title={scale.value === scale.base ? "Interface size" : `Back to ${scale.base}%`}
            aria-label={`Interface size ${scale.value}%${scale.value === scale.base ? "" : `, press for ${scale.base}%`}`}
            data-testid="view-scale-value"
          >
            {scale.value}%
          </button>
          <button type="button" className={button} onClick={() => scale.set(scale.value + VIEW_SCALE_STEP)} disabled={scale.value >= BOOKING_SCALE_MAX} aria-label="Larger" title="Larger" data-testid="view-scale-up">
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The viewer's own app theme as a view control, for pages whose link carries no
 * theme of its own. Dim shows as dark: a visitor is offered light or dark.
 */
export function useAppThemeControl(): ViewThemeControl {
  const [preference, setPreference] = useThemePreference();
  return { value: preference === "dim" ? "dark" : preference, set: setPreference };
}

/**
 * The size this visitor reads a page at: `base` unless they have chosen
 * another (and may). A choice remembers the base it was made over and lapses
 * when that changes, the way a portal theme choice does, so a team that sets
 * a new size is not overruled by a click made months ago.
 *
 * Kept in one component and handed down: the stored value is read through the
 * storage event, which a second copy in the same tab would never hear.
 */
export function useVisitorScale(storageKey: string, base = 100, allow = true): ViewScaleControl {
  const stored = React.useSyncExternalStore(
    (onChange) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    () => {
      try {
        return window.localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    () => null,
  );
  // This visit's choice, for a browser that will not store it.
  const [override, setOverride] = React.useState<string | null>(null);
  const choice = allow ? parseScaleChoice(override ?? stored) : null;
  const value = choice && choice.over === base ? choice.scale : base;
  const set = React.useCallback(
    (next: number) => {
      const scale = clampBookingScale(next);
      const raw = JSON.stringify({ scale, over: base });
      setOverride(raw);
      try {
        // Going back to the base is choosing to follow it.
        if (scale === base) window.localStorage.removeItem(storageKey);
        else window.localStorage.setItem(storageKey, raw);
      } catch {
        // The choice then lasts this visit.
      }
    },
    [storageKey, base],
  );
  return { value, base, set };
}

function parseScaleChoice(raw: string | null): { scale: number; over: number } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { scale?: unknown; over?: unknown };
    return typeof value.scale === "number" && typeof value.over === "number" ? { scale: clampBookingScale(value.scale), over: value.over } : null;
  } catch {
    return null;
  }
}

/**
 * Draws a page at `scale` percent.
 *
 * The page's own element is zoomed (with `pageZoomStyle`), never the document:
 * menus place themselves from on-screen boxes, and under a zoomed document
 * they landed that much off to the side. What they show is zoomed instead, by
 * a rule in globals.css keyed on the attribute set here, so a menu opens where
 * it should and at the page's size. Both are taken away on leaving.
 */
export function usePageZoom(scale: number): void {
  React.useEffect(() => {
    if (scale === 100) return;
    const root = document.documentElement;
    root.dataset.pageZoom = "";
    root.style.setProperty("--page-zoom", String(scale / 100));
    return () => {
      delete root.dataset.pageZoom;
      root.style.removeProperty("--page-zoom");
    };
  }, [scale]);
}

/**
 * The style for the zoomed page element. A page one screen tall is drawn that
 * much taller (or shorter) under the zoom, so it still fills exactly one screen.
 */
export function pageZoomStyle(scale: number, fill: "height" | "minHeight" = "height"): React.CSSProperties | undefined {
  if (scale === 100) return undefined;
  const factor = scale / 100;
  return { zoom: factor, [fill]: `calc(100dvh / ${factor})` };
}
