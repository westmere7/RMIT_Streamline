"use client";

import { CalendarDays, Check, ChevronRight, Copy, Hash, Minus, Pencil, Plus, Tag, Trash2, TriangleAlert, UserRound } from "lucide-react";
import * as React from "react";
import { LabelPill } from "@/components/shared/label-pill";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { User } from "@/domain";
import { ASSET_TYPE_OPTIONS, assetCount } from "@/domain";
import { DatePicker } from "@/features/boards/components/pickers/date-picker";
import { PersonPicker } from "@/features/boards/components/pickers/person-picker";
import { assetTypeLabel } from "@/features/items/item-assets-recap";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { nowIso } from "@/lib/ids";
import { cn } from "@/lib/utils";

/**
 * One deliverable as the composer holds it. The same shape whether it is saved
 * (an item's asset row) or still being typed (a booking that has not been sent),
 * so both places edit it with the same controls.
 */
export interface AssetComposerRow {
  id: string;
  name: string;
  assetType: string | null;
  quantity: number | null;
  assigneeIds: string[];
  dueDate: string | null;
  notes: string | null;
  completedAt: string | null;
}

export type AssetComposerPatch = Partial<Omit<AssetComposerRow, "id">>;

/**
 * Which details this composer offers. Name, quantity and spec are always there;
 * the rest depend on where it stands — a stakeholder booking work has nobody to
 * put in charge and nothing to tick off yet.
 */
export interface AssetComposerFields {
  done?: boolean;
  type?: boolean;
  people?: boolean;
  due?: boolean;
}

const ALL_FIELDS: Required<AssetComposerFields> = { done: true, type: true, people: true, due: true };

/**
 * The asset composer: a list of deliverables, one row each, with a box above it
 * for the next one.
 *
 * A row is a single line until you open it — a tick, its number, its name and
 * the short version of its details — because reading the list is the common act
 * and editing one of them is the rare one. Opening one turns those details into
 * the pickers that set them.
 *
 * An open row is a draft: the pickers change what is on screen and nothing else
 * until Update saves it, and Discard puts it back. Ticking one off and renaming
 * it are not part of that draft — they land at once, the way they read.
 *
 * It is built for a 520px panel, so nothing relies on width: every row truncates
 * and the chips wrap.
 */
export function AssetComposer({
  rows,
  fields,
  users = [],
  canEdit = true,
  disabled = false,
  addPlaceholder = "Add an item, e.g. A1 poster",
  emptyText,
  onAdd,
  onPatch,
  onDuplicate,
  onRemove,
}: {
  rows: readonly AssetComposerRow[];
  fields?: AssetComposerFields;
  /** Needed only when `fields.people` is on. */
  users?: User[];
  canEdit?: boolean;
  /** Shown but inert — the form editor's preview. */
  disabled?: boolean;
  addPlaceholder?: string;
  emptyText?: string;
  onAdd: (name: string) => void;
  onPatch: (id: string, patch: AssetComposerPatch) => void;
  onDuplicate: (row: AssetComposerRow) => void;
  onRemove: (id: string) => void;
}) {
  const on = { ...ALL_FIELDS, ...fields };
  const [newName, setNewName] = React.useState("");
  // Which of them are open. One added just now opens itself, since the next
  // thing anyone does is fill in its details.
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const [justAdded, setJustAdded] = React.useState<string | null>(null);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    onAdd(name);
    setJustAdded(name);
    setNewName("");
  };

  return (
    <div>
      {/* ---- Add one. Above the list: it stays put however long the list gets. */}
      {/* Not a <form>: the booking page already is one, and a form inside a form
          is invalid — Enter is handled on the field instead. */}
      {canEdit && (
        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-1.5 shadow-xs focus-within:ring-2 focus-within:ring-ring">
          <Plus className="size-3.5 shrink-0 text-muted-foreground/60" />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              add();
            }}
            placeholder={addPlaceholder}
            aria-label="Add an asset item"
            disabled={disabled}
            data-testid="asset-add-input"
            className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
          />
          <Button type="button" onClick={add} size="sm" variant="secondary" className="h-7 shrink-0" disabled={disabled || !newName.trim()} data-testid="asset-add-submit">
            Add
          </Button>
        </div>
      )}

      <ul className={cn("space-y-1.5", canEdit && "mt-2")} data-testid="asset-lines">
        {rows.map((row, index) => (
          <AssetRowCard
            key={row.id}
            row={row}
            number={index + 1}
            fields={on}
            users={users}
            canEdit={canEdit && !disabled}
            open={open.has(row.id) || row.name === justAdded}
            onToggle={() => {
              if (row.name === justAdded) setJustAdded(null);
              else toggle(row.id);
            }}
            onChange={(patch) => onPatch(row.id, patch)}
            onDuplicate={() => onDuplicate(row)}
            onRemove={() => onRemove(row.id)}
          />
        ))}
        {rows.length === 0 && emptyText && (
          <li className="rounded-xl border border-dashed border-border/80 px-4 py-4 text-center text-[13px] text-muted-foreground" data-testid="assets-empty">
            {emptyText}
          </li>
        )}
      </ul>
    </div>
  );
}

