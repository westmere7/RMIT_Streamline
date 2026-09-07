"use client";

import { CalendarDays, Check, Hash, Minus, Plus, Tag, TriangleAlert, UserRound, X } from "lucide-react";
import * as React from "react";
import { LabelPill } from "@/components/shared/label-pill";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { ColumnLabel, Item, ItemAsset, User } from "@/domain";
import { ASSET_TYPE_OPTIONS, countByType, recapAssets } from "@/domain";
import { DatePicker } from "@/features/boards/components/pickers/date-picker";
import { PersonPicker } from "@/features/boards/components/pickers/person-picker";
import { useAssetMutations, useItemAssets } from "@/features/items/asset-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { formatShortDate, isOverdue, todayISO } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

/** The chip for an asset type: the studio palette's colour when it is one of theirs, a stable colour otherwise. */
export function assetTypeLabel(type: string | null): ColumnLabel | null {
  if (!type) return null;
  const option = ASSET_TYPE_OPTIONS.find((o) => o.name.toLowerCase() === type.toLowerCase());
  return { id: type, name: option?.name ?? type, color: option?.color ?? tagColorFor(type) };
}

/**
 * The Assets tab: the task's deliverables, one compact card per line, with the
 * totals worked out as you type. The panel is narrow (520px, or a phone), so
 * each line stacks: the name on top, then a row of small chips — type, person
 * in charge, quantity, due date — that each open a picker, then the notes.
 * Everything here is what the "Assets recap" column condenses into one cell.
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

  const addLine = () => {
    const name = newName.trim();
    if (!name) return;
    mutations.add.mutate({ name, quantity: 1 });
    setNewName("");
  };

  if (assets.isLoading) {
    return (
      <div className="space-y-2 p-4" data-testid="assets-loading">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="assets-tab">
      {/* ---- Totals, live ---------------------------------------------------- */}
      <section aria-label="Asset totals" className="rounded-xl border border-border/70 bg-card p-3 shadow-xs" data-testid="assets-summary">
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Assets" value={recap.quantity} testId="assets-total" />
          <Stat label="Lines" value={recap.lines} testId="assets-lines" />
          <Stat label="Types" value={recap.types.length} testId="assets-types" />
          <Stat label="In charge" value={recap.assigneeIds.length} hint={recap.lines > 0 && recap.unassigned > 0 ? `${recap.unassigned} open` : undefined} testId="assets-people" />
        </div>
        {lines.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border/60 pt-2.5 text-xs text-muted-foreground" data-testid="assets-breakdown">
            {byType.map(({ type, quantity }) => (
              <span key={type ?? "none"} className="inline-flex items-center gap-1">
                <LabelPill label={assetTypeLabel(type)} appearance="soft" size="sm" emptyText="No type" />
                <span className="tabular">×{quantity}</span>
              </span>
            ))}
            {people.length > 0 && (
              <span className="flex -space-x-1.5" aria-label={`In charge: ${people.map((u) => u.displayName).join(", ")}`}>
                {people.slice(0, 6).map((u) => (
                  <UserAvatar key={u.id} user={u} size="xs" />
                ))}
              </span>
            )}
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
        )}
      </section>

      {/* ---- The lines -------------------------------------------------------- */}
      <section>
        <ul className="space-y-2" data-testid="asset-lines">
          {lines.map((line) => (
            <AssetCard key={line.id} line={line} canEdit={canEdit} users={ws.users} onChange={(patch) => mutations.update.mutate({ id: line.id, patch })} onRemove={() => mutations.remove.mutate(line.id)} />
          ))}
          {lines.length === 0 && (
            <li className="rounded-xl border border-dashed border-border/80 px-4 py-4 text-center text-[13px] text-muted-foreground" data-testid="assets-empty">
              {canEdit ? "No assets listed yet. Add a line below, then set its type, who is in charge, how many and when it is due." : "No assets listed."}
            </li>
          )}
        </ul>
        {canEdit && (
          <form
            className="mt-2 flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-1.5 shadow-xs focus-within:ring-2 focus-within:ring-ring"
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
      </section>
    </div>
  );
}

function Stat({ label, value, hint, testId }: { label: string; value: number; hint?: string; testId: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <p className="truncate text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-lg leading-tight font-semibold tabular">
        {value}
        {hint && <span className="ml-1 text-2xs font-normal text-muted-foreground">{hint}</span>}
      </p>
    </div>
  );
}

const chipClass = "inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border/70 bg-background px-2 text-xs hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent";

