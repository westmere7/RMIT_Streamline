import type { ColumnLabel, DropdownCorners, DropdownFit, DropdownLook } from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

const CORNERS: Record<DropdownCorners, string> = { rounded: "rounded-lg", pill: "rounded-full", square: "rounded-sm" };

/**
 * A dropdown label as its column says to draw it: filled, soft, outlined, a
 * dot and its name, or coloured text; rounded, pill or square; filling the
 * cell or fitting its name. The menu that picks a look draws its samples with
 * this too, so what is chosen is what the cells show.
 */
export function DropdownChip({ label, look, corners, fit, className }: { label: ColumnLabel; look: DropdownLook; corners: DropdownCorners; fit: DropdownFit; className?: string }) {
  const c = colorClasses(label.color);
  const bare = look === "dot" || look === "text";
  return (
    <span
      className={cn(
        "flex min-w-0 items-center justify-center gap-1.5 truncate text-xs font-medium",
        fit === "fill" ? "h-full w-full" : "h-6 max-w-full px-2.5",
        !bare && CORNERS[corners],
        look === "filled" && cn(c.solid, "shadow-xs"),
        look === "soft" && c.soft,
        look === "outline" && cn("border bg-transparent", c.border, c.text),
        look === "dot" && "text-foreground",
        look === "text" && c.text,
        className,
      )}
    >
      {look === "dot" && <span aria-hidden className={cn("size-2 shrink-0 rounded-full", c.dot)} />}
      <span className={cn("truncate", fit === "fill" && !bare && "px-2")}>{label.name}</span>
    </span>
  );
}