/** The part of a row an open form edits. Everything else about it saves as it is touched. */
interface AssetDraft {
  assetType: string | null;
  assigneeIds: string[];
  quantity: number | null;
  dueDate: string | null;
  notes: string | null;
}

function draftOf(row: AssetComposerRow): AssetDraft {
  return { assetType: row.assetType, assigneeIds: row.assigneeIds, quantity: row.quantity, dueDate: row.dueDate, notes: row.notes };
}

/** Only what the draft actually changed, so Update writes nothing it does not have to. */
function draftPatch(row: AssetComposerRow, draft: AssetDraft): AssetComposerPatch {
  const patch: AssetComposerPatch = {};
  if (draft.assetType !== row.assetType) patch.assetType = draft.assetType;
  if (draft.quantity !== row.quantity) patch.quantity = draft.quantity;
  if (draft.dueDate !== row.dueDate) patch.dueDate = draft.dueDate;
  if (draft.notes !== row.notes) patch.notes = draft.notes;
  if (draft.assigneeIds.length !== row.assigneeIds.length || draft.assigneeIds.some((id, i) => id !== row.assigneeIds[i])) patch.assigneeIds = draft.assigneeIds;
  return patch;
}

/** The quiet icon buttons at the end of a closed row. */
const rowActionClass =
  "shrink-0 rounded-md p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/line:opacity-100";

/** A control in an open row's little form. Full width, so the fields line up in columns. */
const fieldClass =
  "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 text-xs transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent";

/** Long enough to tell a double click from two single ones, short enough that opening a row still feels immediate. */
const DOUBLE_CLICK_MS = 220;

/**
 * One deliverable. Closed, it is a single row: done, number, name, and the same
 * details as a quiet summary. Open, those details become a small form — labelled
 * fields in two columns with the spec across the foot — so the controls line up
 * with each other and down the list.
 *
 * Clicking the row opens and closes it, whether it is open or not; renaming is a
 * double click (or the pencil, which is also where the keyboard finds it), so
 * reading a row and editing its name never fight over the same click.
 */
