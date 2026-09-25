"use client";

import * as React from "react";
import { usePrefersReducedMotion } from "./chart-utils";

/**
 * Motion for the dashboard's figures and bars: springs, not timed fades.
 *
 * A figure that changes is a thing that moved, and it should move like one: it
 * sets off with a push, carries its speed, and settles. A spring does that for
 * free, and it does the one thing a fixed-length easing cannot — when the data
 * changes again half-way through (the dashboard polls, and a filter is often
 * clicked twice), the value keeps the velocity it had and turns towards the new
 * target instead of restarting from a standstill.
 *
 * Both tunings are critically damped: the value eases in and never passes its
 * target. A bounce read as jumpy on a page of a dozen charts moving at once, and
 * a count that reads 537 on its way to 536 is saying something false for a
 * moment. Geometry (a bar, a tile, an area) moves a little more gently than a
 * number, so the figures land first and the shapes follow.
 *
 * On arrival the shapes and the big figures hold at nought until the dashboard
 * is revealed — the snapshot is in, the reader's saved view has been applied,
 * and a frame has been painted — and then grow in, so none of it plays out
 * behind the skeleton or under a main thread still busy mounting the page.
 * Scales hold their real value from the start. A panel that mounts after the
 * reveal (a tab switched to) arrives with its values in place, and nothing
 * animates for a visitor who asked for reduced motion.
 */

export type SpringKind = "gentle" | "smooth";

/**
 * "grow": held at nought until the dashboard is revealed, then sprung in. For
 * geometry and figures. "hold": the real value from the first paint. For scales,
 * which a bar growing from nought needs to already be right.
 */
export type SpringEntry = "grow" | "hold";

const RevealContext = React.createContext(true);

/** Whether the dashboard has been revealed. True outside a DashboardReveal. */
export function useRevealed(): boolean {
  return React.useContext(RevealContext);
}

/**
 * Holds the dashboard's entry motion until `ready`, then waits for two painted
 * frames (the first commit with real data, and the layout it settles into) and
 * for the tab to be visible, and reveals. Once revealed it stays revealed.
 */
export function DashboardReveal({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  const [revealed, setRevealed] = React.useState(false);
  React.useEffect(() => {
    if (revealed || !ready) return;
    let frame = 0;
    const go = () => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setRevealed(true));
      });
    };
    if (document.visibilityState === "visible") {
      go();
      return () => cancelAnimationFrame(frame);
    }
    // Opened in a background tab: rAF is paused there anyway, and the reader
    // should see it arrive, not come back to it finished.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      go();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      cancelAnimationFrame(frame);
    };
  }, [ready, revealed]);
  return <RevealContext.Provider value={revealed}>{children}</RevealContext.Provider>;
}

const SPRINGS: Record<SpringKind, { stiffness: number; damping: number }> = {
  // Critically damped (damping = 2·√stiffness): as quick as it can be without
  // ever passing the target. Geometry is the softer of the two.
  gentle: { stiffness: 90, damping: 2 * Math.sqrt(90) },
  smooth: { stiffness: 140, damping: 2 * Math.sqrt(140) },
};

/** Settled once it is this close and this slow, relative to the distance it travelled. */
const REST = 0.002;
/** A frame longer than this (a tab coming back from the background) is taken as this. */
const MAX_STEP = 1 / 30;

type Body = { x: number; v: number };

function signatureOf(targets: Record<string, number>): string {
  let out = "";
  for (const key in targets) out += `${key}=${targets[key]};`;
  return out;
}

/**
 * Springs every value of `targets` towards its target and returns where each one
 * is now. A key that appears grows in from nought; a key that goes away is gone.
 */
export function useSprings(real: Record<string, number>, kind: SpringKind = "gentle", entry: SpringEntry = "grow"): Record<string, number> {
  const reduced = usePrefersReducedMotion();
  const revealed = useRevealed();
  // Before the reveal every value aims at nought, so the reveal is simply the
  // first change of target and springs in like any other.
  const held = entry === "grow" && !revealed && !reduced;
  const targets = held ? Object.fromEntries(Object.keys(real).map((key) => [key, 0])) : real;
  const [shown, setShown] = React.useState<Record<string, number>>(targets);
  const bodies = React.useRef<Map<string, Body> | null>(null);
  const signature = signatureOf(targets);

  React.useEffect(() => {
    // The targets of the render that changed the signature.
    const goal = targets;
    // The first run only records where everything starts: the values painted on
    // mount (nought when held, the real ones otherwise) are where it starts from.
    if (bodies.current === null) {
      bodies.current = new Map(Object.entries(goal).map(([key, x]) => [key, { x, v: 0 }]));
      return;
    }
    if (reduced) return;
    const state = bodies.current;
    for (const key of [...state.keys()]) if (!(key in goal)) state.delete(key);
    for (const key in goal) if (!state.has(key)) state.set(key, { x: 0, v: 0 });

    const { stiffness, damping } = SPRINGS[kind];
    const spans = new Map<string, number>();
    for (const [key, body] of state) spans.set(key, Math.max(1e-6, Math.abs(goal[key]! - body.x)));

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(MAX_STEP, Math.max(0, (now - last) / 1000));
      last = now;
      let moving = false;
      const next: Record<string, number> = {};
      for (const [key, body] of state) {
        const target = goal[key]!;
        // Semi-implicit Euler, in small steps so a long frame cannot blow it up.
        const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          body.v += (-stiffness * (body.x - target) - damping * body.v) * h;
          body.x += body.v * h;
        }
        const span = spans.get(key)!;
        if (Math.abs(body.x - target) / span < REST && Math.abs(body.v) / span < REST * 10) {
          body.x = target;
          body.v = 0;
        } else moving = true;
        next[key] = body.x;
      }
      setShown(next);
      if (moving) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The signature is the targets, flattened: an effect per change of value,
    // not per render of a parent that rebuilt an equal object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reduced, kind]);

  if (reduced) return real;
  // A key the springs have not reached yet starts from nothing, so it grows in.
  const out: Record<string, number> = {};
  for (const key in targets) out[key] = key in shown ? shown[key]! : 0;
  return out;
}

/** One value on a spring. */
export function useSpring(target: number, kind: SpringKind = "smooth", entry: SpringEntry = "grow"): number {
  return useSprings({ value: target }, kind, entry).value!;
}

/**
 * A figure that counts its way to a new value. For the big and medium figures
 * only: a small number in a row or a legend is plain text.
 *
 * `format` receives the value in flight, so a count stays whole by rounding and
 * hours keep their decimals. The final value is what a screen reader hears.
 */
export function KineticNumber({ value, format, className }: { value: number; format: (value: number) => string; className?: string }) {
  const shown = useSpring(value, "smooth");
  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}
