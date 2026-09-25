"use client";

import { Check, ChevronDown, CornerDownRight, Link2, MoreHorizontal } from "lucide-react";
import * as React from "react";
import { MenuSheet } from "@/components/layout/menu-sheet";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { MenuAction } from "@/components/layout/row-menu";
import { LabelPill } from "@/components/shared/label-pill";
import { PrioritySignal } from "@/components/shared/priority-signal";
import { AvatarStack } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetItem } from "@/components/ui/sheet";
import type { BoardColumn, BoardGroup, ColumnLabel, Item } from "@/domain";
import { columnLabels, isStuckLabel, priorityStrength } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { UpdatesBadge } from "@/features/items/updates-badge";
import { copyToClipboard } from "@/features/members/hooks";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";
import { EMPTY_BOARD_UI, useBoardUiStore } from "@/stores/board-ui-store";

/** Which of the card's chips is being changed, if any. */
type Editing = "status" | "priority" | "date" | null;

/**
 * One board item as a phone shows it.
 *
 * A table row asks the eye to travel sideways across columns; a card stacks the
 * same facts. What a decision needs — the name, how it stands, how urgent, who
 * has it, when it is due — is on the card, and every other field is one tap away
 * on the item's own screen. It reads the board model the table reads, so a
 * filter or a sort applies to both with no second code path.
 *
 * The three things people change most — status, priority, the date — change
 * from the card. Each chip is its own button opening a sheet, so nobody has to
 * open the item, find the field and open its picker to move a task on. The
 * name is the button that opens the item; the chips sit beside it rather than
 * inside it, because a button inside a button is not a thing.
 */
