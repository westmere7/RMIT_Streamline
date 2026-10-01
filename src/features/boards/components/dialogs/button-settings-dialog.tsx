"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import * as React from "react";
import { create } from "zustand";
import { ColorPicker } from "@/components/shared/color-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BUTTON_ACTION_KINDS,
  BUTTON_ACTION_LABELS,
  BUTTON_DUE_LABELS,
  BUTTON_DUE_OFFSETS,
  BUTTON_LABEL_MAX,
  BUTTON_MAX_ACTIONS,
  BUTTON_PRESETS,
  BUTTON_STYLE_LABELS,
  BUTTON_STYLES,
  buttonActionIncomplete,
  buttonSettings,
  columnLabels,
  newButtonAction,
  statusRoleIds,
  type ButtonAction,
  type ButtonActionKind,
  type ButtonColumnSettings,
  type ButtonDueOffset,
} from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { ButtonFace } from "@/features/boards/components/cells/activity-cells";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

/** Which Button column's settings are open. One dialog for the board, opened from a column's menu or by adding one. */
export const useButtonSettingsDialog = create<{ columnId: string | null; show: (columnId: string) => void; hide: () => void }>((set) => ({
  columnId: null,
  show: (columnId) => set({ columnId }),
  hide: () => set({ columnId: null }),
}));

/** Mounted once per board screen. */
export function ButtonSettingsHost() {
  const { model } = useBoardContext();
  const { columnId, hide } = useButtonSettingsDialog();
  const column = columnId ? model.columns.find((c) => c.id === columnId && c.type === "BUTTON") : undefined;
  return (
    <Dialog open={!!column} onOpenChange={(open) => !open && hide()}>
      <DialogContent className="sm:max-w-lg" data-testid="button-settings-dialog">
        {column && <ButtonSettingsForm key={column.id} columnId={column.id} initial={buttonSettings(column.settings)} onDone={hide} />}
      </DialogContent>
    </Dialog>
  );
}

