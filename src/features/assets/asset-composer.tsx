"use client";

import { CalendarDays, Check, ChevronRight, Copy, Eye, FileCheck2, Hash, Minus, MoreVertical, Pencil, Plus, Tag, Trash2, TriangleAlert, UserRound, X } from "lucide-react";
import * as React from "react";
import { type MenuAction, renderDropdown, useMenuFocusGuard } from "@/components/layout/row-menu";
import { LabelPill } from "@/components/shared/label-pill";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TagOption, User } from "@/domain";
import { ASSET_LINK_KINDS, ASSET_LINK_LABELS, ASSET_TYPE_OPTIONS, assetCount, type AssetLinkKind } from "@/domain";
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
  /** Something to look at while it is being made. */
  previewUrl: string | null;
  /** The signed-off final artwork. */
  artworkUrl: string | null;
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
  assetTypes = ASSET_TYPE_OPTIONS,
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
  /** The workspace's asset types (Settings → Lists). Needed only when `fields.type` is on. */
  assetTypes?: readonly TagOption[];
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
          <Button type="button" onClick={add} size="sm" className="h-7 shrink-0" disabled={disabled || !newName.trim()} data-testid="asset-add-submit">
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
            assetTypes={assetTypes}
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
  previewUrl: string | null;
  artworkUrl: string | null;
}

function draftOf(row: AssetComposerRow): AssetDraft {
  return { assetType: row.assetType, assigneeIds: row.assigneeIds, quantity: row.quantity, dueDate: row.dueDate, notes: row.notes, previewUrl: row.previewUrl, artworkUrl: row.artworkUrl };
}

/** Only what the draft actually changed, so Update writes nothing it does not have to. */
function draftPatch(row: AssetComposerRow, draft: AssetDraft): AssetComposerPatch {
  const patch: AssetComposerPatch = {};
  if (draft.assetType !== row.assetType) patch.assetType = draft.assetType;
  if (draft.quantity !== row.quantity) patch.quantity = draft.quantity;
  if (draft.dueDate !== row.dueDate) patch.dueDate = draft.dueDate;
  if (draft.notes !== row.notes) patch.notes = draft.notes;
  if (draft.previewUrl !== row.previewUrl) patch.previewUrl = draft.previewUrl;
  if (draft.artworkUrl !== row.artworkUrl) patch.artworkUrl = draft.artworkUrl;
  if (draft.assigneeIds.length !== row.assigneeIds.length || draft.assigneeIds.some((id, i) => id !== row.assigneeIds[i])) patch.assigneeIds = draft.assigneeIds;
  return patch;
}

/** The quiet icon buttons at the end of a closed row. Always there: a control that only appears under a pointer is a control no finger ever finds. */
const rowActionClass = "shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground";

