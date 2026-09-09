import * as React from "react";
import type { ColumnLabel } from "@/domain";
import { priorityStrength } from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

/** The three bars, shortest first, so a level fills them left to right. */
const BARS = [
  "m22.0326977 44.1204605h-15.0933547c-2.4415789 0-4.4393444 1.9975662-4.4393444 4.439209v39.1737823c0 2.4414444 1.9977655 4.4390106 4.4393444 4.4390106h15.0933514c2.4415779 0 4.4392757-1.9975662 4.4392757-4.4390106v-39.1737823c.0000033-2.4416428-1.9976983-4.439209-4.4392724-4.439209z",
  "m57.5465698 26.6966171h-15.0932808c-2.4415779 0-4.4393463 1.9975643-4.4393463 4.4391403v56.5976105c0 2.441452 1.9977684 4.4390106 4.4393463 4.4390106h15.093216c2.4417114 0 4.4392815-1.9975586 4.4392815-4.4390106v-56.5976066c-.0000001-2.4415799-1.9974976-4.4391442-4.4392167-4.4391442z",
  "m93.0606537 7.8275404h-15.0934906c-2.4414444 0-4.4393463 1.9975624-4.4393463 4.4391413v75.4667664c0 2.4414444 1.9978333 4.4390106 4.4393463 4.4390106h15.0934906c2.4413757 0 4.4393463-1.9975662 4.4393463-4.4390106v-75.4667664c0-2.4416447-1.9979706-4.4391413-4.4393463-4.4391413z"
];

/**
 * Priority as signal strength: three bars, filled to the level, the way a phone
 * shows reception. Low fills none of them — it is the floor, not a step up.
 *
 * The bars carry the colour and the word stays grey, because down a column it is
 * the shape that is read: rising bars say "critical" before the eye reaches the
 * text, where a row of coloured pills says only "something is set".
 */
export function PrioritySignal({ level, className }: { level: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-3.5 shrink-0", className)} fill="currentColor" clipRule="evenodd" fillRule="evenodd">
      {BARS.map((bar, index) => (
        <path key={index} d={bar} className={index < level ? "opacity-100" : "opacity-20"} />
      ))}
    </svg>
  );
}

/**
 * A priority wherever it is shown: the bars tinted, the name grey, no chip
 * around either. A fixed width keeps the names starting at the same place down
 * a column while the block itself sits where its cell puts it.
 */
export function PriorityPill({ label, emptyText = "", className }: { label: ColumnLabel | null | undefined; emptyText?: string; className?: string }) {
  if (!label) {
    return <span className={cn("text-[13px] text-muted-foreground/70", className)}>{emptyText}</span>;
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground", className)}>
      <PrioritySignal level={priorityStrength(label.id)} className={colorClasses(label.color).text} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}