export function MobileItemCard({ item, group, selectMode, indent = false }: { item: Item; group: BoardGroup; selectMode: boolean; indent?: boolean }) {
  const { board, model, mutations, canEdit, openItem, openItemUpdates, updates } = useBoardContext();
  const selected = useBoardUiStore((s) => (s.boards[board.id]?.selectedItemIds ?? EMPTY_BOARD_UI.selectedItemIds).includes(item.id));
  const expanded = useBoardUiStore((s) => (s.boards[board.id]?.expandedItemIds ?? EMPTY_BOARD_UI.expandedItemIds).includes(item.id));
  const toggleSelected = useBoardUiStore((s) => s.toggleSelected);
  const toggleExpanded = useBoardUiStore((s) => s.toggleExpanded);
  const [editing, setEditing] = React.useState<Editing>(null);

  const done = model.isDone(item.id);
  const blocked = model.isBlocked(item.id);
  const subitems = model.subitemsByParent.get(item.id) ?? [];
  const linkCount = model.linksByItem.get(item.id)?.length ?? 0;
  const due = model.dueDateOf(item.id);
  const late = !done && isOverdue(due);

  const statusColumn = model.statusColumn;
  const statusValue = statusColumn ? model.getValue(item.id, statusColumn.id) : undefined;
  const status = statusColumn && statusValue?.type === "STATUS" ? columnLabels(statusColumn).find((l) => l.id === statusValue.labelId) : undefined;
  const priorityColumn = model.priorityColumn;
  const priorityValue = priorityColumn ? model.getValue(item.id, priorityColumn.id) : undefined;
  const priority = priorityColumn && priorityValue?.type === "PRIORITY" ? columnLabels(priorityColumn).find((l) => l.id === priorityValue.labelId) : undefined;
  // The date the card shows is the date the chip changes: the board's date
  // column when it has one, the end of its timeline otherwise.
  const dueColumn = model.dateColumn ?? model.timelineColumn;
  const owners = [
    ...new Set(
      model.personColumns.flatMap((c) => {
        const v = model.getValue(item.id, c.id);
        return v?.type === "PERSON" ? v.userIds : [];
      }),
    ),
  ];

  // A chip is a button only when there is something to change and somebody
  // allowed to change it; otherwise it is the same chip, just still.
  const editable = canEdit && !selectMode;
  const open = () => (selectMode ? toggleSelected(board.id, item.id) : openItem(item.id));
  // A chip's tap is the chip's: it must not also open the item underneath.
  const chip = (kind: Exclude<Editing, null>, label: string, children: React.ReactNode, testId: string) =>
    editable ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(kind);
        }}
        aria-label={label}
        className="rounded-md active:opacity-70"
        data-testid={testId}
      >
        {children}
      </button>
    ) : (
      <span data-testid={testId}>{children}</span>
    );

  return (
    <li className={cn(indent && "pl-5")}>
      {/* The whole card is the target, whitespace included, so a thumb does not
          have to land on the name. The name is also a real button, for keyboards;
          the div is the forgiving surface round it. */}
      { }
      <div className="flex items-stretch gap-2 px-3 py-2.5 active:bg-accent/40" onClick={open} data-testid="mobile-item-card">
        {selectMode && (
           
          <span className="flex w-9 shrink-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selected} onCheckedChange={(checked) => toggleSelected(board.id, item.id, checked === true)} aria-label={`Select ${item.name}`} className="size-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
            className="-mx-1 -my-0.5 flex w-[calc(100%+0.5rem)] items-start gap-1.5 rounded-lg px-1 py-0.5 text-left focus-visible:outline-2 focus-visible:outline-ring"
            data-testid="mobile-item-open"
          >
            {indent && <CornerDownRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground/60" />}
            {/* Done is said by the chip; striking the name through as well made
                a finished task the hardest one on the list to read. */}
            <span className={cn("min-w-0 flex-1 text-[16px] leading-snug font-medium", done && "text-muted-foreground")}>{item.name}</span>
          </button>

          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {statusColumn &&
              chip(
                "status",
                `Change status of ${item.name}`,
                status ? (
                  <LabelPill label={status} size="lg" striped={isStuckLabel(statusColumn, status.id)} />
                ) : (
                  <span className="inline-flex h-7 items-center rounded-md border border-dashed border-border px-3 text-[13px] text-muted-foreground">Set status</span>
                ),
                "mobile-card-status",
              )}
            {priorityColumn &&
              priority &&
              chip(
                "priority",
                `Change priority of ${item.name}`,
                <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-surface-strong/70 px-2.5 text-[13px] font-medium text-foreground/80">
                  <PrioritySignal level={priorityStrength(priority.id)} className={colorClasses(priority.color).text} />
                  {priority.name}
                </span>,
                "mobile-card-priority",
              )}
            {dueColumn &&
              chip(
                "date",
                `Change due date of ${item.name}`,
                <span
                  className={cn(
                    "inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-medium tabular",
                    late ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : due ? "bg-surface-strong/70 text-foreground/80" : "border border-dashed border-border text-muted-foreground",
                  )}
                >
                  {due ? `${late ? "Overdue · " : ""}${formatShortDate(due)}` : "No date"}
                </span>,
                "mobile-card-date",
              )}
            {blocked && (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-amber-50 px-2.5 text-[13px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                <span aria-hidden className="size-1.5 rounded-full bg-current" /> Blocked
              </span>
            )}
          </div>

          {(item.ticket || owners.length > 0 || linkCount > 0) && (
            <div className="mt-2 flex items-center gap-3 text-[13px] text-muted-foreground">
              {item.ticket && <span className="font-mono tracking-tight tabular">{item.ticket}</span>}
              <Owners userIds={owners} />
              {linkCount > 0 && (
                <span className="flex items-center gap-1" aria-label={`${linkCount} linked ${linkCount === 1 ? "item" : "items"}`}>
                  <Link2 className="size-3.5" aria-hidden />
                  {linkCount}
                </span>
              )}
            </div>
          )}
        </div>

        { }
        <span className="flex shrink-0 flex-col items-end justify-between" onClick={(e) => e.stopPropagation()}>
          <CardMenu item={item} group={group} />
          <UpdatesBadge summary={updates.get(item.id)} onClick={() => openItemUpdates(item.id)} className="min-h-11 px-2.5" />
        </span>
      </div>

      {subitems.length > 0 && (
        <button
          type="button"
          onClick={() => toggleExpanded(board.id, item.id)}
          aria-expanded={expanded}
          className="flex min-h-11 w-full items-center gap-1.5 border-t border-border/50 px-3 text-left text-[13px] font-medium text-muted-foreground active:bg-accent/70"
          data-testid="mobile-subitems-toggle"
        >
          <ChevronDown aria-hidden className={cn("size-4 transition-transform motion-reduce:transition-none", !expanded && "-rotate-90")} />
          {subitems.length} {subitems.length === 1 ? "subitem" : "subitems"}
          {subitems.length > 0 && <span className="ml-auto text-xs tabular">{subitems.filter((s) => model.isDone(s.id)).length} done</span>}
        </button>
      )}
      {expanded && subitems.length > 0 && (
        <ul className="divide-y divide-border/50 border-t border-border/50 bg-surface/40">
          {subitems.map((sub) => (
            <MobileItemCard key={sub.id} item={sub} group={group} selectMode={selectMode} indent />
          ))}
        </ul>
      )}

      {editable && statusColumn && (
        <LabelSheet
          open={editing === "status"}
          onOpenChange={(open) => !open && setEditing(null)}
          title={statusColumn.name}
          column={statusColumn}
          current={status?.id ?? null}
          onPick={(labelId) => void mutations.setValue(item, statusColumn, { type: "STATUS", labelId })}
        />
      )}
      {editable && priorityColumn && (
        <LabelSheet
          open={editing === "priority"}
          onOpenChange={(open) => !open && setEditing(null)}
          title={priorityColumn.name}
          column={priorityColumn}
          current={priority?.id ?? null}
          onPick={(labelId) => void mutations.setValue(item, priorityColumn, { type: "PRIORITY", labelId })}
        />
      )}
      {editable && dueColumn && (
        <DateSheet
          open={editing === "date"}
          onOpenChange={(open) => !open && setEditing(null)}
          title={dueColumn.name}
          current={due}
          onPick={(date) => {
            const existing = model.getValue(item.id, dueColumn.id);
            const value = dueColumn.type === "TIMELINE" ? { type: "TIMELINE" as const, start: existing?.type === "TIMELINE" ? existing.start : date, end: date } : { type: "DATE" as const, date };
            void mutations.setValue(item, dueColumn, value);
          }}
        />
      )}
    </li>
  );
}

function Owners({ userIds }: { userIds: string[] }) {
  const { users: assignable, people: users = assignable } = useBoardContext();
  const people = userIds.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  if (people.length === 0) return null;
  return <AvatarStack users={people} size="md" max={3} />;
}

/** One of a column's labels, chosen from a sheet: the whole row is the target. */
function LabelSheet({
  open,
  onOpenChange,
  title,
  column,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  column: BoardColumn;
  current: string | null;
  onPick: (labelId: string | null) => void;
}) {
  const labels: ColumnLabel[] = columnLabels(column);
  const pick = (labelId: string | null) => {
    onPick(labelId);
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={title}>
        <div role="menu" className="pb-2">
          {labels.map((label) => (
            <SheetItem key={label.id} selected={label.id === current} onClick={() => pick(label.id)} data-testid="mobile-label-option">
              <span aria-hidden className={cn("size-3 shrink-0 rounded-full", colorClasses(label.color).dot)} />
              <span className="min-w-0 flex-1 truncate">{label.name}</span>
              {label.id === current && <Check className="size-4 shrink-0" aria-hidden />}
            </SheetItem>
          ))}
          {current && (
            <SheetItem onClick={() => pick(null)} className="text-muted-foreground">
              <span aria-hidden className="size-3 shrink-0 rounded-full border border-dashed border-border" />
              Clear
            </SheetItem>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** A date, from the phone's own picker, with the few days people actually reach for above it. */
function DateSheet({ open, onOpenChange, title, current, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; current: string | null; onPick: (date: string | null) => void }) {
  const [draft, setDraft] = React.useState(current ?? "");
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setDraft(current ?? "");
  }
  const pick = (date: string | null) => {
    onPick(date);
    onOpenChange(false);
  };
  const today = new Date();
  const plus = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={title}
        footer={
          <div className="flex gap-2">
            {current && (
              <Button variant="outline" className="h-11 flex-1" onClick={() => pick(null)}>
                Clear
              </Button>
            )}
            <Button className="h-11 flex-1" disabled={!draft} onClick={() => pick(draft)} data-testid="mobile-date-save">
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3 pb-2">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Today", date: plus(0) },
              { label: "Tomorrow", date: plus(1) },
              { label: "Next week", date: plus(7) },
            ].map((quick) => (
              <button
                key={quick.label}
                type="button"
                onClick={() => setDraft(quick.date)}
                className={cn("h-11 rounded-lg border text-[13px] font-medium active:bg-accent/70", draft === quick.date ? "border-ring bg-accent-soft/60" : "border-border/70")}
              >
                {quick.label}
              </button>
            ))}
          </div>
          <Input type="date" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Pick a date" className="h-12 text-base" data-testid="mobile-date-input" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The item's actions, from the same declarations the desktop row menu uses. */
function CardMenu({ item, group }: { item: Item; group: BoardGroup }) {
  const { model, mutations, canEdit, openItem } = useBoardContext();
  const setArchiveRequest = useBoardUiStore((s) => s.setArchiveRequest);
  const [open, setOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const ticket = item.ticket;
  const subitems = model.subitemsByParent.get(item.id) ?? [];

  const actions: MenuAction[] = React.useMemo(() => {
    const base: MenuAction[] = [{ type: "item", label: "Open", onSelect: () => openItem(item.id) }];
    if (ticket) base.push({ type: "item", label: `Copy ID ${ticket}`, onSelect: () => void copyToClipboard(ticket, `${ticket} copied`) });
    if (!canEdit) return base;
    return [
      ...base,
      // A subitem lives in its parent's group and has no subitems of its own,
      // so neither offer makes sense for one.
      ...(item.parentItemId
        ? []
        : ([
            { type: "item", label: "Add subitem", onSelect: () => void mutations.createItem({ groupId: item.groupId, parentItemId: item.id, name: "New subitem" }) },
          ] satisfies MenuAction[])),
      { type: "item", label: "Duplicate", onSelect: () => void mutations.duplicateItem(item.id) },
      ...(item.parentItemId
        ? []
        : ([
            {
              type: "sub",
              label: "Move to group",
              items: model.groups.filter((g) => g.id !== group.id).map((g) => ({ type: "item" as const, label: g.name, onSelect: () => void mutations.moveItemsToGroup([item.id], g.id) })),
            },
          ] satisfies MenuAction[])),
      { type: "separator" },
      { type: "item", label: "Archive", onSelect: () => setArchiveRequest([item.id]) },
      { type: "item", label: "Delete", destructive: true, onSelect: () => setConfirmDelete(true) },
    ];
  }, [item.id, item.groupId, item.parentItemId, ticket, group.id, canEdit, model.groups, mutations, openItem, setArchiveRequest]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Actions for ${item.name}`}
        className="flex size-11 items-center justify-center rounded-lg text-muted-foreground active:bg-accent/70 focus-visible:outline-2 focus-visible:outline-ring"
        data-testid="mobile-item-menu"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
      <MenuSheet open={open} onOpenChange={setOpen} title={item.name} actions={actions} />
      {/* Deleting asks first, exactly as the desktop row does. */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${item.name}”?`}
        description={subitems.length ? `This also deletes its ${subitems.length} subitems and all updates.` : "This permanently deletes the item and its updates."}
        confirmLabel="Delete item"
        destructive
        onConfirm={() => mutations.deleteItems([item.id]).then(() => undefined)}
      />
    </>
  );
}