/** Splits what the row says — who it is on, when it is due — from the links and the menu it carries. */
const rowDividerClass = "h-4 w-px shrink-0 bg-border/70";

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
  assetTypes,
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
  assetTypes: readonly TagOption[];
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
  const typeLabel = assetTypeLabel(shown.assetType, assetTypes);
  const count = assetCount(shown);
  const inCharge = assignees.length === 0 ? "Not set" : assignees.length === 1 ? assignees[0]!.firstName : `${assignees.length} people`;
  // What the closed row shows on its right: who it is on, when it is due, and
  // the links it holds. Each is asked for on its own, because the divider
  // between them only earns its pixel when there is something either side.
  const showPeople = fields.people && assignees.length > 0;
  const showDue = fields.due && !!shown.dueDate;
  const showLinks = !open;
  const [renaming, setRenaming] = React.useState(false);
  // Rename opens a field, so it waits for the menu to finish closing rather than
  // mounting inside a focus trap on its way out.
  const menuFocus = useMenuFocusGuard();
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

  // Everything that changes the row rather than says something about it. Off the
  // line, where it is not competing with the type or the date, but always one
  // tap away rather than one hover.
  const menuActions: MenuAction[] = [
    { type: "item", label: "Rename", icon: <Pencil />, onSelect: () => menuFocus.run(() => setRenaming(true)), testId: "asset-rename" },
    { type: "item", label: "Duplicate", icon: <Copy />, onSelect: onDuplicate, testId: "asset-duplicate" },
    { type: "separator" },
    { type: "item", label: "Remove", icon: <Trash2 />, destructive: true, onSelect: onRemove, testId: "asset-menu-remove" },
  ];

  return (
    <li
      className={cn(
        // A thicker left edge carries the row's standing — done, late, or
        // neither — so the shape of a long list reads down the margin before
        // anyone reads a date.
        "rounded-xl border border-l-2 border-border/70 bg-card shadow-xs transition-colors",
        !open && "hover:bg-accent/40",
        open && "border-border ring-1 ring-border/60",
        done && "border-l-emerald-500/60 bg-card/60",
        overdue && "border-l-red-500/60",
      )}
      data-testid="asset-line"
      data-asset-name={row.name}
      data-asset-done={done ? "true" : "false"}
    >
      {/* ---- The row you read ---------------------------------------------- */}
      <div className="flex items-center gap-2 px-2.5 py-2">
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

        <span className="min-w-5 shrink-0 rounded bg-muted/60 px-1 py-px text-center text-2xs font-medium tabular text-muted-foreground/70" aria-hidden data-testid="asset-number">
          {number}
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
              className="min-w-[3.5rem] flex-1 truncate rounded-md py-1 text-left text-[13px] font-medium"
              data-testid="asset-name"
            >
              <span className={cn(done && "text-muted-foreground line-through")}>{row.name}</span>
            </button>
          )}

          {/* What the deliverable is, against its name: how many, and of what. */}
          {!open && !renaming && (
            <span className="flex min-w-0 shrink items-center gap-1.5 text-xs text-muted-foreground" data-testid="asset-summary">
              {/* A count only when there is more than one: "×1" down every row
                  of the list is a column of noise. */}
              {count > 1 && <span className="rounded bg-muted/70 px-1.5 py-px text-2xs font-medium tabular text-muted-foreground">×{count}</span>}
              {fields.type && typeLabel && <LabelPill label={typeLabel} appearance="soft" size="sm" className="max-w-28" />}
            </span>
          )}
        </div>

        {/* Who it is on and when it is due: the two things worth knowing about
            a deliverable nobody has opened. No calendar icon against the date —
            a date already looks like one — and a warning only once it has gone
            by. */}
        {!open && !renaming && (showPeople || showDue) && (
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground" data-testid="asset-meta">
            {showPeople && (
              <span className="flex -space-x-1">
                {assignees.slice(0, 3).map((u) => (
                  <UserAvatar key={u.id} user={u} size="xs" tooltip={false} />
                ))}
              </span>
            )}
            {showDue && (
              <span className={cn("flex items-center gap-1 tabular", overdue && "font-medium text-red-600 dark:text-red-400")}>
                {overdue && <TriangleAlert className="size-3 shrink-0" />}
                {formatShortDate(shown.dueDate)}
              </span>
            )}
          </div>
        )}

        {/* The links this deliverable holds, then everything else behind a "…".
            All of it sits on the row at rest: a control that only exists under a
            pointer is a control a touchscreen never offers, and a rail that
            opens on hover shifts the row out from under the finger aiming at
            it. */}
        <div className="flex shrink-0 items-center gap-0.5">
          {(showPeople || showDue) && showLinks && !renaming && <span className={cn(rowDividerClass, "mr-1 ml-0.5")} aria-hidden />}
          {showLinks && !renaming && <LinkChips preview={shown.previewUrl} artwork={shown.artworkUrl} name={row.name} />}

          {canEdit && !renaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Options for ${row.name}`} title="More" data-testid="asset-menu" className={rowActionClass}>
                  <MoreVertical className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44" onCloseAutoFocus={menuFocus.onCloseAutoFocus}>
                {renderDropdown(menuActions)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* The chevron stays out of the menu: it is not an action but the
              row's state, and it has to be readable without opening anything. */}
          <button type="button" onClick={onToggle} aria-expanded={open} aria-label={open ? `Close ${row.name}` : `Open ${row.name}`} data-testid="asset-toggle" className={rowActionClass}>
            <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
          </button>
        </div>
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
                    {assetTypes.map((option) => {
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
                    defaultValue={draft.assetType && !assetTypes.some((o) => o.name.toLowerCase() === draft.assetType!.toLowerCase()) ? draft.assetType : ""}
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

          <Detail label="Specs / notes" className={cn("col-span-2", !canEdit && !draft.notes && "hidden")}>
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

          {/* One line for two links, because a deliverable acquires them in
              order: something to review, then the artwork that was signed off.
              The switch says which one the box is holding, and each side shows
              a tick once it has a link, so both are visible without toggling. */}
          <Detail label="Link" className={cn("col-span-2", !canEdit && !draft.previewUrl && !draft.artworkUrl && "hidden")}>
            <LinkField draft={draft} saved={row} canEdit={canEdit} onChange={edit} />
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

const LINK_ICON: Record<AssetLinkKind, typeof Eye> = { preview: Eye, artwork: FileCheck2 };

/**
 * The two links a deliverable can carry, as a fixed pair of icons on the closed
 * row: something to review while it is being made, and the artwork that was
 * signed off.
 *
 * Both slots are always there. An icon that turns up only once the link does
 * moves everything beside it and leaves nowhere to look for what is still owed;
 * a faint mark says the same thing without shifting the row. The one that exists
 * is green and is an anchor rather than a button, so a click opens the
 * thing itself — and is stopped from reaching the row, which would open the
 * editor.
 */
function LinkChips({ preview, artwork, name }: { preview: string | null; artwork: string | null; name: string }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" data-testid="asset-link-chips">
      {ASSET_LINK_KINDS.map((kind) => {
        const Icon = LINK_ICON[kind];
        const href = kind === "preview" ? preview : artwork;
        const label = ASSET_LINK_LABELS[kind].long;
        return href ? (
          <a
            key={kind}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
            title={`${label} for ${name}`}
            aria-label={`${label} for ${name}`}
            className={cn(rowActionClass, "text-emerald-600 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400")}
            data-testid={`asset-link-chip-${kind}`}
            data-filled="true"
          >
            <Icon className="size-3.5" />
          </a>
        ) : (
          <span key={kind} aria-hidden title={`No ${label.toLowerCase()} for ${name} yet`} className="shrink-0 rounded-md p-1 text-muted-foreground/30" data-testid={`asset-link-chip-${kind}`} data-filled="false">
            <Icon className="size-3.5" />
          </span>
        );
      })}
    </span>
  );
}

/**
 * The two links, a line each: something to review while the deliverable is being
 * made, and the artwork that was signed off. Two lines rather than one box with a
 * switch, because the pair is the point — what a deliverable is missing should be
 * readable without toggling anything.
 */
function LinkField({
  draft,
  saved,
  canEdit,
  onChange,
}: {
  draft: Pick<AssetComposerRow, "previewUrl" | "artworkUrl">;
  /** What is stored, which is where the cross puts the line back to. */
  saved: Pick<AssetComposerRow, "previewUrl" | "artworkUrl">;
  canEdit: boolean;
  onChange: (patch: AssetComposerPatch) => void;
}) {
  return (
    <div className="grid gap-1.5" data-testid="asset-link-rows">
      {ASSET_LINK_KINDS.map((kind) => {
        const key = kind === "preview" ? "previewUrl" : "artworkUrl";
        return <LinkRow key={kind} kind={kind} value={draft[key]} saved={saved[key]} canEdit={canEdit} onChange={(next) => onChange({ [key]: next })} />;
      })}
    </div>
  );
}

/**
 * One link. The label is the link itself once there is one — in green,
 * opening in its own tab — and the box beside it is committed with the tick (or
 * Enter, or by leaving it) and put back to what is stored with the cross.
 *
 * Both buttons hold the focus where it is on the way down, so the blur they would
 * otherwise cause does not commit the very edit the cross is there to undo.
 */
function LinkRow({
  kind,
  value,
  saved,
  canEdit,
  onChange,
}: {
  kind: AssetLinkKind;
  value: string | null;
  saved: string | null;
  canEdit: boolean;
  onChange: (next: string | null) => void;
}) {
  const [text, setText] = React.useState(value ?? "");
  // A change from outside — Discard, or a save elsewhere — replaces what is typed.
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value ?? "");
  }
  const Icon = LINK_ICON[kind];
  const label = ASSET_LINK_LABELS[kind].long;
  const commit = () => onChange(text.trim() || null);
  const revert = () => {
    setText(saved ?? "");
    onChange(saved);
  };
  const uncommitted = text.trim() !== (value ?? "");
  const changed = text.trim() !== (saved ?? "") || value !== saved;

  return (
    <div className="flex min-w-0 items-center gap-1.5" data-testid={`asset-link-row-${kind}`}>
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer noopener"
          title={`Open the ${label.toLowerCase()}`}
          className="flex w-[4.5rem] shrink-0 items-center gap-1 rounded-md px-1 py-1 text-2xs font-medium text-emerald-600 hover:bg-accent dark:text-emerald-400"
          data-testid={`asset-link-open-${kind}`}
        >
          <Icon className="size-3.5 shrink-0" />
          {ASSET_LINK_LABELS[kind].short}
        </a>
      ) : (
        <span className="flex w-[4.5rem] shrink-0 items-center gap-1 px-1 py-1 text-2xs font-medium text-muted-foreground/60">
          <Icon className="size-3.5 shrink-0" />
          {ASSET_LINK_LABELS[kind].short}
        </span>
      )}

      {canEdit ? (
        <>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                revert();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder={`Paste the ${label.toLowerCase()} link…`}
            aria-label={`${label} link: ${value ?? "none"}`}
            data-testid={`asset-link-${kind}`}
            className="h-8 w-full min-w-0 rounded-lg border border-border/70 bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            disabled={!uncommitted}
            aria-label={`Set the ${label.toLowerCase()} link`}
            title="Set"
            data-testid={`asset-link-commit-${kind}`}
            className={cn(rowActionClass, "disabled:pointer-events-none disabled:opacity-30", uncommitted && "text-emerald-600 dark:text-emerald-400")}
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={revert}
            disabled={!changed}
            aria-label={`Put the ${label.toLowerCase()} link back`}
            title="Cancel"
            data-testid={`asset-link-cancel-${kind}`}
            className={cn(rowActionClass, "disabled:pointer-events-none disabled:opacity-30")}
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : (
        <span className="min-w-0 truncate text-xs text-muted-foreground" data-testid={`asset-link-${kind}`}>
          {value || <span className="text-muted-foreground/70">—</span>}
        </span>
      )}
    </div>
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
