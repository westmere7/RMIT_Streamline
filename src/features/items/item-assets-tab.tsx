"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item } from "@/domain";
import { AssetComposer } from "@/features/assets/asset-composer";
import { copyOfAssetLine, useAssetMutations, useItemAssets } from "@/features/items/asset-hooks";
import { MyAssetsButton } from "@/features/items/my-assets-dialog";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";

/**
 * The Assets tab: the task's deliverables in the shared asset composer, saved as
 * they are edited. How much of it is finished is read above the tabs (see
 * AssetsRecapStrip), not here.
 *
 * The booking form composes its deliverables with the same component, so the two
 * never drift apart; only the fields differ, since a stakeholder booking work has
 * nobody to put in charge and nothing to tick off yet. Beside Block, My to-do
 * opens the lines on the person looking (see MyAssetsButton).
 */
export function ItemAssetsTab({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const assets = useItemAssets(item.id);
  const mutations = useAssetMutations(item);
  const ws = useWorkspace();
  const assetTypes = useWorkspaceList(ws.workspace.id, "ASSET_TYPES");
  const rows = React.useMemo(() => (assets.data ?? []).slice().sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)), [assets.data]);

  if (assets.isLoading) {
    return (
      <div className="space-y-2 p-4" data-testid="assets-loading">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
      </div>
    );
  }

  return (
    <div className="p-4" data-testid="assets-tab">
      <AssetComposer
        rows={rows}
        assetTypes={assetTypes}
        users={ws.users}
        canEdit={canEdit}
        emptyText={canEdit ? "No items yet." : "No items listed."}
        actions={<MyAssetsButton item={item} rows={rows} assetTypes={assetTypes} canEdit={canEdit} />}
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
