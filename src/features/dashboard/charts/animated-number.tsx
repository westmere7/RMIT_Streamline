"use client";

import * as React from "react";
import { usePrefersReducedMotion } from "./chart-utils";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const FADE_MASK = "linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%)";

/**
 * Odometer-style number. Each digit is a vertical reel that slides to the
 * current digit with a CSS transition, so a change rolls the digits rather than
 * swapping them. Reels are keyed by decimal place, so a place keeps rolling even
 * when the number grows or shrinks; only leading digits mount or unmount.
 */
export function AnimatedNumber({ value, duration = 900, className }: { value: number; duration?: number; className?: string }) {
  const n = Math.max(0, Math.round(value));
  const s = String(n);
  const len = s.length;
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < len; i++) {
    const place = len - 1 - i;
    if (place !== len - 1 && (place + 1) % 3 === 0) {
      nodes.push(
        <span key={`c${place}`} aria-hidden className="inline-flex items-end justify-center text-[0.6em] -mx-[0.03em] translate-y-[0.12em]" style={{ height: "1em" }}>
          ,
        </span>,
      );
    }
    nodes.push(<Reel key={`d${place}`} digit={Number(s[i])} duration={duration} />);
  }
  return (
    <span className={className} aria-label={n.toLocaleString()} style={{ display: "inline-flex", alignItems: "center", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
      {nodes}
    </span>
  );
}

function Reel({ digit, duration }: { digit: number; duration: number }) {
  const reduced = usePrefersReducedMotion();
  return (
    <span aria-hidden className="relative inline-block overflow-hidden" style={{ height: "1em", WebkitMaskImage: FADE_MASK, maskImage: FADE_MASK }}>
      <span
        className="flex flex-col"
        style={{ transform: `translateY(-${digit}em)`, transition: reduced ? undefined : `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.2, 1)` }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="flex items-center justify-center" style={{ height: "1em" }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}
