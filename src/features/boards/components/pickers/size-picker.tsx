"use client";

import { ArrowRight, Check, Shirt } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_SIZE_SCALE,
  T_SHIRT_SIZES,
  T_SHIRT_SIZE_COLORS,
  describeEffort,
  formatSizeSpan,
  formatSizeSpanShort,
  type SizeFit,
  type SizeScale,
  type TShirtSize,
} from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * A size as a small pill: a shirt outline and the letters, tinted by size so a
 * column reads as a scale from cool (XS) to warm (XL). Empty cells show a faint
 * shirt so the column is still recognisable. A size that follows its assets
 * carries a small dot.
 */
export function SizePill({ size, auto = false, className }: { size: TShirtSize | null; auto?: boolean; className?: string }) {
  if (!size) {
    return (
      <span className={cn("inline-flex items-center text-muted-foreground/40", className)} aria-hidden>
        <Shirt className="size-3.5" />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-2xs font-semibold tabular", colorClasses(T_SHIRT_SIZE_COLORS[size]).soft, className)} data-testid="size-pill" data-size={size} data-auto={auto || undefined}>
      <Shirt className="size-3 shrink-0 opacity-70" aria-hidden />
      {size}
      {auto && <span className="size-1 rounded-full bg-current opacity-60" aria-label="follows assets" />}
    </span>
  );
}

/** What the picker knows about the task's own work, from its asset lines. */
export interface SizeEvidence {
  /** The task has asset lines at all. */
  hasAssets: boolean;
  /** Hours of the lines whose types have a rate. */
  hours: number;
  /** Where those hours sit on the scale, or null when there are none. */
  fit: SizeFit | null;
  /** Asset types on the task with no rate, left out of the hours. */
  unrated: string[];
}

/**
 * The size of a task, with what each size means and where the task's assets put it.
 *
 * Five tiles with their spans; under them, the task's hours as a marker on the
 * same row, so "fits S" can be seen as well as read. Hovering a tile describes
 * that size. With assets, the fitting size is one click away, and "Follow
 * assets" keeps the size in step as the lines change.
 */
export function SizePicker({
  value,
  auto = false,
  onChange,
  scale = DEFAULT_SIZE_SCALE,
  evidence = null,
  settingsHref = null,
}: {
  value: TShirtSize | null;
  auto?: boolean;
  onChange: (size: TShirtSize | null, auto: boolean, keepOpen?: boolean) => void;
  scale?: SizeScale;
  evidence?: SizeEvidence | null;
  settingsHref?: string | null;
}) {
  const [hovered, setHovered] = React.useState<TShirtSize | null>(null);
  const fit = evidence?.fit ?? null;
  const shown = hovered ?? value ?? fit?.size ?? "M";
  const definition = scale[shown];

  return (
    <div className="flex w-[340px] max-w-[calc(100vw-2rem)] flex-col" data-testid="size-picker">
      <div className="p-2.5 pb-2">
        <div className="grid grid-cols-5 gap-1" role="listbox" aria-label="Size" onMouseLeave={() => setHovered(null)}>
          {T_SHIRT_SIZES.map((size) => {
            const active = value === size;
            return (
              <button
                key={size}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onChange(size, false)}
                onMouseEnter={() => setHovered(size)}
                onFocus={() => setHovered(size)}
                className={cn(
                  "relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg ring-2 ring-transparent transition-shadow hover:ring-ring/50 focus-visible:outline-none focus-visible:ring-ring/70",
                  colorClasses(T_SHIRT_SIZE_COLORS[size]).soft,
                  active && "ring-ring",
                )}
                data-testid={`size-option-${size}`}
              >
                <span className="flex items-center gap-1 text-xs font-semibold">
                  <Shirt className="size-3 opacity-70" aria-hidden />
                  {size}
                </span>
                <span className="text-[10px] font-medium tabular opacity-75">{formatSizeSpanShort(scale[size].span)}</span>
                {active && <Check className="absolute -top-1 -right-1 size-3.5 rounded-full bg-ring p-0.5 text-white" aria-hidden />}
              </button>
            );
          })}
        </div>
        {/* The task's hours on the same row as the tiles: each tile is a span, and the marker sits where the hours fall in it. */}
        {fit && (
          <div className="relative mt-2 h-1.5 rounded-full bg-muted" aria-hidden data-testid="size-fit-track">
            <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/25" style={{ width: `${fit.position * 100}%` }} />
            <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-popover bg-foreground shadow-sm" style={{ left: `${Math.min(fit.position * 100, 98.5)}%` }} />
          </div>
        )}
      </div>

      <div className="border-t border-border/70 px-3 py-2.5" data-testid="size-definition">
        <p className="flex items-baseline gap-1.5 text-[13px]">
          <span className="font-semibold">{shown}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium tabular">{formatSizeSpan(definition.span)}</span>
        </p>
        {definition.scope && <p className="text-2xs text-muted-foreground">{definition.scope}</p>}
        {definition.examples.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-2xs text-foreground/80">
            {definition.examples.slice(0, 4).map((example) => (
              <li key={example} className="flex gap-1.5">
                <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span className="min-w-0">{example}</span>
              </li>
            ))}
            {definition.examples.length > 4 && <li className="pl-2.5 text-muted-foreground">and {definition.examples.length - 4} more</li>}
          </ul>
        )}
      </div>

      {evidence && <FitSection value={value} auto={auto} evidence={evidence} onChange={onChange} settingsHref={settingsHref} />}

      <div className="flex items-center justify-between border-t border-border/70 px-2 py-1.5">
        {value ? (
          <button type="button" onClick={() => onChange(null, false)} className="rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground">
            Clear size
          </button>
        ) : (
          <span />
        )}
        {settingsHref && (
          <Link href={`${settingsHref}`} className="rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground">
            Edit sizes
          </Link>
        )}
      </div>
    </div>
  );
}