function AssetRowCard({
  row,
  number,
  fields,
  users,
  canEdit,
  open,
  onToggle,
  onChange,
  onDuplicate,
  onRemove,
}: {
  row: AssetComposerRow;
  number: number;
  fields: Required<AssetComposerFields>;
  users: User[];
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: AssetComposerPatch) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  // What the open form is holding. It starts from the row each time the row is
  // opened, so Discard is simply "close it again".
  const [draft, setDraft] = React.useState<AssetDraft>(() => draftOf(row));
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(draftOf(row));
  }
  const edit = (patch: Partial<AssetDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const patch = draftPatch(row, draft);
  const dirty = Object.keys(patch).length > 0;

  // Closed, the row reads what is saved; open, it reads the draft.
  const shown = open ? { ...row, ...draft } : row;
  const assignees = shown.assigneeIds.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const done = row.completedAt !== null;
  const overdue = !done && isOverdue(shown.dueDate);
  const typeLabel = assetTypeLabel(shown.assetType);
  const inCharge = assignees.length === 0 ? "Not set" : assignees.length === 1 ? assignees[0]!.firstName : `${assignees.length} people`;
  const [renaming, setRenaming] = React.useState(false);
  // The first click of a double click has to be held back, or a rename would
  // open (or close) the row on its way through.
  const pending = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    },
    [],
  );

  const click = () => {
    if (renaming || pending.current !== null) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      onToggle();
    }, DOUBLE_CLICK_MS);
  };

  const save = () => {
    if (dirty) onChange(patch);
    onToggle();
  };

  const discard = () => {
    setDraft(draftOf(row));
    onToggle();
  };

  const rename = () => {
    if (!canEdit) return;
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
    setRenaming(true);
  };

  return (
    <li
      className={cn("group/line rounded-xl border border-border/70 bg-card shadow-xs transition-colors", open && "border-border ring-1 ring-border/60", done && "bg-card/60")}
      data-testid="asset-line"
      data-asset-name={row.name}
      data-asset-done={done ? "true" : "false"}
    >
      {/* ---- The row you read ---------------------------------------------- */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {fields.done && (
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={done ? `Mark ${row.name} as not done` : `Mark ${row.name} as done`}
            disabled={!canEdit}
            onClick={() => onChange({ completedAt: done ? null : nowIso() })}
            data-testid="asset-done"
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
              done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border/80 hover:border-ring",
              !canEdit && "cursor-default opacity-70",
            )}
          >
            {done && <Check className="size-3" strokeWidth={3} />}
          </button>
        )}

        <span className="w-5 shrink-0 text-xs tabular text-muted-foreground/60" aria-hidden data-testid="asset-number">
          #{number}
        </span>

        {/* Name and summary together: one target, so a click anywhere along the row opens it. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 select-none" onClick={click} onDoubleClick={rename}>
          {renaming && canEdit ? (
            <TextField
              value={row.name}
              placeholder="Asset"
              ariaLabel={`Asset name: ${row.name}`}
              canEdit
              autoFocus
              onCommit={(name) => name.trim() && name !== row.name && onChange({ name: name.trim() })}
              onDone={() => setRenaming(false)}
              testId="asset-name"
              className="min-w-0 flex-1 font-medium"
            />
          ) : (
            <button
              type="button"
              aria-expanded={open}
              title={canEdit ? "Click to open, double click to rename" : undefined}
              className="min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left text-[13px] font-medium hover:bg-accent"
              data-testid="asset-name"
            >
              <span className={cn(done && "text-muted-foreground line-through")}>{row.name}</span>
            </button>
          )}

          {/* The details, in passing, while the row is closed. */}
          {!open && !renaming && (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" data-testid="asset-summary">
              {fields.type && typeLabel && <LabelPill label={typeLabel} appearance="soft" size="sm" />}
              <span className="tabular">×{assetCount(shown)}</span>
              {fields.people && assignees.length > 0 && (
                <span className="flex -space-x-1">
                  {assignees.slice(0, 3).map((u) => (
                    <UserAvatar key={u.id} user={u} size="xs" tooltip={false} />
                  ))}
                </span>
              )}
              {fields.due && shown.dueDate && <span className={cn("tabular", overdue && "font-medium text-red-600 dark:text-red-400")}>{formatShortDate(shown.dueDate)}</span>}
            </span>
          )}
        </div>

        {canEdit && !renaming && (
          <>
            <button type="button" onClick={rename} aria-label={`Rename ${row.name}`} title="Rename" data-testid="asset-rename" className={rowActionClass}>
              <Pencil className="size-3.5" />
            </button>
            <button type="button" onClick={onDuplicate} aria-label={`Duplicate ${row.name}`} title="Duplicate" data-testid="asset-duplicate" className={rowActionClass}>
              <Copy className="size-3.5" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? `Close ${row.name}` : `Open ${row.name}`}
          data-testid="asset-toggle"
          className="shrink-0 rounded-md p-1 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
      </div>

      {/* ---- The row you edit: the fields in two columns, spec across the foot. */}
      {open && (
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 border-t border-border/60 px-2.5 pt-2.5 pb-2.5" data-testid="asset-details">
          {fields.type && (
            <Detail label="Type">
              <Popover>
                <PopoverTrigger asChild disabled={!canEdit}>
                  <button type="button" className={fieldClass} aria-label={`Asset type: ${draft.assetType ?? "not set"}`} data-testid="asset-type">
                    {typeLabel ? (
                      <LabelPill label={typeLabel} appearance="soft" size="sm" />
                    ) : (
                      <>
                        <Tag className="size-3 shrink-0 opacity-60" />
                        <span className="truncate text-muted-foreground/80">Not set</span>
                      </>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-60 p-2">
                  <p className="mb-1.5 label-quiet">Asset type</p>
                  <div className="flex flex-wrap gap-1">
                    {ASSET_TYPE_OPTIONS.map((option) => {
                      const active = draft.assetType?.toLowerCase() === option.name.toLowerCase();
                      return (
                        <button
                          key={option.name}
                          type="button"
                          onClick={() => edit({ assetType: active ? null : option.name })}
                          className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", colorClasses(option.color).soft, active && "ring-2 ring-ring")}
                          aria-pressed={active}
                          data-testid={`asset-type-option-${option.name}`}
                        >
                          {active && <Check className="size-3" />}
                          {option.name}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    defaultValue={draft.assetType && !ASSET_TYPE_OPTIONS.some((o) => o.name.toLowerCase() === draft.assetType!.toLowerCase()) ? draft.assetType : ""}
                    placeholder="Or type another and press Enter"
                    aria-label="Custom asset type"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        edit({ assetType: (e.target as HTMLInputElement).value.trim() || null });
                      }
                    }}
                    className="mt-2 h-7 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </PopoverContent>
              </Popover>
            </Detail>
          )}

          {/* Who is in charge. A row can take more than one person. */}
          {fields.people && (
            <Detail label="In charge">
              <Popover>
                <PopoverTrigger asChild disabled={!canEdit}>
                  <button
                    type="button"
                    className={fieldClass}
                    aria-label={`In charge: ${assignees.length > 0 ? assignees.map((u) => u.displayName).join(", ") : "nobody"}`}
                    data-testid="asset-assignee"
                  >
                    {assignees.length > 0 ? (
                      <span className="flex shrink-0 -space-x-1">
                        {assignees.slice(0, 3).map((u) => (
                          <UserAvatar key={u.id} user={u} size="xs" tooltip={false} />
                        ))}
                      </span>
                    ) : (
                      <UserRound className="size-3 shrink-0 opacity-60" />
                    )}
                    <span className={cn("truncate", assignees.length === 0 && "text-muted-foreground/80")}>{inCharge}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-0">
                  <PersonPicker users={users} value={draft.assigneeIds} onChange={(ids) => edit({ assigneeIds: ids })} />
                </PopoverContent>
              </Popover>
            </Detail>
          )}

          {/* Quantity: a stepper, because most edits are ±1 */}
          <Detail label="Quantity">
            <QuantityChip value={draft.quantity} canEdit={canEdit} onChange={(quantity) => edit({ quantity })} />
          </Detail>

          {fields.due && (
            <Detail label="Due">
              <Popover>
                <PopoverTrigger asChild disabled={!canEdit}>
                  <button
                    type="button"
                    className={cn(fieldClass, "tabular", overdue && "border-red-300 text-red-700 dark:border-red-500/50 dark:text-red-300")}
                    aria-label={`Due: ${draft.dueDate ? formatShortDate(draft.dueDate) : "not set"}`}
                    data-testid="asset-due"
                  >
                    {overdue ? <TriangleAlert className="size-3 shrink-0" /> : <CalendarDays className="size-3 shrink-0 opacity-60" />}
                    <span className={cn("truncate", !draft.dueDate && "text-muted-foreground/80")}>{draft.dueDate ? formatShortDate(draft.dueDate) : "Not set"}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <DatePicker value={draft.dueDate} onChange={(dueDate) => edit({ dueDate })} />
                </PopoverContent>
              </Popover>
            </Detail>
          )}

          <Detail label="Spec" className={cn("col-span-2", !canEdit && !draft.notes && "hidden")}>
            <TextField
              value={draft.notes ?? ""}
              placeholder={canEdit ? "Size, format, finish…" : ""}
              ariaLabel={`Notes: ${draft.notes ?? "none"}`}
              canEdit={canEdit}
              onCommit={(notes) => edit({ notes: notes.trim() || null })}
              testId="asset-notes"
              className="h-8 w-full min-w-0 rounded-lg border border-border/70 px-2 text-xs"
            />
          </Detail>

          {/* Throwing the row away sits apart from keeping the edits or putting them back. */}
          {canEdit && (
            <div className="col-span-2 flex items-center gap-1.5 pt-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${row.name}`}
                onClick={onRemove}
                className="mr-auto h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                data-testid="asset-remove"
              >
                <Trash2 className="size-3.5" /> Remove
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={discard} className="h-7 px-2.5 text-xs" data-testid="asset-discard">
                Discard
              </Button>
              {/* Never disabled: clicking it is what blurs the field being typed in,
                  and a disabled button would swallow that click along with the edit. */}
              <Button type="button" size="sm" onClick={save} className="h-7 px-3 text-xs" data-testid="asset-update">
                Update
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** One labelled field of the open row's form. */
function Detail({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <span className="label-quiet">{label}</span>
      {children}
    </div>
  );
}

/** A text field that saves on blur or Enter and gives up on Escape. */
function TextField({
  value,
  placeholder,
  ariaLabel,
  canEdit,
  onCommit,
  testId,
  className,
  autoFocus,
  onDone,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  canEdit: boolean;
  onCommit: (next: string) => void;
  testId: string;
  className?: string;
  /** Renaming: take the caret and select what is there, so typing replaces the name. */
  autoFocus?: boolean;
  /** Called once the field is finished with, committed or not. */
  onDone?: () => void;
}) {
  const [draft, setDraft] = React.useState(value);
  // A save elsewhere (another tab, a linked copy) replaces the draft; a draft in progress is otherwise kept.
  const [seen, setSeen] = React.useState(value);
  const input = React.useRef<HTMLInputElement>(null);
  // Escape blurs, and the blur must not save what Escape just threw away.
  const abandoned = React.useRef(false);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  React.useEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    input.current?.select();
  }, [autoFocus]);
  if (!canEdit) {
    return (
      <span className={cn("min-w-0 truncate text-[13px]", className)} data-testid={testId}>
        {value || <span className="text-muted-foreground/70">—</span>}
      </span>
    );
  }
  return (
    <input
      ref={input}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => {
        if (abandoned.current) {
          abandoned.current = false;
          setDraft(value);
        } else {
          onCommit(draft);
        }
        onDone?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          abandoned.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn("h-7 min-w-0 rounded-md bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground/60 hover:bg-accent focus:bg-background focus:ring-2 focus:ring-ring", className)}
    />
  );
}

/** "− 6 +": a stepper, since most edits are one either way; typing a number in the middle works too. */
function QuantityChip({ value, canEdit, onChange }: { value: number | null; canEdit: boolean; onChange: (next: number | null) => void }) {
  const [draft, setDraft] = React.useState(value === null ? "" : String(value));
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value === null ? "" : String(value));
  }
  const commit = () => {
    const text = draft.trim();
    if (text === "") return onChange(null);
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) return setDraft(value === null ? "" : String(value));
    onChange(Math.round(n));
  };
  const step = (delta: number) => onChange(Math.max(0, (value ?? 1) + delta));
  if (!canEdit) {
    return (
      <span className={cn(fieldClass, "tabular")} data-testid="asset-quantity-readonly">
        <Hash className="size-3 opacity-60" /> {value ?? 1}
      </span>
    );
  }
  return (
    <span className={cn(fieldClass, "justify-between gap-0 px-0.5 tabular")} data-testid="asset-quantity-chip">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="One fewer"
        className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
        data-testid="asset-quantity-minus"
      >
        <Minus className="size-3" />
      </button>
      <input
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`Quantity: ${value ?? "not set"}`}
        data-testid="asset-quantity"
        className="h-6 min-w-0 flex-1 bg-transparent text-center text-xs outline-none focus:rounded-md focus:bg-background focus:ring-2 focus:ring-ring"
      />
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="One more"
        className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
        data-testid="asset-quantity-plus"
      >
        <Plus className="size-3" />
      </button>
    </span>
  );
}
