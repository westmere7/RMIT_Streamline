"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Item, ItemAsset, ItemAssetInput, ItemAssetPatch } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { newId, nowIso } from "@/lib/ids";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";

export function useItemAssets(itemId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.itemAssets(itemId ?? ""),
    queryFn: () => services.assets.list(itemId!),
    enabled: !!itemId,
    staleTime: 5_000,
  });
}

/**
 * A board's deliverables, both ways the board needs them: `lines` for its own
 * totals and `byItem` for what each row shows, links included. Shares its key
 * prefix with the per-item query so both refresh together.
 *
 * It also watches the boards on the far side of this board's links. A shared
 * line is stored on whichever board it was added to, so ticking one off updates
 * a row on a board whose own channel never hears about it — the event carries
 * that other board's id, and this board's subscription is filtered to its own.
 * One binding per linked board, which is a handful at most.
 */
export function useBoardAssets(boardId: string) {
  const services = useServices();
  const ws = useWorkspace();
  const query = useQuery({
    queryKey: queryKeys.boardAssets(boardId),
    queryFn: () => services.assets.loadBoard(boardId, ws.workspace.id),
    staleTime: 5_000,
  });
  const linkedBoardIds = query.data?.linkedBoardIds ?? EMPTY_BOARD_IDS;
  const bindings: RealtimeBinding[] = linkedBoardIds.map((id) => ({
    table: "item_assets",
    filter: `board_id=eq.${id}`,
    // The panel reads the same shared lines, so it follows them too.
    keys: [queryKeys.boardAssets(boardId), ["item-assets"]],
  }));
  useRealtime(linkedBoardIds.length > 0 ? `board-linked-assets:${boardId}:${[...linkedBoardIds].sort().join(",")}` : null, bindings);
  return query;
}

/** Stable empty list, so a board with no links does not rebuild its (absent) subscription every render. */
const EMPTY_BOARD_IDS: string[] = [];

/**
 * How much of an item's asset list is ticked off, counted in lines rather than
 * units: a line is one deliverable, and 2,400 booklets alongside three banners
 * would otherwise drown out everything else on the list.
 */
export interface AssetProgress {
  /** Lines on the item. */
  lines: number;
  /** How many of them are done. */
  done: number;
  /** 0-100, rounded. */
  percent: number;
}

/**
 * Cached on the map React Query hands back, so a board of two hundred rows
 * works its asset lines out once rather than once per row. Structural sharing
 * keeps that object identical until the lines actually change.
 */
const progressCache = new WeakMap<Map<string, ItemAsset[]>, Map<string, AssetProgress>>();

function progressByItem(byItem: Map<string, ItemAsset[]>): Map<string, AssetProgress> {
  const cached = progressCache.get(byItem);
  if (cached) return cached;
  const map = new Map<string, AssetProgress>();
  for (const [itemId, assets] of byItem) {
    const done = assets.filter((a) => a.completedAt).length;
    map.set(itemId, { lines: assets.length, done, percent: assets.length > 0 ? Math.round((done / assets.length) * 100) : 0 });
  }
  progressCache.set(byItem, map);
  return map;
}

/**
 * What an item's asset list adds up to, or null while the board's lines load or
 * it has none.
 *
 * Counted from what the row shows rather than from what this board stores, so a
 * linked task's bar says the same thing as the panel behind it.
 */
export function useItemAssetProgress(boardId: string, itemId: string): AssetProgress | null {
  const assets = useBoardAssets(boardId);
  return assets.data ? progressByItem(assets.data.byItem).get(itemId) ?? null : null;
}

/** The deliverables one row of a board shows: its own, plus anything shared into it. */
export function useItemLinesOnBoard(boardId: string, itemId: string): readonly ItemAsset[] | null {
  const assets = useBoardAssets(boardId);
  return assets.data ? assets.data.byItem.get(itemId) ?? EMPTY_LINES : null;
}

const EMPTY_LINES: readonly ItemAsset[] = [];

export type NewAssetLine = Omit<ItemAssetInput, "itemId" | "boardId" | "position" | "createdBy">;

/**
 * Add, change and remove lines with the list updated on screen at once. Every
 * write also refreshes the board snapshot, because the recap column's value
 * changes with the lines.
 */
export function useAssetMutations(item: Item) {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const key = queryKeys.itemAssets(item.id);

  const settle = async () => {
    await queryClient.invalidateQueries({ queryKey: ["item-assets"] });
    // Every asset change is written to the feed, so the tab and the board's activity follow it.
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    // Every board's snapshot, not just this one: a linked task shares these
    // lines, and the recap the other board draws was just rewritten too. Only
    // the board on screen is actually being watched, so the rest are marked
    // stale and re-read when they are next opened.
    void queryClient.invalidateQueries({ queryKey: ["board-snapshot"] });
    const linked = await services.links.connectedItemIds(item.id).catch(() => []);
    publishDataChange({ itemIds: [item.id, ...linked], boardIds: [item.boardId], kinds: ["assets", "board"] });
  };
  const rollback = (previous: ItemAsset[] | undefined, error: unknown, fallback: string) => {
    if (previous) queryClient.setQueryData(key, previous);
    toast.error(error instanceof Error ? error.message : fallback);
  };

  const add = useMutation({
    mutationFn: (line: NewAssetLine) => services.assets.add({ ...line, itemId: item.id, boardId: item.boardId }, user.id),
    onMutate: async (line) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ItemAsset[]>(key);
      const now = nowIso();
      const temp: ItemAsset = {
        id: newId(),
        itemId: item.id,
        boardId: item.boardId,
        name: line.name.trim(),
        assetType: line.assetType ?? null,
        quantity: line.quantity ?? null,
        assigneeIds: line.assigneeIds ?? [],
        dueDate: line.dueDate ?? null,
        completedAt: null,
        notes: line.notes ?? null,
        previewUrl: null,
        artworkUrl: null,
        position: (previous?.length ? Math.max(...previous.map((a) => a.position)) : -1) + 1,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<ItemAsset[]>(key, (old = []) => [...old, temp]);
      return { previous };
    },
    onError: (error, _line, ctx) => rollback(ctx?.previous, error, "Could not add the asset"),
    onSettled: settle,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ItemAssetPatch }) => services.assets.update(id, patch, user.id),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ItemAsset[]>(key);
      queryClient.setQueryData<ItemAsset[]>(key, (old = []) => old.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: nowIso() } : a)));
      return { previous };
    },
    onError: (error, _v, ctx) => rollback(ctx?.previous, error, "Could not change the asset"),
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: (id: string) => services.assets.remove(id, item.id, item.boardId, user.id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ItemAsset[]>(key);
      queryClient.setQueryData<ItemAsset[]>(key, (old = []) => old.filter((a) => a.id !== id));
      return { previous };
    },
    onError: (error, _id, ctx) => rollback(ctx?.previous, error, "Could not remove the asset"),
    onSettled: settle,
  });

  return { add, update, remove };
}