function FitSection({ value, auto, evidence, onChange, settingsHref }: { value: TShirtSize | null; auto: boolean; evidence: SizeEvidence; onChange: (size: TShirtSize | null, auto: boolean, keepOpen?: boolean) => void; settingsHref: string | null }) {
  const { fit, hours, hasAssets, unrated } = evidence;
  const ratesHref = settingsHref ? settingsHref.replace(/section=[^&]*/, "section=asset-types") : null;
  if (!hasAssets) {
    return <p className="border-t border-border/70 px-3 py-2.5 text-2xs text-muted-foreground">Add assets to see which size this task fits.</p>;
  }
  if (!fit) {
    return (
      <p className="border-t border-border/70 px-3 py-2.5 text-2xs text-muted-foreground" data-testid="size-fit-unrated">
        This task&apos;s asset types have no rates yet, so its size can&apos;t be worked out.{" "}
        {ratesHref && (
          <Link href={ratesHref} className="font-medium text-foreground underline-offset-2 hover:underline">
            Add rates
          </Link>
        )}
      </p>
    );
  }
  const matches = value === fit.size;
  return (
    <div className="space-y-2 border-t border-border/70 bg-muted/30 px-3 py-2.5" data-testid="size-fit">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xs text-muted-foreground">From its assets</p>
          <p className="text-[13px] font-medium tabular">{describeEffort(hours)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-2xs text-muted-foreground">{fit.over ? "More than" : "Fits"}</span>
          <SizePill size={fit.size} />
        </div>
      </div>
      {!matches && !auto && (
        <button
          type="button"
          onClick={() => onChange(fit.size, false)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-2 py-1.5 text-2xs font-semibold text-background hover:bg-foreground/90"
          data-testid="size-apply-fit"
        >
          Set to {fit.size} <ArrowRight className="size-3" aria-hidden />
        </button>
      )}
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[13px] font-medium">Follow assets</span>
          <span className="block text-2xs text-muted-foreground">The size changes as assets are added or removed.</span>
        </span>
        <Switch checked={auto} onCheckedChange={(on) => onChange(on ? fit.size : value, on, true)} aria-label="Follow assets" data-testid="size-auto" />
      </label>
      {unrated.length > 0 && (
        <p className="text-2xs text-muted-foreground" data-testid="size-fit-missing">
          Not counted, no rate: {unrated.join(", ")}.{" "}
          {ratesHref && (
            <Link href={ratesHref} className="font-medium text-foreground underline-offset-2 hover:underline">
              Add rates
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
