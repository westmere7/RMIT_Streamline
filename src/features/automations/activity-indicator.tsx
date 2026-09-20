"use client";

import { cn } from "@/lib/utils";

/**
 * The two marks that say "an automation is at work right now".
 *
 * Both are overlays: they sit on top of whatever control stands for
 * automations in that layout, rather than being a control of their own, so
 * the thing a person taps to find out more is the thing that is moving.
 *
 *   AutomationRing   a ring turning round a button — the board's own icon on
 *                    a desktop, the board menu on a phone, where the rule is
 *                    running on the board in front of the reader.
 *   AutomationOrbit  one bright segment running round a rounded tile — the
 *                    sidebar's Automations item, the phone's More tab, where
 *                    the rule is running somewhere the reader is not looking.
 *
 * Both respect reduced motion by standing still rather than disappearing: a
 * static ring is still a ring. The parent must be `relative`.
 */

export function AutomationRing({ className, testId = "automation-running-ring" }: { className?: string; testId?: string }) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute -inset-1 rounded-full border-2 border-primary/20 border-t-primary animate-spin motion-reduce:animate-none", className)}
      data-testid={testId}
    />
  );
}

/**
 * Drawn a pixel outside its parent so the stroke sits on the parent's edge.
 * The shape carries `pathLength="100"`, so the dash lengths in the stylesheet
 * (`.automation-orbit`, globals.css) are percentages of the outline whatever
 * size the tile is.
 */
export function AutomationOrbit({ className, testId = "automation-running-orbit" }: { className?: string; testId?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 30 30" fill="none" className={cn("pointer-events-none absolute -inset-px", className)} data-testid={testId}>
      <rect x="1" y="1" width="28" height="28" rx="8.5" strokeWidth="1.5" className="stroke-primary/20" />
      <rect x="1" y="1" width="28" height="28" rx="8.5" pathLength="100" strokeWidth="1.5" strokeLinecap="round" className="automation-orbit stroke-primary" />
    </svg>
  );
}
