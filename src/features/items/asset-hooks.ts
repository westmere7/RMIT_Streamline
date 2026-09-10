"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Item, ItemAsset, ItemAssetInput, ItemAssetPatch } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { newId, nowIso } from "@/lib/ids";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";

export function useItemAssets(itemId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.itemAssets(itemId ?? ""),
    queryFn: () => services.assets.list(itemId!),
    enabled: !!itemId,
    staleTime: 5_000,
  });
}

/** Every line on a board, for the recap cells; shares its key prefix with the per-item query so both refresh together. */
export function useBoardAssets(boardId: string) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.boardAssets(boardId),
    queryFn: () => services.assets.listByBoard(boardId),
    staleTime: 5_000,
  });
}

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
 * Cached on the array React Query hands back, so a board of two hundred rows
 * walks its asset lines once rather than once per row. Structural sharing keeps
 * that array identical until the lines actually change.
 */
const progressCache = new WeakMap<readonly ItemAsset[], Map<string, AssetProgress>>();

function progressByItem(assets: readonly ItemAsset[]): Map<string, AssetProgress> {
  const cached = progressCache.get(assets);
  if (cached) return cached;
  const map = new Map<string, AssetProgress>();
  for (const asset of assets) {
    const entry = map.get(asset.itemId) ?? { lines: 0, done: 0, percent: 0 };
    entry.lines += 1;
    if (asset.completedAt) entry.done += 1;
    map.set(asset.itemId, entry);
  }
  for (const entry of map.values()) entry.percent = entry.lines > 0 ? Math.round((entry.done / entry.lines) * 100) : 0;
  progressCache.set(assets, map);
  return map;
}

/** What an item's asset list adds up to, or null while the board's lines load or it has none. */
export function useItemAssetProgress(boardId: string, itemId: string): AssetProgress | null {
  const assets = useBoardAssets(boardId);
  return assets.data ? progressByItem(assets.data).get(itemId) ?? null : null;
}

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
    void queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(item.boardId) });
    publishDataChange({ itemIds: [item.id], boardIds: [item.boardId], kinds: ["assets", "board"] });
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
