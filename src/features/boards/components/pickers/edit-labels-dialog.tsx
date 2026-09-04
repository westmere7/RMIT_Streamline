"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BoardColumn, ColumnLabel, ColumnSettings, PriorityColumnSettings, StatusColumnSettings } from "@/domain";
import { colorClasses } from "@/lib/colors";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/utils";

export interface EditLabelsDialogProps {
  column: BoardColumn | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (columnId: string, settings: ColumnSettings) => void;
}

/** Customise the labels of a STATUS or PRIORITY column. */
export function EditLabelsDialog({ column, open, onOpenChange, onSave }: EditLabelsDialogProps) {
  const settings = column?.settings;
  if (!column || !settings || (settings.kind !== "status" && settings.kind !== "priority")) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so its state re-initialises from the column each time. */}
        <LabelsEditor column={column} settings={settings} onCancel={() => onOpenChange(false)} onSave={(next) => onSave(column.id, next)} />
      </DialogContent>
    </Dialog>
  );
}

function LabelsEditor({
  column,
  settings,
  onCancel,
  onSave,
}: {
  column: BoardColumn;
  settings: StatusColumnSettings | PriorityColumnSettings;
  onCancel: () => void;
  onSave: (settings: ColumnSettings) => void;
}) {
  const isStatus = settings.kind === "status";
  const [labels, setLabels] = React.useState<ColumnLabel[]>(() => settings.labels.map((l) => ({ ...l })));
  const [doneIds, setDoneIds] = React.useState<string[]>(() => (settings.kind === "status" ? [...settings.doneLabelIds] : []));

  const update = (id: string, patch: Partial<ColumnLabel>) => setLabels((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => {
    setLabels((ls) => ls.filter((l) => l.id !== id));
    setDoneIds((ids) => ids.filter((x) => x !== id));
  };
  const add = () => setLabels((ls) => [...ls, { id: newId().slice(0, 8), name: "New label", color: "gray" }]);

  const save = () => {
    const cleaned = labels.map((l) => ({ ...l, name: l.name.trim() || "Untitled" }));
    if (settings.kind === "status") {
      onSave({
        kind: "status",
        labels: cleaned,
        doneLabelIds: doneIds.filter((id) => cleaned.some((l) => l.id === id)),
        defaultLabelId: cleaned.some((l) => l.id === settings.defaultLabelId) ? settings.defaultLabelId : (cleaned[0]?.id ?? null),
      });
    } else {
      onSave({ kind: "priority", labels: cleaned });
    }
    onCancel();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {column.name} labels</DialogTitle>
        <DialogDescription>
          Rename, recolour, add or remove labels.{isStatus ? " Labels marked as done de-emphasise items and complete them in My Work." : ""}
        </DialogDescription>
      </DialogHeader>
      <ul className="space-y-1.5">
        {labels.map((label) => (
          <li key={label.id} className="flex items-center gap-2">
            <GripVertical className="size-4 text-muted-foreground/40" aria-hidden />
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label={`Colour for ${label.name}`} className={cn("size-7 shrink-0 rounded", colorClasses(label.color).dot)} />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2">
                <ColorPicker value={label.color} onChange={(color) => update(label.id, { color })} />
              </PopoverContent>
            </Popover>
            <Input value={label.name} onChange={(e) => update(label.id, { name: e.target.value })} aria-label="Label name" className="flex-1" />
            {isStatus && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={doneIds.includes(label.id)}
                  onCheckedChange={(next) => setDoneIds((ids) => (next ? [...ids, label.id] : ids.filter((x) => x !== label.id)))}
                />
                Done
              </label>
            )}
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${label.name}`} disabled={labels.length <= 1} onClick={() => remove(label.id)}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" onClick={add} className="self-start">
        <Plus /> Add label
      </Button>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save}>Save labels</Button>
      </DialogFooter>
    </>
  );
}