function ButtonSettingsForm({ columnId, initial, onDone }: { columnId: string; initial: ButtonColumnSettings; onDone: () => void }) {
  const { mutations } = useBoardContext();
  const [draft, setDraft] = React.useState<ButtonColumnSettings>(initial);
  const set = (patch: Partial<ButtonColumnSettings>) => setDraft((d) => ({ ...d, ...patch }));
  const setAction = (index: number, action: ButtonAction) => set({ actions: draft.actions.map((a, i) => (i === index ? action : a)) });
  const move = (index: number, by: -1 | 1) => {
    const next = [...draft.actions];
    const [step] = next.splice(index, 1);
    next.splice(index + by, 0, step!);
    set({ actions: next });
  };
  const incomplete = draft.actions.some(buttonActionIncomplete);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void mutations.updateColumn(columnId, { settings: buttonSettings(draft) });
        onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>Button</DialogTitle>
      </DialogHeader>

      <div className="flex flex-wrap gap-1.5" data-testid="button-presets">
        {BUTTON_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setDraft((d) => ({ ...d, ...structuredClone(preset.settings) }))}
            className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-xs font-medium transition-colors hover:bg-accent")}
          >
            <span aria-hidden className={cn("size-2 rounded-full", colorClasses(preset.settings.color).dot)} />
            {preset.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="button-label">Label</Label>
          <Input id="button-label" value={draft.label} maxLength={BUTTON_LABEL_MAX} onChange={(e) => set({ label: e.target.value })} data-testid="button-label" />
        </div>
        <div className="space-y-1.5">
          <Label>Preview</Label>
          <div className="flex h-9 min-w-28 items-center justify-center rounded-lg border border-dashed border-border/80 px-3">
            <ButtonFace settings={{ ...draft, label: draft.label.trim() || "Button" }} />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Colour</Label>
        <ColorPicker value={draft.color} onChange={(color) => set({ color })} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="space-y-1.5">
          <Label>Style</Label>
          <div role="radiogroup" aria-label="Style" className="flex gap-1 rounded-lg bg-surface p-0.5">
            {BUTTON_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                role="radio"
                aria-checked={draft.style === style}
                onClick={() => set({ style })}
                className={cn("h-7 rounded-md px-2.5 text-xs font-medium", draft.style === style ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground")}
              >
                {BUTTON_STYLE_LABELS[style]}
              </button>
            ))}
          </div>
        </div>
        <label className="mt-5 flex items-center gap-2 text-[13px]">
          <Checkbox checked={draft.confirm} onCheckedChange={(checked) => set({ confirm: checked === true })} data-testid="button-confirm" />
          Ask before running
        </label>
      </div>

      <div className="space-y-2">
        <Label>When pressed</Label>
        <ol className="space-y-1.5" data-testid="button-actions">
          {draft.actions.map((action, index) => (
            <li key={index} className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-surface/60 p-1.5">
              <span className="w-5 shrink-0 text-center text-2xs text-muted-foreground tabular">{index + 1}</span>
              <ActionEditor action={action} onChange={(next) => setAction(index, next)} />
              <div className="ml-auto flex shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Earlier">
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" disabled={index === draft.actions.length - 1} onClick={() => move(index, 1)} aria-label="Later">
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => set({ actions: draft.actions.filter((_, i) => i !== index) })} aria-label="Remove step">
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        {draft.actions.length < BUTTON_MAX_ACTIONS && (
          <Select value="" onValueChange={(kind) => set({ actions: [...draft.actions, newButtonAction(kind as ButtonActionKind)] })}>
            <SelectTrigger className="h-8 w-56" data-testid="button-add-action">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Plus className="size-3.5" /> Add a step
              </span>
            </SelectTrigger>
            <SelectContent>
              {BUTTON_ACTION_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {BUTTON_ACTION_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!draft.label.trim() || incomplete} data-testid="button-settings-save">
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

/** One step: what it does, and the one choice it needs, inline. */
function ActionEditor({ action, onChange }: { action: ButtonAction; onChange: (action: ButtonAction) => void }) {
  const { model } = useBoardContext();
  const title = <span className="shrink-0 text-[13px] font-medium">{BUTTON_ACTION_LABELS[action.kind]}</span>;
  const pick = (value: string, options: Array<{ value: string; label: string; dot?: string }>, onPick: (value: string) => void, placeholder: string) => (
    <Select value={value} onValueChange={onPick}>
      <SelectTrigger className="h-7 w-40 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              {option.dot && <span aria-hidden className={cn("size-2 rounded-full", option.dot)} />}
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  switch (action.kind) {
    case "set_status": {
      const column = model.statusColumn;
      const labels = column ? columnLabels(column) : [];
      const doneId = column?.settings.kind === "status" ? (statusRoleIds(column.settings, "done")[0] ?? "") : "";
      return (
        <div className="flex min-w-0 items-center gap-2">
          {title}
          {pick(action.labelId ?? doneId, labels.map((l) => ({ value: l.id, label: l.name, dot: colorClasses(l.color).dot })), (labelId) => onChange({ ...action, labelId }), "Pick a label")}
        </div>
      );
    }
    case "set_priority": {
      const labels = model.priorityColumn ? columnLabels(model.priorityColumn) : [];
      return (
        <div className="flex min-w-0 items-center gap-2">
          {title}
          {pick(action.labelId ?? "", labels.map((l) => ({ value: l.id, label: l.name, dot: colorClasses(l.color).dot })), (labelId) => onChange({ ...action, labelId }), "Pick a priority")}
        </div>
      );
    }
    case "set_due":
      return (
        <div className="flex min-w-0 items-center gap-2">
          {title}
          {pick(action.offset, BUTTON_DUE_OFFSETS.map((o) => ({ value: o, label: BUTTON_DUE_LABELS[o] })), (offset) => onChange({ ...action, offset: offset as ButtonDueOffset }), "When")}
        </div>
      );
    case "move_to_group":
      return (
        <div className="flex min-w-0 items-center gap-2">
          {title}
          {pick(action.groupId ?? "", model.groups.map((g) => ({ value: g.id, label: g.name, dot: colorClasses(g.color).dot })), (groupId) => onChange({ ...action, groupId }), "Pick a group")}
        </div>
      );
    case "post_update":
      return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {title}
          <Input value={action.text} onChange={(e) => onChange({ ...action, text: e.target.value })} placeholder="What it says" className="h-7 min-w-0 flex-1 text-xs" />
        </div>
      );
    case "open_link":
      return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {title}
          <Input value={action.url} onChange={(e) => onChange({ ...action, url: e.target.value })} placeholder="https://" className="h-7 min-w-0 flex-1 text-xs" />
        </div>
      );
    default:
      return title;
  }
}
