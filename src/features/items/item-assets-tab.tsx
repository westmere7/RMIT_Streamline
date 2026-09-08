"use client";

import { CalendarDays, Check, ChevronRight, Hash, Minus, Pencil, Plus, Tag, TriangleAlert, UserRound, X } from "lucide-react";
import * as React from "react";
import { LabelPill } from "@/components/shared/label-pill";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { ColumnLabel, Item, ItemAsset, User } from "@/domain";
import { ASSET_TYPE_OPTIONS, assetCount, countByType, recapAssets } from "@/domain";
import { DatePicker } from "@/features/boards/components/pickers/date-picker";
import { PersonPicker } from "@/features/boards/components/pickers/person-picker";
import { useAssetMutations, useItemAssets } from "@/features/items/asset-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { formatShortDate, isOverdue, todayISO } from "@/lib/dates/dates";
import { nowIso } from "@/lib/ids";
import { cn } from "@/lib/utils";

/** The chip for an asset type: the shared palette's colour when it is one of theirs, a stable colour otherwise. */
export function assetTypeLabel(type: string | null): ColumnLabel | null {
  if (!type) return null;
  const option = ASSET_TYPE_OPTIONS.find((o) => o.name.toLowerCase() === type.toLowerCase());
  return { id: type, name: option?.name ?? type, color: option?.color ?? tagColorFor(type) };
}

/**
 * The Assets tab: the task's deliverables, one line each, with how much of it is
 * finished across the top.
 *
 * A line is a single row until you open it — a tick, its number, its name and
 * the short version of its details — because reading the list is the common act
 * and editing one line is the rare one. Opening a line turns those details into
 * the pickers that set them. The box for a new line sits above the list, so it
 * does not walk down the page as the list grows.
 *
 * The panel is narrow (520px, or a phone), so nothing here relies on width:
 * every row truncates and the chips wrap. This is what the "Assets recap"
 * column condenses into one cell.
 */
