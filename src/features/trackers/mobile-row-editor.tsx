"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { TrackerRow, TrackerSheet } from "@/domain";
import { TrackerService } from "@/services/tracker-service";

/** Radix rejects an empty option value; this stands in for "not set". */
const NONE = "__none__";

/**
 * One spreadsheet row as a stack of labelled fields.
 *
 * A 3,584px grid inside a 390px window is legible and it scrolls, but editing in
 * it means panning to a cell about the size of a fingernail. This is the
 * touch-friendly alternative the grid keeps alongside itself: the same row, one
 * field per column, each full width.
 *
 * It writes through TrackerService.coerce and applyEdits — the same two calls
 * the grid's own cell editor makes — so typing, autosave, undo and redo all
 * behave exactly as they do on a desktop. Nothing about the workbook's semantics
 * is re-implemented here.
 */
export function MobileRowEditor({
  sheet,
  row,
  open,
  onOpenChange,
  commit,
}: {
  sheet: TrackerSheet;
  row: TrackerRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commit: (updater: (sheet: TrackerSheet) => TrackerSheet) => void;
}) {
  // A draft, so a half-typed number is not written on every keystroke. It is
  // seeded from the row each time the editor opens; adjusted during render
  // rather than in an effect so no frame shows the previous row's values.
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [seededFor, setSeededFor] = React.useState<string | null>(null);
  const key = open && row ? row.id : null;
  if (seededFor !== key) {
    setSeededFor(key);
    setDraft(key && row ? Object.fromEntries(sheet.columns.map((c) => [c.id, String(row.cells[c.id] ?? "")])) : {});
  }

  if (!row) return null;

  const save = () => {
    const edits = sheet.columns
      .map((column) => ({ column, value: TrackerService.coerce(column, draft[column.id] ?? "") }))
      .filter(({ column, value }) => value !== (row.cells[column.id] ?? null))
      .map(({ column, value }) => ({ rowId: row.id, columnId: column.id, value }));
    if (edits.length > 0) commit((s) => TrackerService.applyEdits(s, edits));
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Edit row"
        description={sheet.name}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="h-11 flex-1" onClick={save} data-testid="mobile-row-save">
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3 pb-2" data-testid="mobile-row-editor">
          {sheet.columns.map((column) => {
            const value = draft[column.id] ?? "";
            const set = (next: string) => setDraft((d) => ({ ...d, [column.id]: next }));
            return (
              <label key={column.id} className="block">
                <span className="mb-1 block text-2xs font-medium tracking-wide text-muted-foreground uppercase">{column.name}</span>
                {column.type === "list" && column.options && column.options.length > 0 ? (
                  <Select value={value || NONE} onValueChange={(next) => set(next === NONE ? "" : next)}>
                    <SelectTrigger aria-label={column.name}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {column.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : column.type === "checkbox" ? (
                  <span className="flex min-h-11 items-center">
                    <Checkbox checked={value === "true"} onCheckedChange={(checked) => set(checked === true ? "true" : "false")} aria-label={column.name} className="size-5" />
                  </span>
                ) : (
                  <Input
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    inputMode={column.type === "number" ? "decimal" : column.type === "url" ? "url" : undefined}
                    type={column.type === "date" ? "date" : "text"}
                    aria-label={column.name}
                  />
                )}
              </label>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
