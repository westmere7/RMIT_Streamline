"use client";

import { ArrowDownAZ, ArrowUpAZ, Filter, Search, Sigma, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { TRACKER_SUMMARY_LABELS, type TrackerColumn, type TrackerRow, type TrackerSheet, type TrackerSummaryKind } from "@/domain";
import { Chip } from "@/features/trackers/chip";
import { distinctValues, effectiveSummary, isViewActive, summarize, summaryKindsFor, type SheetView } from "@/features/trackers/sheet-view";
import { chipColor } from "@/features/trackers/tracker-template";
import { cn } from "@/lib/utils";

/**
 * The view bar under the toolbar: search, the filters and sort in force as
 * chips, how many rows they hide, and one button to clear the lot.
 */
export function SheetViewBar({
  sheet,
  view,
  hidden,
  visibleDataRows,
  onChange,
  searchRef,
}: {
  sheet: TrackerSheet;
  view: SheetView;
  hidden: number;
  visibleDataRows: number;
  onChange: (next: SheetView) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const active = isViewActive(view);
  const columnName = (id: string) => sheet.columns.find((c) => c.id === id)?.name ?? "column";
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5 text-[13px]" data-testid="sheet-view-bar">
      <div className="relative w-56 min-w-32 shrink">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={view.query}
          onChange={(e) => onChange({ ...view, query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onChange({ ...view, query: "" });
              (e.target as HTMLInputElement).blur();
            }
            e.stopPropagation();
          }}
          placeholder="Search this sheet (Ctrl+F)"
          aria-label="Search this sheet"
          className="h-8 rounded-full bg-surface pl-8 pr-7 hover:bg-surface-strong/70 focus-visible:bg-card"
          data-testid="sheet-search"
        />
        {view.query && (
          <button type="button" aria-label="Clear search" onClick={() => onChange({ ...view, query: "" })} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {Object.entries(view.filters).map(([columnId, values]) => (
        <span key={columnId} className="flex h-7 items-center gap-1 rounded-full bg-accent-soft pl-2.5 pr-1 text-2xs font-medium text-accent-soft-foreground" data-testid="filter-chip">
          <Filter className="size-3" />
          <span className="truncate">
            {columnName(columnId)}: {values.length === 1 ? values[0] : `${values.length} values`}
          </span>
          <button
            type="button"
            aria-label={`Remove filter on ${columnName(columnId)}`}
            onClick={() => {
              const filters = { ...view.filters };
              delete filters[columnId];
              onChange({ ...view, filters });
            }}
            className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {view.sort && (
        <span className="flex h-7 items-center gap-1 rounded-full bg-accent-soft pl-2.5 pr-1 text-2xs font-medium text-accent-soft-foreground" data-testid="sort-chip">
          {view.sort.direction === "asc" ? <ArrowDownAZ className="size-3" /> : <ArrowUpAZ className="size-3" />}
          <span className="truncate">
            {columnName(view.sort.columnId)} {view.sort.direction === "asc" ? "A→Z" : "Z→A"}
          </span>
          <button type="button" aria-label="Remove sort" onClick={() => onChange({ ...view, sort: null })} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10">
            <X className="size-3" />
          </button>
        </span>
      )}
      {active && (
        <>
          <span className="text-2xs text-muted-foreground" data-testid="view-count">
            {hidden > 0 ? `${visibleDataRows} shown · ${hidden} hidden` : `${visibleDataRows} rows`}
          </span>
          <Button variant="ghost" size="sm" className="h-7 rounded-full text-muted-foreground" onClick={() => onChange({ query: "", filters: {}, sort: null })} data-testid="clear-view">
            <X /> Clear
          </Button>
        </>
      )}
    </div>
  );
}

/** Pick which values of a column to show: the distinct values with counts, searchable. */
export function FilterValuesDialog({
  sheet,
  column,
  selected,
  open,
  onOpenChange,
  onApply,
}: {
  sheet: TrackerSheet;
  column: TrackerColumn;
  selected: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (values: string[] | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" data-testid="filter-values-dialog">
        {open && <FilterValuesForm sheet={sheet} column={column} selected={selected} onApply={onApply} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function FilterValuesForm({ sheet, column, selected, onApply, onClose }: { sheet: TrackerSheet; column: TrackerColumn; selected: string[]; onApply: (values: string[] | null) => void; onClose: () => void }) {
  const values = React.useMemo(() => distinctValues(sheet, column), [sheet, column]);
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set(selected.length ? selected : values.map((v) => v.value)));
  const [query, setQuery] = React.useState("");
  const shown = values.filter((v) => v.value.toLowerCase().includes(query.trim().toLowerCase()));
  const all = picked.size === values.length;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Filter {column.name}</DialogTitle>
        <DialogDescription>Tick the values to keep. Rows with any other value are hidden until the filter is cleared; nothing is deleted.</DialogDescription>
      </DialogHeader>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search values…" aria-label="Search values" className="h-8" autoFocus />
      <div className="flex items-center justify-between text-2xs text-muted-foreground">
        <span>
          {picked.size} of {values.length} selected
        </span>
        <div className="flex gap-2">
          <button type="button" className="hover:text-foreground" onClick={() => setPicked(new Set(values.map((v) => v.value)))}>
            Select all
          </button>
          <button type="button" className="hover:text-foreground" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      </div>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto pr-1" data-testid="filter-values">
        {shown.map(({ value, count }) => {
          const checked = picked.has(value);
          const color = column.type === "list" && value !== "(empty)" ? chipColor(column, value) : undefined;
          return (
            <li key={value}>
              <label className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] hover:bg-accent/60">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) =>
                    setPicked((prev) => {
                      const copy = new Set(prev);
                      if (next === true) copy.add(value);
                      else copy.delete(value);
                      return copy;
                    })
                  }
                  aria-label={value}
                />
                {color ? <Chip label={value} color={color} size="sm" /> : <span className={cn("min-w-0 flex-1 truncate", value === "(empty)" && "italic text-muted-foreground")}>{value}</span>}
                <span className="ml-auto text-2xs text-muted-foreground tabular">{count}</span>
              </label>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-3 text-center text-2xs text-muted-foreground">No values match.</li>}
      </ul>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            // Everything ticked means no filter at all.
            onApply(all ? null : [...picked]);
            onClose();
          }}
          disabled={picked.size === 0}
          data-testid="apply-filter"
        >
          Apply filter
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * One footer cell: the column's aggregate over the visible rows. Clicking it
 * offers the other aggregates the column type supports.
 */
export function SummaryCell({
  column,
  rows,
  canEdit,
  frozen,
  left,
  isFrozenEdge,
  onChangeSummary,
}: {
  column: TrackerColumn;
  rows: TrackerRow[];
  canEdit: boolean;
  frozen: boolean;
  left: number | undefined;
  isFrozenEdge: boolean;
  onChangeSummary: (kind: TrackerSummaryKind) => void;
}) {
  const result = summarize(column, rows);
  const kinds = summaryKindsFor(column);
  const label = (
    <span className={cn("block truncate px-2 text-2xs", column.type === "number" ? "text-right tabular" : "text-left", result.text ? "text-foreground" : "text-muted-foreground/60")}>{result.text || (canEdit ? "Σ" : "")}</span>
  );
  return (
    <td
      className={cn("sticky bottom-0 border-t border-r bg-surface p-0 align-middle", frozen ? "z-20" : "z-10", isFrozenEdge && "shadow-[2px_0_0_0_var(--border)]")}
      style={{ left: frozen ? left : undefined }}
      data-testid="summary-cell"
      title={result.text ? `${TRACKER_SUMMARY_LABELS[result.kind]} of visible rows` : undefined}
    >
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex h-7 w-full items-center rounded hover:bg-accent" aria-label={`Summary for ${column.name}: ${result.text || "none"}`}>
              {label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="flex items-center gap-1.5">
              <Sigma className="size-3" /> {column.name}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={effectiveSummary(column)} onValueChange={(kind) => onChangeSummary(kind as TrackerSummaryKind)}>
              {kinds.map((kind) => (
                <DropdownMenuRadioItem key={kind} value={kind}>
                  {TRACKER_SUMMARY_LABELS[kind]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex h-7 items-center">{label}</div>
      )}
    </td>
  );
}

/** Small hint used in the header for an active sort or filter. */
export function HeaderViewMarks({ sorted, filtered }: { sorted: "asc" | "desc" | null; filtered: boolean }) {
  if (!sorted && !filtered) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-white/80">
      {sorted === "asc" && <ArrowDownAZ className="size-3.5" aria-label="Sorted ascending" />}
      {sorted === "desc" && <ArrowUpAZ className="size-3.5" aria-label="Sorted descending" />}
      {filtered && (
        <SimpleTooltip label="Filtered">
          <Filter className="size-3" aria-label="Filtered" />
        </SimpleTooltip>
      )}
    </span>
  );
}
