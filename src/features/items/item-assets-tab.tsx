"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item } from "@/domain";
import { groupAssetBlocks, resolveColumnRoles } from "@/domain";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { AssetComposer } from "@/features/assets/asset-composer";
import { copyOfAssetLine, useAssetMutations, useItemAssets } from "@/features/items/asset-hooks";
import { MyAssetsStrip, MyAssetsToggle } from "@/features/items/my-assets-filter";
import { ItemTrackerSheet, MoveIntoSheetButton, UseTrackerSheetButton } from "@/features/items/item-tracker-sheet";
import { useItemTrackerSheet } from "@/features/trackers/hooks";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";

/**
 * The Assets tab: the task's deliverables in the shared asset composer, saved as
 * they are edited. How much of it is finished is read above the tabs (see
 * AssetsRecapStrip), not here.
 *
 * The booking form composes its deliverables with the same component, so the two
 * never drift apart; only the fields differ, since a stakeholder booking work has
 * nobody to put in charge and nothing to tick off yet. Beside Block, To-do
 * narrows the list to the lines on the person looking (see MyAssetsToggle).
 * Adding is off while it does: a new line is nobody's yet, so it would vanish.
 */
export function ItemAssetsTab({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const assets = useItemAssets(item.id);
  const mutations = useAssetMutations(item);
  const ws = useWorkspace();
  const assetTypes = useWorkspaceList(ws.workspace.id, "ASSET_TYPES");
  const all = React.useMemo(() => (assets.data ?? []).slice().sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)), [assets.data]);
  // A tracker sheet's lines are listed apart and changed in the sheet; the
  // composer edits the task's own.
  const rows = React.useMemo(() => all.filter((line) => !line.trackerSheetId), [all]);
  const sheetLines = React.useMemo(() => all.filter((line) => line.trackerSheetId), [all]);
  const [onlyMine, setOnlyMine] = React.useState(false);
  // The linked sheet, read by the sheet section below: its lines wait for it, so the tab does too.
  const linkedSheet = useItemTrackerSheet(item.id);
  // The first paint is the skeleton; the list, which can be long, is drawn in a pass React may break up.
  const drawn = React.useDeferredValue(true, false);
  // The task's PIC and due date, from the board's PIC and due-date columns: offered in each asset's pickers.
  const snapshot = useBoardSnapshot(item.boardId);
  const taskDefaults = React.useMemo(() => {
    if (!snapshot.data) return null;
    const roles = resolveColumnRoles(snapshot.data.columns);
    const valueOf = (columnId: string | undefined) => (columnId ? snapshot.data!.values.find((v) => v.itemId === item.id && v.columnId === columnId)?.value : undefined);
    const pic = valueOf(roles.pic?.id);
    const due = valueOf(roles.dueDate?.id);
    return {
      assigneeIds: pic && pic.type === "PERSON" ? pic.userIds : [],
      dueDate: due?.type === "DATE" ? due.date : due?.type === "TIMELINE" ? due.end : null,
    };
  }, [snapshot.data, item.id]);
  // Opened straight after a sheet is linked here, while the task has assets to offer it.
  const [moveOpen, setMoveOpen] = React.useState(false);
  const meId = ws.currentUser.id;
  const mine = React.useMemo(() => rows.filter((row) => row.assigneeIds.includes(meId)), [rows, meId]);
  // The To-do count and strip cover the sheet's lines too: they are the task's.
  const mineAll = React.useMemo(() => all.filter((row) => row.assigneeIds.includes(meId)), [all, meId]);
  const todo = mineAll.filter((row) => !row.completedAt).length;
  // To-do narrows both lists, the sheet's and the task's own, to the viewer's lines.
  const shownSheetLines = onlyMine ? sheetLines.filter((line) => line.assigneeIds.includes(meId)) : sheetLines;
  // Numbered as the whole list numbers them, so "3" filtered is "3" in full.
  const numbers = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of groupAssetBlocks(rows)) for (const line of entry.kind === "line" ? [entry.line] : entry.lines) map.set(line.id, map.size + 1);
    return map;
  }, [rows]);

  if (assets.isLoading || (sheetLines.length > 0 && linkedSheet.isLoading) || !drawn) {
    return <AssetsSkeleton sheetRows={Math.min(sheetLines.length, 6)} rows={assets.data ? Math.min(Math.max(rows.length, 1), 6) : 3} />;
  }

  // Nothing on this task is theirs: no toggle. Kept while it is on, so taking
  // the last line off yourself does not snap the list back.
  const toggle = mineAll.length > 0 || onlyMine ? <MyAssetsToggle on={onlyMine} todo={todo} onChange={setOnlyMine} /> : null;

  return (
    <div className="p-4" data-testid="assets-tab">
      <AssetComposer
        rows={onlyMine ? mine : rows}
        taskDefaults={taskDefaults}
        assetTypes={assetTypes}
        users={ws.users}
        canEdit={canEdit}
        addable={!onlyMine}
        numbers={numbers}
        emptyText={onlyMine ? (shownSheetLines.length > 0 ? "Nothing added on this task is on you." : "Nothing here is on you.") : sheetLines.length > 0 ? "Nothing added on this task." : canEdit ? "No items yet." : "No items listed."}
        beforeList={
          <>
            <ItemTrackerSheet item={item} lines={shownSheetLines} canEdit={canEdit} filtered={onlyMine} />
            {/* With a sheet above, the task's own lines get a name of their own, and can move into it. */}
            {(shownSheetLines.length > 0 || (canEdit && !onlyMine)) && (
              <div className="mb-1 flex min-h-7 items-center gap-2 px-0.5 empty:hidden">
                {shownSheetLines.length > 0 && <h4 className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase" data-testid="own-assets-heading">Added on this task</h4>}
                {canEdit && !onlyMine && <MoveIntoSheetButton item={item} lines={rows} open={moveOpen} onOpenChange={setMoveOpen} />}
              </div>
            )}
          </>
        }
        actions={
          onlyMine ? (
            <>
              <MyAssetsStrip shown={mineAll.length} total={all.length} onShowAll={() => setOnlyMine(false)} />
              {toggle}
            </>
          ) : canEdit && sheetLines.length === 0 ? (
            <>
              {/* Beside Block: keep the assets in a tracker sheet instead. Only while there is none. */}
              <UseTrackerSheetButton item={item} onLinked={() => rows.length > 0 && setMoveOpen(true)} />
              {toggle}
            </>
          ) : (
            toggle
          )
        }
        onAdd={(name, block) =>
          mutations.add.mutate(block ? { name, quantity: 1, blockId: block.blockId, blockName: block.blockName, assigneeIds: block.assigneeIds, blockLinks: block.blockLinks } : { name, quantity: 1 })
        }
        onAddBlock={(block) =>
          mutations.addBlock.mutate({ name: block.name, assigneeIds: block.assigneeIds, links: block.links, lines: block.lines.map(({ name, assetType, quantity, dueDate }) => ({ name, assetType, quantity, dueDate })) })
        }
        onSaveBlock={(blockId, form) => mutations.saveBlock.mutate({ blockId, form })}
        onPatchBlock={(blockId, patch) => mutations.updateBlock.mutate({ blockId, patch })}
        onRemoveBlock={(blockId) => mutations.removeBlock.mutate(blockId)}
        onPatch={(id, patch) => mutations.update.mutate({ id, patch })}
        onDuplicate={(row) => mutations.add.mutate(copyOfAssetLine(row))}
        onRemove={(id) => mutations.remove.mutate(id)}
      />
    </div>
  );
}

/**
 * The Assets tab while it loads: a sheet section's frame when the task keeps
 * lines in a sheet, the toolbar, then the task's own lines, about as many as
 * there will be, so the tab does not jump when they arrive.
 */
function AssetsSkeleton({ sheetRows, rows }: { sheetRows: number; rows: number }) {
  return (
    <div className="space-y-3 p-4" data-testid="assets-loading" aria-busy="true" aria-label="Loading assets">
      {sheetRows > 0 && (
        <div className="space-y-1.5 rounded-lg border border-emerald-600/30 bg-emerald-600/[0.03] p-2 dark:border-emerald-400/25 dark:bg-emerald-400/[0.04]" data-testid="assets-loading-sheet">
          <Skeleton className="h-6 w-2/5" />
          {Array.from({ length: sheetRows }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    </div>
  );
}