function AssetCard({ line, canEdit, users, onChange, onRemove }: { line: ItemAsset; canEdit: boolean; users: User[]; onChange: (patch: Partial<ItemAsset>) => void; onRemove: () => void }) {
  const assignee = line.assigneeId ? users.find((u) => u.id === line.assigneeId) ?? null : null;
  const overdue = isOverdue(line.dueDate);
  const typeLabel = assetTypeLabel(line.assetType);
  return (
    <li className="rounded-xl border border-border/70 bg-card px-3 py-2 shadow-xs" data-testid="asset-line" data-asset-name={line.name}>
      <div className="flex items-start gap-2">
        <TextField value={line.name} placeholder="Asset" ariaLabel={`Asset name: ${line.name}`} canEdit={canEdit} onCommit={(name) => name.trim() && name !== line.name && onChange({ name: name.trim() })} testId="asset-name" className="flex-1 font-medium" />
        {canEdit && (
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${line.name}`} onClick={onRemove} className="-mr-1 shrink-0 text-muted-foreground hover:text-destructive" data-testid="asset-remove">
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {/* Type */}
        <Popover>
          <PopoverTrigger asChild disabled={!canEdit}>
            <button type="button" className={cn(chipClass, typeLabel && "border-transparent", typeLabel && colorClasses(typeLabel.color).soft)} aria-label={`Asset type: ${line.assetType ?? "not set"}`} data-testid="asset-type">
              <Tag className="size-3 shrink-0 opacity-70" />
              <span className="truncate">{typeLabel?.name ?? "Type"}</span>
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

        {/* Person in charge */}
        <Popover>
          <PopoverTrigger asChild disabled={!canEdit}>
            <button type="button" className={chipClass} aria-label={`In charge: ${assignee?.displayName ?? "nobody"}`} data-testid="asset-assignee">
              {assignee ? <UserAvatar user={assignee} size="xs" tooltip={false} /> : <UserRound className="size-3 shrink-0 opacity-70" />}
              <span className="truncate">{assignee ? assignee.firstName : "In charge"}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <PersonPicker users={users} value={line.assigneeId ? [line.assigneeId] : []} allowMultiple={false} onChange={(ids) => onChange({ assigneeId: ids[0] ?? null })} />
          </PopoverContent>
        </Popover>

        {/* Quantity: a stepper, because most edits are ±1 */}
        <QuantityChip value={line.quantity} canEdit={canEdit} onChange={(quantity) => quantity !== line.quantity && onChange({ quantity })} />

        {/* Due */}
        <Popover>
          <PopoverTrigger asChild disabled={!canEdit}>
            <button type="button" className={cn(chipClass, "tabular", overdue && "border-red-300 text-red-700 dark:border-red-500/50 dark:text-red-300")} aria-label={`Due: ${line.dueDate ? formatShortDate(line.dueDate) : "not set"}`} data-testid="asset-due">
              {overdue ? <TriangleAlert className="size-3 shrink-0" /> : <CalendarDays className="size-3 shrink-0 opacity-70" />}
              <span>{line.dueDate ? formatShortDate(line.dueDate) : "Due"}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <DatePicker value={line.dueDate} onChange={(dueDate) => onChange({ dueDate })} />
          </PopoverContent>
        </Popover>
      </div>

      <TextField
        value={line.notes ?? ""}
        placeholder={canEdit ? "Spec, size, format…" : ""}
        ariaLabel={`Notes: ${line.notes ?? "none"}`}
        canEdit={canEdit}
        onCommit={(notes) => (notes.trim() || null) !== line.notes && onChange({ notes: notes.trim() || null })}
        testId="asset-notes"
        className={cn("mt-1 w-full text-xs text-muted-foreground focus:text-foreground", !canEdit && !line.notes && "hidden")}
      />
    </li>
  );
}

/** A text field that saves on blur or Enter and gives up on Escape. */
function TextField({ value, placeholder, ariaLabel, canEdit, onCommit, testId, className }: { value: string; placeholder: string; ariaLabel: string; canEdit: boolean; onCommit: (next: string) => void; testId: string; className?: string }) {
  const [draft, setDraft] = React.useState(value);
  // A save elsewhere (another tab, a linked copy) replaces the draft; a draft in progress is otherwise kept.
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  if (!canEdit) {
    return (
      <span className={cn("min-w-0 truncate text-[13px]", className)} data-testid={testId}>
        {value || <span className="text-muted-foreground/70">—</span>}
      </span>
    );
  }
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
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

/** "× 6" with − and + on either side; typing a number in the middle works too. */
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
      <span className={cn(chipClass, "tabular")} data-testid="asset-quantity-readonly">
        <Hash className="size-3 opacity-70" /> {value ?? 1}
      </span>
    );
  }
  return (
    <span className={cn(chipClass, "gap-0 px-0.5 tabular")} data-testid="asset-quantity-chip">
      <button type="button" onClick={() => step(-1)} aria-label="One fewer" className="flex size-6 items-center justify-center rounded-full hover:bg-black/[0.06] dark:hover:bg-white/[0.08]" data-testid="asset-quantity-minus">
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
        className="h-6 w-9 bg-transparent text-center text-xs outline-none focus:rounded-md focus:bg-background focus:ring-2 focus:ring-ring"
      />
      <button type="button" onClick={() => step(1)} aria-label="One more" className="flex size-6 items-center justify-center rounded-full hover:bg-black/[0.06] dark:hover:bg-white/[0.08]" data-testid="asset-quantity-plus">
        <Plus className="size-3" />
      </button>
    </span>
  );
}
