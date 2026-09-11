"use client";

import * as React from "react";
import type { NamedCount } from "@/features/dashboard/analytics";
import { cn } from "@/lib/utils";
import { ChartTooltip, formatCount, useSize } from "./chart-utils";
import { MixLegend } from "./mix-chart";
import { ChartEmpty } from "./ranked-bars";

export interface TreemapTile {
  key: string;
  /** Percentages of the box, so the map scales with the panel and needs no measurement. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The tile's colour, taken down a notch.
 *
 * A treemap is a wall of colour — twenty saturated tiles at full strength
 * shout, and nothing on the page is more important than everything else on it.
 * Each type keeps its own hue, mixed towards the card it sits on, so the map
 * reads as one surface and the palette still identifies the type. `color-mix`
 * rather than opacity: opacity would let the tile behind a hovered neighbour
 * show through, and the mix is against the card in whichever theme is on.
 */
function muted(color: string, strength = 72): string {
  return `color-mix(in oklab, ${color} ${strength}%, var(--color-card))`;
}

/** How far from square a row's tiles are; the lower, the more readable the row. */
function worstRatio(row: number[], sum: number, side: number): number {
  const max = Math.max(...row);
  const min = Math.min(...row);
  const side2 = side * side;
  const sum2 = sum * sum;
  return Math.max((side2 * max) / sum2, sum2 / (side2 * min));
}

/**
 * Squarified treemap (Bruls, Huizing and van Wijk).
 *
 * Area is the whole message — a type with twice the units gets twice the ink —
 * so the only freedom left is the shape of each tile, and the algorithm spends
 * it on keeping tiles near-square. Strips laid naively give slivers a hundred
 * times longer than they are wide, which are impossible to compare by eye and
 * impossible to hover.
 *
 * Everything is returned in percentages of the box, so the map is
 * CSS-positioned and reflows with the panel. The box's own shape still has to
 * be known while the rows are chosen, though — squarifying a 3:1 panel as if
 * it were square makes every "square" tile three times wider than it is tall,
 * which is the flaw the algorithm exists to avoid. `aspect` is width ÷ height;
 * the work happens in a space of that shape and the horizontal axis is
 * normalised back to percentages at the end. Rows are filled along whichever
 * side is currently shorter, which is what keeps the ratios in hand as the
 * space is eaten away.
 */
export function treemapLayout(values: Array<{ key: string; value: number }>, aspect = 1): TreemapTile[] {
  const items = values.filter((v) => v.value > 0);
  const total = items.reduce((sum, v) => sum + v.value, 0);
  if (total <= 0) return [];

  // A box of the panel's shape: `aspect` wide against 1 tall, in hundredths.
  const boxWidth = 100 * (aspect > 0 ? aspect : 1);
  const areas = items.map((v) => (v.value / total) * boxWidth * 100);
  const tiles: TreemapTile[] = [];
  let x = 0;
  let y = 0;
  let width = boxWidth;
  let height = 100;
  let index = 0;

  while (index < areas.length) {
    const side = Math.min(width, height);
    const row: number[] = [areas[index]!];
    let rowSum = areas[index]!;
    index += 1;
    // Take the next item only while it makes the row's worst tile squarer.
    while (index < areas.length) {
      const next = areas[index]!;
      if (worstRatio(row, rowSum, side) < worstRatio([...row, next], rowSum + next, side)) break;
      row.push(next);
      rowSum += next;
      index += 1;
    }

    const thickness = rowSum / side;
    const vertical = width >= height;
    let offset = 0;
    for (let i = 0; i < row.length; i++) {
      const length = row[i]! / thickness;
      const item = items[index - row.length + i]!;
      const tile = vertical ? { key: item.key, x, y: y + offset, w: thickness, h: length } : { key: item.key, x: x + offset, y, w: length, h: thickness };
      // Back to percentages of the real box.
      tiles.push({ ...tile, x: (tile.x / boxWidth) * 100, w: (tile.w / boxWidth) * 100 });
      offset += length;
    }
    if (vertical) {
      x += thickness;
      width -= thickness;
    } else {
      y += thickness;
      height -= thickness;
    }
  }
  return tiles;
}

/**
 * Part-to-whole for a long list: a treemap, with the names beside it.
 *
 * A stacked bar or a donut is honest for five categories and useless for
 * twenty — half of them become slivers with a label pointing at nothing. A
 * treemap gives every category a shape you can actually compare, and the
 * smallest still gets a tile rather than a sliver.
 *
 * No names inside the tiles. A name that has to fit in its own tile is a name
 * that disappears from every tile below a certain size, so the map carries the
 * shapes and the list beside it carries the words; hovering either highlights
 * the other, which is what ties a tile to its name. The colours are the
 * workspace's own tag palette, the same ones these types wear everywhere else.
 */
export function TreemapChart({
  data,
  totalLabel = "total",
  emptyMessage = "Nothing to split yet.",
  onSelect,
  format = formatCount,
  className,
  testId,
}: {
  data: NamedCount[];
  totalLabel?: string;
  emptyMessage?: string;
  onSelect?: (row: NamedCount) => void;
  /** How every figure reads — counts by default, `formatHours` for effort. */
  format?: (value: number) => string;
  className?: string;
  testId?: string;
}) {
  const [active, setActive] = React.useState<string | null>(null);
  // Where the cursor is inside the map, for the readout that follows it.
  const [at, setAt] = React.useState<{ x: number; y: number } | null>(null);
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const keyOf = (row: NamedCount) => row.id ?? row.name;
  // Rounded, so a pixel of resize does not re-run the layout; before the first
  // measurement a square is assumed and the map re-lays out once it is known.
  const aspect = width > 0 && height > 0 ? Math.round((width / height) * 20) / 20 : 1;
  const tiles = React.useMemo(() => treemapLayout(data.map((row) => ({ key: keyOf(row), value: row.value })), aspect), [data, aspect]);
  if (total <= 0 || tiles.length === 0) return <ChartEmpty message={emptyMessage} />;
  const byKey = new Map(data.map((row) => [keyOf(row), row]));

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col gap-3 lg:flex-row lg:gap-4", className)} data-testid={testId}>
      {/* No height of its own beyond a floor: the map takes whatever the panel
          has and re-lays itself out for the shape that turns out to be. */}
      <div
        ref={ref}
        className="relative h-64 min-h-64 min-w-0 flex-1 rounded-xl lg:h-auto"
        role="img"
        aria-label={`${format(total)} ${totalLabel} by ${data.length} types`}
        // One handler for the whole map rather than one per tile: what the
        // readout needs is where the cursor is, and that is the same question
        // whichever tile it happens to be over.
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAt({ x: event.clientX - box.left, y: event.clientY - box.top });
        }}
        onMouseLeave={() => {
          setActive(null);
          setAt(null);
        }}
      >
        {tiles.map((tile) => {
          const row = byKey.get(tile.key)!;
          const dim = active !== null && active !== tile.key;
          return (
            // The gap is padding on a positioned box rather than a margin, so
            // the tiles still tile: the geometry stays exactly the area the
            // value earned and the gutter is taken out of the inside.
            <div
              key={tile.key}
              className={cn("absolute p-[2px] transition-opacity duration-200", onSelect && "cursor-pointer", active === tile.key && "z-10")}
              style={{ left: `${tile.x}%`, top: `${tile.y}%`, width: `${tile.w}%`, height: `${tile.h}%`, opacity: dim ? 0.35 : 1 }}
              onMouseEnter={() => setActive(tile.key)}
              onClick={onSelect ? () => onSelect(row) : undefined}
              data-testid="treemap-tile"
              data-key={tile.key}
              data-active={active === tile.key || undefined}
            >
              <div
                className={cn("size-full rounded-[3px] transition-[background-color]", active === tile.key && "ring-2 ring-foreground/70 ring-inset")}
                style={{
                  // Brighter under the cursor: the same hue at full strength
                  // beside its muted neighbours.
                  background: active === tile.key ? muted(row.color, 100) : muted(row.color),
                }}
              />
            </div>
          );
        })}
        {/* The details, at the cursor. A tile carries no label — a name that
            has to fit inside its own tile disappears from every small one — so
            this is where the numbers are, and it follows the pointer rather
            than making the reader look away to find them. */}
        {at && active && byKey.has(active) && (
          <ChartTooltip x={at.x} y={at.y} width={width || 0} height={height || 0}>
            <p className="font-medium text-foreground">{byKey.get(active)!.name}</p>
            <p className="mt-0.5 flex items-baseline gap-1.5 tabular">
              <span className="text-sm font-semibold">{format(byKey.get(active)!.value)}</span>
              <span className="text-2xs text-muted-foreground">
                {totalLabel} · {((byKey.get(active)!.value / total) * 100).toFixed(1)}% of {format(total)}
              </span>
            </p>
            {byKey.get(active)!.detail && <p className="mt-0.5 text-2xs text-muted-foreground">{byKey.get(active)!.detail}</p>}
          </ChartTooltip>
        )}
      </div>
      <MixLegend data={data} total={total} active={active} setActive={setActive} onSelect={onSelect} format={format} className="max-h-64 lg:max-h-full lg:w-72 lg:flex-none" />
    </div>
  );
}
