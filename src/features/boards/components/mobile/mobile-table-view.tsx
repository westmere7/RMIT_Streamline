"use client";

import { Archive, ArrowRight, CheckSquare, ChevronDown, Copy, LayoutList, Plus, SearchX, Table2, Trash2, X } from "lucide-react";
import * as React from "react";
import { MenuSheet } from "@/components/layout/menu-sheet";
import type { MenuAction } from "@/components/layout/row-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { BoardGroup } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { MobileItemCard } from "@/features/boards/components/mobile/mobile-item-card";
import { colorClasses } from "@/lib/colors";
import { cn, pluralize } from "@/lib/utils";
import { useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";

/** One shared empty array, so a group with no items keeps a stable identity. */
const NO_OVERRIDES: string[] = [];

/**
 * The Main Table on a phone: the board's groups as folding sections of cards.
 *
 * Same model, same filters, same sort, same group order as the desktop table —
 * only the row is a card instead of a scrolling line of cells. The grid itself
 * is still reachable (see MobileGrid) for anyone who wants the columns; it
 * scrolls inside its own box so the page never moves sideways.
 */
export function MobileTableView({ mode, onModeChange }: { mode: "cards" | "grid"; onModeChange: (mode: "cards" | "grid") => void }) {
  const { board, model, canEdit } = useBoardContext();
  const ui = useBoardUi(board.id);
  const loading = useBoardUiStore((s) => s.boardLoading);
  const [selectMode, setSelectMode] = React.useState(false);
  const clearSelection = useBoardUiStore((s) => s.clearSelection);

  // Leaving selection mode drops the selection with it, so the bar cannot
  // linger over a board with nothing ticked.
  const exitSelect = () => {
    setSelectMode(false);
    clearSelection(board.id);
  };

  const nothingMatches = model.isFiltered && model.visibleTopLevel === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="mobile-table">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <ModeToggle mode={mode} onChange={onModeChange} />
        <span className="ml-auto text-2xs text-muted-foreground tabular">
          {model.isFiltered ? `${model.visibleTopLevel} of ${model.totalTopLevel}` : pluralize(model.totalTopLevel, "item", "items")}
        </span>
        {canEdit && mode === "cards" && (
          <button
            type="button"
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            aria-pressed={selectMode}
            className={cn("flex min-h-9 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-2xs font-medium active:bg-accent/70", selectMode && "border-ring bg-accent-soft/60")}
            data-testid="mobile-select-mode"
          >
            <CheckSquare className="size-3.5" aria-hidden /> {selectMode ? "Done" : "Select"}
          </button>
        )}
      </div>

      {mode === "grid" ? (
        <MobileGrid />
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="px-3 pt-3 pb-28">
            {nothingMatches ? (
              <EmptyState icon={SearchX} title="Nothing matches" description="No item on this board matches the current search and filters." />
            ) : (
              model.groups.map((group) => <MobileGroup key={group.id} group={group} selectMode={selectMode} />)
            )}
            {loading && <p className="py-4 text-center text-2xs text-muted-foreground">Refreshing…</p>}
          </div>
        </div>
      )}

      {selectMode && ui.selectedItemIds.length > 0 && <MobileBulkBar onDone={exitSelect} />}
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: "cards" | "grid"; onChange: (mode: "cards" | "grid") => void }) {
  return (
    <div role="radiogroup" aria-label="How to show the board" className="inline-flex items-center rounded-full border border-border/70 bg-card p-0.5">
      {(
        [
          { value: "cards" as const, label: "Cards", icon: LayoutList },
          { value: "grid" as const, label: "Grid", icon: Table2 },
        ]
      ).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => onChange(value)}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-2xs font-medium transition-colors motion-reduce:transition-none", mode === value ? "bg-foreground text-background" : "text-muted-foreground")}
          data-testid={`mobile-mode-${value}`}
        >
          <Icon className="size-3.5" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

function MobileGroup({ group, selectMode }: { group: BoardGroup; selectMode: boolean }) {
  const { board, model, mutations, canEdit } = useBoardContext();
  const overrides = useBoardUiStore((s) => s.boards[board.id]?.collapsedGroupOverrides ?? NO_OVERRIDES);
  const toggleLocally = useBoardUiStore((s) => s.toggleGroupCollapsedLocally);
  const setSelected = useBoardUiStore((s) => s.setSelected);
  const ui = useBoardUi(board.id);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  // Folding is the board's own setting for anyone who may change it, and this
  // visit's business for anyone who may not — exactly as on the desktop.
  const collapsed = canEdit ? group.collapsed : overrides.includes(group.id) !== group.collapsed;
  const toggle = () => (canEdit ? void mutations.updateGroup(group.id, { collapsed: !collapsed }) : toggleLocally(board.id, group.id));

  const items = model.itemsByGroup.get(group.id) ?? [];
  const colors = colorClasses(group.color);
  const selectedHere = items.filter((i) => ui.selectedItemIds.includes(i.id)).length;
  const allSelected = items.length > 0 && selectedHere === items.length;

  const toggleAll = (checked: boolean) => {
    const ids = new Set(ui.selectedItemIds);
    for (const item of items) {
      if (checked) ids.add(item.id);
      else ids.delete(item.id);
    }
    setSelected(board.id, [...ids]);
  };

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    void mutations.createItem({ groupId: group.id, name });
    setDraft("");
  };

  return (
    <section className="mb-4" data-testid="mobile-group">
      <div className="mb-1.5 flex items-center gap-1.5">
        {selectMode && items.length > 0 && (
          <Checkbox checked={allSelected} onCheckedChange={(checked) => toggleAll(checked === true)} aria-label={`Select every item in ${group.name}`} className="ml-1 size-5" />
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left active:bg-accent/70"
          data-testid="mobile-group-toggle"
        >
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 transition-transform motion-reduce:transition-none", colors.text, collapsed && "-rotate-90")} />
          <span className={cn("min-w-0 truncate text-[15px] font-semibold tracking-tight", colors.text)}>{group.name}</span>
          <span className="shrink-0 rounded-full bg-surface-strong/80 px-2 py-0.5 text-2xs font-medium text-muted-foreground tabular">{items.length}</span>
        </button>
      </div>

      {!collapsed && (
        <>
          <ul className={cn("divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card", `border-l-[3px] ${colors.border}`)}>
            {items.map((item) => (
              <MobileItemCard key={item.id} item={item} group={group} selectMode={selectMode} />
            ))}
            {items.length === 0 && <li className="px-3 py-3 text-[13px] text-muted-foreground">Nothing in this group.</li>}
            {canEdit && !selectMode && (
              <li>
                {adding ? (
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submit();
                        if (e.key === "Escape") {
                          setDraft("");
                          setAdding(false);
                        }
                      }}
                      onBlur={() => {
                        submit();
                        setAdding(false);
                      }}
                      placeholder="Item name"
                      aria-label={`New item in ${group.name}`}
                      className="h-11 text-base"
                      data-testid="mobile-new-item-input"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="flex min-h-12 w-full items-center gap-2 px-3 text-left text-[13px] text-muted-foreground active:bg-accent/70"
                    data-testid="mobile-add-item"
                  >
                    <Plus className="size-4" aria-hidden /> Add item
                  </button>
                )}
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Bulk actions, above the bottom navigation and clear of the home indicator.
 *
 * The desktop bar floats in the middle of the board; here it spans the width,
 * because a centred pill on a phone either covers the cards or is too small to
 * hit. "Move to" opens a sheet rather than a dropdown for the same reason.
 */
function MobileBulkBar({ onDone }: { onDone: () => void }) {
  const { board, model, mutations } = useBoardContext();
  const ui = useBoardUi(board.id);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const ids = ui.selectedItemIds.filter((id) => model.itemById.has(id));
  if (ids.length === 0) return null;

  const after = (run: () => void) => {
    run();
    onDone();
  };

  const moveActions: MenuAction[] = model.groups.map((g) => ({
    type: "item",
    label: g.name,
    onSelect: () => after(() => void mutations.moveItemsToGroup(ids, g.id)),
  }));

  return (
    <>
      <div
        role="toolbar"
        aria-label="Bulk actions"
        data-testid="mobile-bulk-actions"
        className="shrink-0 border-t border-border/70 bg-popover px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 shrink-0 items-center rounded-full bg-primary px-2.5 text-xs font-semibold text-white tabular">{ids.length}</span>
          <span className="min-w-0 flex-1 truncate text-[13px]">{ids.length === 1 ? "item selected" : "items selected"}</span>
          <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={onDone} className="size-9">
            <X />
          </Button>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          <BulkButton icon={ArrowRight} label="Move" onClick={() => setMoveOpen(true)} testId="mobile-bulk-move" />
          <BulkButton icon={Copy} label="Duplicate" onClick={() => after(() => ids.forEach((id) => void mutations.duplicateItem(id)))} />
          <BulkButton icon={Archive} label="Archive" onClick={() => after(() => void mutations.archiveItems(ids))} />
          <BulkButton icon={Trash2} label="Delete" destructive onClick={() => after(() => void mutations.deleteItems(ids))} />
        </div>
      </div>
      <MenuSheet open={moveOpen} onOpenChange={setMoveOpen} title="Move to group" actions={moveActions} />
    </>
  );
}

function BulkButton({ icon: Icon, label, onClick, destructive, testId }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; destructive?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn("flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-border/70 text-2xs font-medium active:bg-accent/70", destructive && "text-destructive")}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </button>
  );
}

/**
 * The real grid, for when the columns are the point.
 *
 * The desktop table, kept whole. It already scrolls inside its own scrollport,
 * so this frame only clips it to the screen — a second scrolling box around it
 * would nest two scrollers over the same content, which on a touch screen means
 * a swipe that moves the wrong one. Mounted only when the grid is chosen, so a
 * phone that never opens it never pays for it.
 */
function MobileGrid() {
  const { BoardTable } = useLazyBoardTable();
  return (
    <div className="min-h-0 flex-1 overflow-hidden p-2" data-testid="mobile-grid">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card">
        {BoardTable ? <BoardTable /> : <p className="p-4 text-[13px] text-muted-foreground">Loading the grid…</p>}
      </div>
    </div>
  );
}

/** Loads the desktop table only when the grid is actually opened. */
function useLazyBoardTable() {
  const [BoardTable, setBoardTable] = React.useState<React.ComponentType | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void import("@/features/boards/components/table/board-table").then((mod) => {
      if (!cancelled) setBoardTable(() => mod.BoardTable as unknown as React.ComponentType);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { BoardTable };
}
