"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "streamline.theme";
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const listeners = new Set<() => void>();

function isPreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    // The Dim theme is gone; whoever chose it gets Dark, its nearest.
    if (raw === "dim") return "dark";
    return isPreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export type ResolvedTheme = "light" | "dark";

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Toggles the `dark` class on <html>, and clears the old `dim` class should a
 * page still carry it. Mirrors the inline bootstrap script in the root layout.
 */
export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(preference);
  const dark = resolved === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.remove("dim");
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable (private mode); the theme still applies for this session.
  }
  applyThemePreference(preference);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyThemePreference(readThemePreference());
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Inline script (runs before hydration) so the first paint already has the right theme. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var c=document.documentElement.classList;var d=t==="dark"||t==="dim"||((t===null||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d){c.add("dark");document.documentElement.style.colorScheme="dark";}}catch(e){}})();`;

export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, readThemePreference, () => "system" as ThemePreference);
  const setPreference = useCallback((next: ThemePreference) => writeThemePreference(next), []);
  return [preference, setPreference];
}

/** Keeps "system" preference in sync with OS changes while the app is open. */
export function useSystemThemeSync(): void {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readThemePreference() === "system") applyThemePreference("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
}
