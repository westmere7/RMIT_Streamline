"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item } from "@/domain";
import { AssetComposer } from "@/features/assets/asset-composer";
import { useAssetMutations, useItemAssets } from "@/features/items/asset-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";

/**
 * The Assets tab: the task's deliverables in the shared asset composer, saved as
 * they are edited. How much of it is finished is read above the tabs (see
 * AssetsRecapStrip), not here.
 *
 * The booking form composes its deliverables with the same component, so the two
 * never drift apart; only the fields differ, since a stakeholder booking work has
 * nobody to put in charge and nothing to tick off yet.
 */
export function ItemAssetsTab({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const assets = useItemAssets(item.id);
  const mutations = useAssetMutations(item);
  const ws = useWorkspace();
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
        users={ws.users}
        canEdit={canEdit}
        emptyText={canEdit ? "No items yet. Add one above, then open it to set its type, who is in charge, how many and when it is due." : "No items listed."}
        onAdd={(name) => mutations.add.mutate({ name, quantity: 1 })}
        onPatch={(id, patch) => mutations.update.mutate({ id, patch })}
        onDuplicate={(row) =>
          mutations.add.mutate({ name: row.name, assetType: row.assetType, quantity: row.quantity, assigneeIds: row.assigneeIds, dueDate: row.dueDate, notes: row.notes })
        }
        onRemove={(id) => mutations.remove.mutate(id)}
      />
    </div>
  );
}
