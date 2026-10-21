"use client";

import * as React from "react";
import type { AssetRates, ItemAsset, SizeScale, TShirtSize } from "@/domain";
import { assetCount, normaliseAssetRates, normaliseSizeScale, sizeFit, unratedTypes } from "@/domain";
import { itemHours } from "@/features/boards/components/views/workload-hours";
import type { SizeEvidence } from "@/features/boards/components/pickers/size-picker";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useBoardContext } from "@/features/boards/board-context";
import { useBoardAssets } from "@/features/items/asset-hooks";

/** The workspace's size scale (Settings → Sizes), defaults filled in. */
export function useSizeScale(): SizeScale {
  const ws = useWorkspace();
  return React.useMemo(() => normaliseSizeScale(ws.workspace.sizeScale), [ws.workspace.sizeScale]);
}

/** The workspace's output rates, cleaned. */
export function useAssetRates(): AssetRates {
  const ws = useWorkspace();
  return React.useMemo(() => normaliseAssetRates(ws.workspace.assetRates), [ws.workspace.assetRates]);
}

/**
 * What a task's asset lines say about its size: their hours at the workspace's
 * rates, where those land on the scale, and which types were left out for
 * want of a rate.
 */
export function sizeEvidence(lines: ReadonlyArray<Pick<ItemAsset, "assetType" | "quantity">> | undefined, rates: AssetRates, scale: SizeScale): SizeEvidence {
  const list = lines ?? [];
  const hours = itemHours(list, rates);
  return {
    hasAssets: list.length > 0,
    hours,
    fit: sizeFit(hours, scale),
    unrated: unratedTypes(
      list.map((line) => ({ type: line.assetType ?? "", units: assetCount(line) })),
      rates,
    ),
  };
}

/**
 * Keeps every "Follow assets" size in step with its task's assets.
 *
 * Sizes are stored values, read by filters, sorting, the dashboard and the
 * portal, so following means writing: when a following task's assets put it
 * in another size, the new size is saved. That happens wherever the board is
 * open with the right to edit it; a change made with the board closed (a
 * tracker sheet saved elsewhere, say) is caught up the next time it is opened.
 * A task whose assets have no rated hours keeps the size it has.
 */
export function SizeAutoAdjust(): null {
  const { board, model, canEdit, mutations } = useBoardContext();
  const scale = useSizeScale();
  const rates = useAssetRates();
  const assets = useBoardAssets(board.id);
  // What was last asked for each cell, so a save in flight is not asked for again.
  const asked = React.useRef(new Map<string, TShirtSize>());

  React.useEffect(() => {
    if (!canEdit || !assets.data) return;
    const columns = model.columns.filter((c) => c.type === "SIZE");
    if (columns.length === 0) return;
    for (const item of model.itemById.values()) {
      for (const column of columns) {
        const value = model.getValue(item.id, column.id);
        if (value?.type !== "SIZE" || !value.auto) continue;
        const key = `${item.id}:${column.id}`;
        const fit = sizeEvidence(assets.data.byItem.get(item.id), rates, scale).fit;
        if (!fit || fit.size === value.size) {
          asked.current.delete(key);
          continue;
        }
        if (asked.current.get(key) === fit.size) continue;
        asked.current.set(key, fit.size);
        void mutations.setValue(item, column, { type: "SIZE", size: fit.size, auto: true });
      }
    }
  }, [canEdit, assets.data, model, rates, scale, mutations]);

  return null;
}
