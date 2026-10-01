"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item } from "@/domain";
import { groupAssetBlocks } from "@/domain";
import { AssetComposer } from "@/features/assets/asset-composer";
import { copyOfAssetLine, useAssetMutations, useItemAssets } from "@/features/items/asset-hooks";
import { MyAssetsStrip, MyAssetsToggle } from "@/features/items/my-assets-filter";
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
  const rows = React.useMemo(() => (assets.data ?? []).slice().sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)), [assets.data]);
  const [onlyMine, setOnlyMine] = React.useState(false);
  const meId = ws.currentUser.id;
  const mine = React.useMemo(() => rows.filter((row) => row.assigneeIds.includes(meId)), [rows, meId]);
  const todo = mine.filter((row) => !row.completedAt).length;
  // Numbered as the whole list numbers them, so "3" filtered is "3" in full.
  const numbers = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of groupAssetBlocks(rows)) for (const line of entry.kind === "line" ? [entry.line] : entry.lines) map.set(line.id, map.size + 1);
    return map;
  }, [rows]);

  if (assets.isLoading) {
    return (
      <div className="space-y-2 p-4" data-testid="assets-loading">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
      </div>
    );
  }

  // Nothing on this task is theirs: no toggle. Kept while it is on, so taking
  // the last line off yourself does not snap the list back.
  const toggle = mine.length > 0 || onlyMine ? <MyAssetsToggle on={onlyMine} todo={todo} onChange={setOnlyMine} /> : null;

  return (
    <div className="p-4" data-testid="assets-tab">
      <AssetComposer
        rows={onlyMine ? mine : rows}
        assetTypes={assetTypes}
        users={ws.users}
        canEdit={canEdit}
        addable={!onlyMine}
        numbers={numbers}
        emptyText={onlyMine ? "Nothing here is on you." : canEdit ? "No items yet." : "No items listed."}
        actions={
          onlyMine ? (
            <>
              <MyAssetsStrip shown={mine.length} total={rows.length} onShowAll={() => setOnlyMine(false)} />
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