export function ItemAssetsTab({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const assets = useItemAssets(item.id);
  const mutations = useAssetMutations(item);
  const ws = useWorkspace();
  const lines = React.useMemo(() => (assets.data ?? []).slice().sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)), [assets.data]);
  const today = todayISO();
  const recap = React.useMemo(() => recapAssets(lines, today), [lines, today]);
  const byType = React.useMemo(() => countByType(lines), [lines]);
  const people = recap.assigneeIds.map((id) => ws.userById(id)).filter((u): u is User => !!u);
  const [newName, setNewName] = React.useState("");
  // Which lines are open. A line added just now opens itself, since the next
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

  const addLine = () => {
    const name = newName.trim();
    if (!name) return;
    mutations.add.mutate({ name, quantity: 1 });
    setJustAdded(name);
    setNewName("");
  };

  if (assets.isLoading) {
    return (
      <div className="space-y-2 p-4" data-testid="assets-loading">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
      </div>
    );
  }

  // Lines, not units: ticking three of four deliverables should look like three
  // of four, whatever the print run on the fourth.
  const percent = recap.lines > 0 ? Math.round((recap.done / recap.lines) * 100) : 0;

  return (
    <div className="p-4" data-testid="assets-tab">
      {/* ---- How much of it is done, and what it is made of --------------------- */}
      {lines.length > 0 && (
        <section aria-label="Asset progress" className="space-y-2 border-b border-border/70 pb-3" data-testid="assets-summary">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-strong"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${recap.done} of ${recap.lines} asset lines done`}
            data-testid="assets-progress-bar"
          >
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="text-[13px] font-medium text-foreground tabular" data-testid="assets-progress">
              {recap.done} of {recap.lines} {recap.lines === 1 ? "line" : "lines"} done
            </span>
            <span className="tabular" data-testid="assets-quantity">
              {recap.quantity} {recap.quantity === 1 ? "asset" : "assets"}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 tabular" data-testid="assets-due">
              <CalendarDays className="size-3" />
              {recap.nextDue ? `Next due ${formatShortDate(recap.nextDue)}` : "No due dates"}
              {recap.overdue > 0 && (
                <span className="inline-flex items-center gap-0.5 font-medium text-red-600 dark:text-red-400">
                  <TriangleAlert className="size-3" /> {recap.overdue} overdue
                </span>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground" data-testid="assets-breakdown">
            {byType.map(({ type, quantity }) => (
              <span key={type ?? "none"} className="inline-flex items-center gap-1">
                <LabelPill label={assetTypeLabel(type)} appearance="soft" size="sm" emptyText="No type" />
                <span className="tabular">×{quantity}</span>
              </span>
            ))}
            {people.length > 0 && (
              <span className="ml-auto flex -space-x-1.5" aria-label={`In charge: ${people.map((u) => u.displayName).join(", ")}`} data-testid="assets-people">
                {people.slice(0, 6).map((u) => (
                  <UserAvatar key={u.id} user={u} size="xs" />
                ))}
              </span>
            )}
          </div>
        </section>
      )}

      {/* ---- Add a line. Above the list: it stays put however long the list gets. */}
      <section className={cn(lines.length > 0 && "pt-3")}>
        {canEdit && (
          <form
            className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-1.5 shadow-xs focus-within:ring-2 focus-within:ring-ring"
            onSubmit={(e) => {
              e.preventDefault();
              addLine();
            }}
          >
            <Plus className="size-3.5 shrink-0 text-muted-foreground/60" />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Add an asset, e.g. A1 poster"
              aria-label="Add an asset line"
              data-testid="asset-add-input"
              className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
            />
            <Button type="submit" size="sm" variant="secondary" className="h-7 shrink-0" disabled={!newName.trim()} data-testid="asset-add-submit">
              Add
            </Button>
          </form>
        )}

        {/* ---- The lines ------------------------------------------------------ */}
        <ul className={cn("space-y-1.5", canEdit && "mt-2")} data-testid="asset-lines">
          {lines.map((line, index) => (
            <AssetLine
              key={line.id}
              line={line}
              number={index + 1}
              canEdit={canEdit}
              users={ws.users}
              open={open.has(line.id) || line.name === justAdded}
              onToggle={() => {
                if (line.name === justAdded) setJustAdded(null);
                else toggle(line.id);
              }}
              onChange={(patch) => mutations.update.mutate({ id: line.id, patch })}
              onRemove={() => mutations.remove.mutate(line.id)}
            />
          ))}
          {lines.length === 0 && (
            <li className="rounded-xl border border-dashed border-border/80 px-4 py-4 text-center text-[13px] text-muted-foreground" data-testid="assets-empty">
              {canEdit ? "No assets listed yet. Add one above, then open it to set its type, who is in charge, how many and when it is due." : "No assets listed."}
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

/** A control in an open line's little form. Full width, so the fields line up in columns. */
const fieldClass =
  "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 text-xs transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent";

/** Long enough to tell a double click from two single ones, short enough that opening a line still feels immediate. */
const DOUBLE_CLICK_MS = 220;

/**
 * One deliverable. Closed, it is a single row: done, number, name, and the same
 * details as a quiet summary. Open, those details become a small form — four
 * labelled fields in two columns with the spec across the foot — so the controls
 * line up with each other and down the list.
 *
 * Clicking the line opens and closes it, whether it is open or not; renaming is
 * a double click (or the pencil, which is also where the keyboard finds it), so
 * reading a line and editing its name never fight over the same click.
 */
function AssetLine({
  line,
  number,
  canEdit,
  users,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  line: ItemAsset;
  number: number;
  canEdit: boolean;
  users: User[];
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<ItemAsset>) => void;
  onRemove: () => void;
}) {
  const assignees = line.assigneeIds.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const done = line.completedAt !== null;
  const overdue = !done && isOverdue(line.dueDate);
  const typeLabel = assetTypeLabel(line.assetType);
  const inCharge = assignees.length === 0 ? "Not set" : assignees.length === 1 ? assignees[0]!.firstName : `${assignees.length} people`;
  const [renaming, setRenaming] = React.useState(false);
  // The first click of a double click has to be held back, or a rename would
  // open (or close) the line on its way through.
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
      data-asset-name={line.name}
      data-asset-done={done ? "true" : "false"}
    >
      {/* ---- The row you read ---------------------------------------------- */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark ${line.name} as not done` : `Mark ${line.name} as done`}
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

        <span className="w-5 shrink-0 text-xs tabular text-muted-foreground/60" aria-hidden data-testid="asset-number">
          #{number}
        </span>

        {/* Name and summary together: one target, so a click anywhere along the line opens it. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 select-none" onClick={click} onDoubleClick={rename}>
          {renaming && canEdit ? (
            <TextField
              value={line.name}
              placeholder="Asset"
              ariaLabel={`Asset name: ${line.name}`}
              canEdit
              autoFocus
              onCommit={(name) => name.trim() && name !== line.name && onChange({ name: name.trim() })}
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
              <span className={cn(done && "text-muted-foreground line-through")}>{line.name}</span>
            </button>
          )}

          {/* The details, in passing, while the line is closed. */}
          {!open && !renaming && (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" data-testid="asset-summary">
              {typeLabel && <LabelPill label={typeLabel} appearance="soft" size="sm" />}
              <span className="tabular">×{assetCount(line)}</span>
              {assignees.length > 0 && (
                <span className="flex -space-x-1">
                  {assignees.slice(0, 3).map((u) => (
                    <UserAvatar key={u.id} user={u} size="xs" tooltip={false} />
                  ))}
                </span>
              )}
              {line.dueDate && <span className={cn("tabular", overdue && "font-medium text-red-600 dark:text-red-400")}>{formatShortDate(line.dueDate)}</span>}
            </span>
          )}
        </div>

        {canEdit && !renaming && (
          <button
            type="button"
            onClick={rename}
            aria-label={`Rename ${line.name}`}
            data-testid="asset-rename"
            className="shrink-0 rounded-md p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/line:opacity-100"
          >
            <Pencil className="size-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? `Close ${line.name}` : `Open ${line.name}`}
          data-testid="asset-toggle"
          className="shrink-0 rounded-md p-1 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
      </div>

      {/* ---- The row you edit: four fields in two columns, spec across the foot. */}
      {open && (
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 border-t border-border/60 px-2.5 pt-2 pb-2.5 pl-[46px]" data-testid="asset-details">
          <Detail label="Type">
            <Popover>
              <PopoverTrigger asChild disabled={!canEdit}>
                <button type="button" className={fieldClass} aria-label={`Asset type: ${line.assetType ?? "not set"}`} data-testid="asset-type">
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
                    const active = line.assetType?.toLowerCase() === option.name.toLowerCase();
                    return (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => onChange({ assetType: active ? null : option.name })}
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
                  defaultValue={line.assetType && !ASSET_TYPE_OPTIONS.some((o) => o.name.toLowerCase() === line.assetType!.toLowerCase()) ? line.assetType : ""}
                  placeholder="Or type another and press Enter"
                  aria-label="Custom asset type"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onChange({ assetType: (e.target as HTMLInputElement).value.trim() || null });
                    }
                  }}
                  className="mt-2 h-7 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </PopoverContent>
            </Popover>
          </Detail>

          {/* Who is in charge. A line can take more than one person. */}
          <Detail label="In charge">
            <Popover>
              <PopoverTrigger asChild disabled={!canEdit}>
                <button type="button" className={fieldClass} aria-label={`In charge: ${assignees.length > 0 ? assignees.map((u) => u.displayName).join(", ") : "nobody"}`} data-testid="asset-assignee">
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
                <PersonPicker users={users} value={line.assigneeIds} onChange={(ids) => onChange({ assigneeIds: ids })} />
              </PopoverContent>
            </Popover>
          </Detail>

          {/* Quantity: a stepper, because most edits are ±1 */}
          <Detail label="Quantity">
            <QuantityChip value={line.quantity} canEdit={canEdit} onChange={(quantity) => quantity !== line.quantity && onChange({ quantity })} />
          </Detail>

          <Detail label="Due">
            <Popover>
              <PopoverTrigger asChild disabled={!canEdit}>
                <button
                  type="button"
                  className={cn(fieldClass, "tabular", overdue && "border-red-300 text-red-700 dark:border-red-500/50 dark:text-red-300")}
                  aria-label={`Due: ${line.dueDate ? formatShortDate(line.dueDate) : "not set"}`}
                  data-testid="asset-due"
                >
                  {overdue ? <TriangleAlert className="size-3 shrink-0" /> : <CalendarDays className="size-3 shrink-0 opacity-60" />}
                  <span className={cn("truncate", !line.dueDate && "text-muted-foreground/80")}>{line.dueDate ? formatShortDate(line.dueDate) : "Not set"}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <DatePicker value={line.dueDate} onChange={(dueDate) => onChange({ dueDate })} />
              </PopoverContent>
            </Popover>
          </Detail>

          <Detail label="Spec" className={cn("col-span-2", !canEdit && !line.notes && "hidden")}>
            <div className="flex items-center gap-1">
              <TextField
                value={line.notes ?? ""}
                placeholder={canEdit ? "Size, format, finish…" : ""}
                ariaLabel={`Notes: ${line.notes ?? "none"}`}
                canEdit={canEdit}
                onCommit={(notes) => (notes.trim() || null) !== line.notes && onChange({ notes: notes.trim() || null })}
                testId="asset-notes"
                className="h-8 min-w-0 flex-1 rounded-lg border border-border/70 px-2 text-xs"
              />
              {canEdit && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${line.name}`} onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-destructive" data-testid="asset-remove">
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          </Detail>
        </div>
      )}
    </li>
  );
}

/** One labelled field of the open line's form. */
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
      <button type="button" onClick={() => step(-1)} aria-label="One fewer" className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.06] dark:hover:bg-white/[0.08]" data-testid="asset-quantity-minus">
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
      <button type="button" onClick={() => step(1)} aria-label="One more" className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.06] dark:hover:bg-white/[0.08]" data-testid="asset-quantity-plus">
        <Plus className="size-3" />
      </button>
    </span>
  );
}
