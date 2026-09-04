"use client";

import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BoardColumn, TagOption } from "@/domain";
import { normalizeTagName } from "@/features/boards/tag-palette";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

export interface EditTagsDialogProps {
  column: BoardColumn | null;
  /** Palette entries plus any tag already used on the board, so nothing is lost on save. */
  options: TagOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `renames` maps an old tag name to its new one so item values can follow. */
  onSave: (columnId: string, options: TagOption[], renames: Record<string, string>) => void;
}

/** Customise the tag palette of a TAGS column. */
export function EditTagsDialog({ column, options, open, onOpenChange, onSave }: EditTagsDialogProps) {
  if (!column || column.settings.kind !== "tags") return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so its state re-initialises from the column each time. */}
        <TagsPaletteEditor column={column} options={options} onCancel={() => onOpenChange(false)} onSave={(next, renames) => onSave(column.id, next, renames)} />
      </DialogContent>
    </Dialog>
  );
}

interface Row extends TagOption {
  /** The name this row had when the dialog opened; null for rows added here. */
  original: string | null;
}

function TagsPaletteEditor({
  column,
  options,
  onCancel,
  onSave,
}: {
  column: BoardColumn;
  options: TagOption[];
  onCancel: () => void;
  onSave: (options: TagOption[], renames: Record<string, string>) => void;
}) {
  const [rows, setRows] = React.useState<Row[]>(() => options.map((o) => ({ ...o, original: o.name })));

  const update = (index: number, patch: Partial<TagOption>) => setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => setRows((rs) => rs.filter((_, i) => i !== index));
  const add = () => setRows((rs) => [...rs, { name: "", color: "indigo", original: null }]);

  const save = () => {
    const seen = new Set<string>();
    const cleaned: TagOption[] = [];
    const renames: Record<string, string> = {};
    for (const row of rows) {
      const name = normalizeTagName(row.name);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      cleaned.push({ name, color: row.color });
      if (row.original && row.original !== name) renames[row.original] = name;
    }
    onSave(cleaned, renames);
    onCancel();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit tags</DialogTitle>
        <DialogDescription>
          Rename, recolour, add or remove the tags the “{column.name}” column offers. Renaming updates every item that uses the tag; removing one takes it off those
          items.
        </DialogDescription>
      </DialogHeader>
      <ul className="scrollbar-thin max-h-[22rem] space-y-1.5 overflow-y-auto">
        {rows.map((row, index) => (
          <li key={`${row.original ?? "new"}-${index}`} className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label={`Colour for ${row.name || "new tag"}`} className={cn("size-7 shrink-0 rounded-lg", colorClasses(row.color).dot)} />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2">
                <ColorPicker value={row.color} onChange={(color) => update(index, { color })} />
              </PopoverContent>
            </Popover>
            <div className="relative flex-1">
              <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-muted-foreground">
                #
              </span>
              <Input value={row.name} placeholder="tag-name" onChange={(e) => update(index, { name: e.target.value })} aria-label="Tag name" className="pl-6" />
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${row.name || "tag"}`} onClick={() => remove(index)}>
              <Trash2 />
            </Button>
          </li>
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-[13px] text-muted-foreground">No tags yet. Add the first one below.</li>}
      </ul>
      <Button variant="outline" size="sm" onClick={add} className="self-start">
        <Plus /> Add tag
      </Button>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save}>Save tags</Button>
      </DialogFooter>
    </>
  );
}
