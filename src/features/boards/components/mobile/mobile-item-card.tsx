"use client";

import { ChevronDown, CornerDownRight, Link2, MoreHorizontal, TriangleAlert } from "lucide-react";
import * as React from "react";
import { MenuSheet } from "@/components/layout/menu-sheet";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { MenuAction } from "@/components/layout/row-menu";
import { LabelPill } from "@/components/shared/label-pill";
import { PriorityPill } from "@/components/shared/priority-signal";
import { AvatarStack } from "@/components/shared/user-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import type { BoardGroup, Item } from "@/domain";
import { columnLabels, isStuckLabel } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { UpdatesBadge } from "@/features/items/updates-badge";
import { copyToClipboard } from "@/features/members/hooks";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";
import { EMPTY_BOARD_UI, useBoardUiStore } from "@/stores/board-ui-store";

/**
 * One board item as a phone shows it.
 *
 * A table row asks the eye to travel sideways across columns; a card stacks the
 * same facts. What a decision needs — the name, how it stands, how urgent, who
 * has it, when it is due — is on the card, and every other field is one tap away
 * on the item's own screen. It reads the board model the table reads, so a
 * filter or a sort applies to both with no second code path.
 */
export function MobileItemCard({ item, group, selectMode, indent = false }: { item: Item; group: BoardGroup; selectMode: boolean; indent?: boolean }) {
  const { board, model, openItem, openItemUpdates, updates } = useBoardContext();
  const selected = useBoardUiStore((s) => (s.boards[board.id]?.selectedItemIds ?? EMPTY_BOARD_UI.selectedItemIds).includes(item.id));
  const expanded = useBoardUiStore((s) => (s.boards[board.id]?.expandedItemIds ?? EMPTY_BOARD_UI.expandedItemIds).includes(item.id));
  const toggleSelected = useBoardUiStore((s) => s.toggleSelected);
  const toggleExpanded = useBoardUiStore((s) => s.toggleExpanded);

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
  const owners = model.personColumns.flatMap((c) => {
    const v = model.getValue(item.id, c.id);
    return v?.type === "PERSON" ? v.userIds : [];
  });

  return (
    <li className={cn(indent && "pl-5")}>
      <div className="flex items-stretch gap-1.5 px-2.5 py-2">
        {selectMode && (
          <span className="flex w-9 shrink-0 items-center justify-center">
            <Checkbox checked={selected} onCheckedChange={(checked) => toggleSelected(board.id, item.id, checked === true)} aria-label={`Select ${item.name}`} className="size-5" />
          </span>
        )}
        <button
          type="button"
          onClick={() => (selectMode ? toggleSelected(board.id, item.id) : openItem(item.id))}
          className="min-w-0 flex-1 rounded-lg py-0.5 text-left focus-visible:outline-2 focus-visible:outline-ring"
          data-testid="mobile-item-card"
        >
          <span className="flex items-start gap-1.5">
            {indent && <CornerDownRight aria-hidden className="mt-1 size-3.5 shrink-0 text-muted-foreground/60" />}
            <span className={cn("min-w-0 flex-1 text-[15px] leading-snug font-medium", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{item.name}</span>
            {due && <span className={cn("mt-px shrink-0 text-[13px] tabular", late ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatShortDate(due)}</span>}
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {status && <LabelPill label={status} size="sm" striped={isStuckLabel(statusColumn, status.id)} />}
            {priority && <PriorityPill label={priority} />}
            {late && (
              <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-2xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300" data-testid="mobile-overdue">
                Overdue
              </span>
            )}
            {blocked && (
              <span className="flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-2xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                <TriangleAlert className="size-3" aria-hidden /> Blocked
              </span>
            )}
          </span>

          {(item.reference || owners.length > 0 || linkCount > 0) && (
            <span className="mt-1.5 flex items-center gap-2.5 text-2xs text-muted-foreground">
              {/* A span, not a button: the card is already one, and nesting is
                  invalid. Copying the code lives in the card's menu. */}
              {item.reference && <span className="font-mono tracking-tight tabular">{item.reference}</span>}
              <Owners userIds={owners} />
              {linkCount > 0 && (
                <span className="flex items-center gap-0.5" aria-label={`${linkCount} linked ${linkCount === 1 ? "item" : "items"}`}>
                  <Link2 className="size-3" aria-hidden />
                  {linkCount}
                </span>
              )}
            </span>
          )}
        </button>

        <span className="flex shrink-0 flex-col items-end justify-between">
          <CardMenu item={item} group={group} />
          <UpdatesBadge summary={updates.get(item.id)} onClick={() => openItemUpdates(item.id)} className="min-h-11 px-2.5" />
        </span>
      </div>

      {subitems.length > 0 && (
        <div className="px-2.5 pb-1.5">
          <button
            type="button"
            onClick={() => toggleExpanded(board.id, item.id)}
            aria-expanded={expanded}
            className="flex min-h-11 items-center gap-1 rounded-lg px-1 text-2xs font-medium text-muted-foreground active:bg-accent/70"
            data-testid="mobile-subitems-toggle"
          >
            <ChevronDown aria-hidden className={cn("size-3.5 transition-transform motion-reduce:transition-none", !expanded && "-rotate-90")} />
            {subitems.length} {subitems.length === 1 ? "subitem" : "subitems"}
          </button>
        </div>
      )}
      {expanded && subitems.length > 0 && (
        <ul className="divide-y divide-border/50 border-t border-border/50 bg-surface/40">
          {subitems.map((sub) => (
            <MobileItemCard key={sub.id} item={sub} group={group} selectMode={selectMode} indent />
          ))}
        </ul>
      )}
    </li>
  );
}

function Owners({ userIds }: { userIds: string[] }) {
  const { users } = useBoardContext();
  const people = userIds.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  if (people.length === 0) return null;
  return <AvatarStack users={people} size="sm" max={3} />;
}

/** The item's actions, from the same declarations the desktop row menu uses. */
function CardMenu({ item, group }: { item: Item; group: BoardGroup }) {
  const { model, mutations, canEdit, openItem } = useBoardContext();
  const setArchiveRequest = useBoardUiStore((s) => s.setArchiveRequest);
  const [open, setOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const reference = item.reference;
  const subitems = model.subitemsByParent.get(item.id) ?? [];

  const actions: MenuAction[] = React.useMemo(() => {
    const base: MenuAction[] = [{ type: "item", label: "Open", onSelect: () => openItem(item.id) }];
    if (reference) base.push({ type: "item", label: `Copy ID ${reference}`, onSelect: () => void copyToClipboard(reference, `${reference} copied`) });
    if (!canEdit) return base;
    return [
      ...base,
      { type: "item", label: "Add subitem", onSelect: () => void mutations.createItem({ groupId: item.groupId, parentItemId: item.id, name: "New subitem" }) },
      { type: "item", label: "Duplicate", onSelect: () => void mutations.duplicateItem(item.id) },
      {
        type: "sub",
        label: "Move to group",
        items: model.groups.filter((g) => g.id !== group.id).map((g) => ({ type: "item" as const, label: g.name, onSelect: () => void mutations.moveItemsToGroup([item.id], g.id) })),
      },
      { type: "separator" },
      { type: "item", label: "Archive", onSelect: () => setArchiveRequest([item.id]) },
      { type: "item", label: "Delete", destructive: true, onSelect: () => setConfirmDelete(true) },
    ];
  }, [item.id, item.groupId, reference, group.id, canEdit, model.groups, mutations, openItem, setArchiveRequest]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Actions for ${item.name}`}
        className="flex size-11 items-center justify-center rounded-lg text-muted-foreground active:bg-accent/70 focus-visible:outline-2 focus-visible:outline-ring"
        data-testid="mobile-item-menu"
      >
        <MoreHorizontal className="size-4" aria-hidden />
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
