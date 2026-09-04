"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { BoardColumn, BoardGroup, ColumnSettings, ColumnType, ColumnValue, Item, ItemColumnValue, TagOption } from "@/domain";
import { defaultSettingsFor, DEFAULT_COLUMN_WIDTHS } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { newId, nowIso } from "@/lib/ids";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import type { BoardSnapshot, CreateItemInput, MoveItemInput } from "@/services";

type Updater = (snapshot: BoardSnapshot) => BoardSnapshot;

/**
 * Optimistic mutations for a single board. Every action patches the cached
 * snapshot immediately, runs the service call, then reconciles by refetching.
 * Errors roll back to the previous snapshot and surface a toast.
 */
export function useBoardMutations(boardId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const ws = useWorkspace();
  const key = useMemo(() => queryKeys.boardSnapshot(boardId), [boardId]);
  const pending = useRef(0);

  const invalidateRelated = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    // A change here may have been mirrored onto linked items on other boards.
    void queryClient.invalidateQueries({ queryKey: ["board-snapshot"], predicate: (q) => q.queryKey[1] !== boardId });
    void queryClient.invalidateQueries({ queryKey: ["item-links"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.myWork(ws.workspace.id, user.id) });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    publishDataChange({ boardIds: [boardId], kinds: ["board", "items"] });
  }, [queryClient, key, boardId, ws.workspace.id, user.id]);

  /**
   * Applies `updater` optimistically and runs `action`.
   *
   * `reconcile` runs the moment the action resolves, before the refetch. Creators
   * use it to swap their placeholder row for the stored one: against a remote
   * database the refetch is a round-trip away, and until it lands anything acting
   * on the new row (delete it, rename it) would send an id the server never saw.
   */
  const run = useCallback(
    async <T,>(
      updater: Updater | null,
      action: () => Promise<T>,
      errorMessage: string,
      reconcile?: (snapshot: BoardSnapshot, result: T) => BoardSnapshot,
    ): Promise<T | undefined> => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardSnapshot>(key);
      if (updater && previous) queryClient.setQueryData<BoardSnapshot>(key, updater(previous));
      pending.current += 1;
      try {
        const result = await action();
        if (reconcile) {
          const current = queryClient.getQueryData<BoardSnapshot>(key);
          if (current) queryClient.setQueryData<BoardSnapshot>(key, reconcile(current, result));
        }
        return result;
      } catch (error) {
        console.error(`[board] ${errorMessage}`, error);
        if (previous) queryClient.setQueryData(key, previous);
        toast.error(errorMessage, { description: error instanceof Error ? error.message : undefined });
        return undefined;
      } finally {
        pending.current -= 1;
        if (pending.current === 0) void invalidateRelated();
      }
    },
    [queryClient, key, invalidateRelated],
  );

  const patchItem = (snapshot: BoardSnapshot, itemId: string, patch: Partial<Item>): BoardSnapshot => ({
    ...snapshot,
    items: snapshot.items.map((i) => (i.id === itemId ? { ...i, ...patch, updatedAt: nowIso() } : i)),
  });

  const upsertValue = (snapshot: BoardSnapshot, itemId: string, columnId: string, value: ColumnValue): BoardSnapshot => {
    const existing = snapshot.values.find((v) => v.itemId === itemId && v.columnId === columnId);
    const record: ItemColumnValue = existing
      ? { ...existing, value, updatedAt: nowIso() }
      : { id: newId(), itemId, columnId, value, updatedAt: nowIso() };
    return {
      ...snapshot,
      values: existing ? snapshot.values.map((v) => (v.id === existing.id ? record : v)) : [...snapshot.values, record],
    };
  };

  // ---- Items ---------------------------------------------------------------

  const setValue = useCallback(
    (item: Item, column: BoardColumn, value: ColumnValue) =>
      run(
        (s) => upsertValue(s, item.id, column.id, value),
        () => services.items.setValue(item.id, column.id, value, { column, item, board: ws.boardById(boardId)!, users: ws.users }, user.id),
        "Could not save the change",
      ),
    [run, services, ws, boardId, user.id],
  );

  const renameItem = useCallback(
    (itemId: string, name: string) =>
      run(
        (s) => patchItem(s, itemId, { name }),
        () => services.items.renameItem(itemId, name, user.id),
        "Could not rename the item",
      ),
    [run, services, user.id],
  );

  const updateDescription = useCallback(
    (itemId: string, description: string | null) =>
      run(
        (s) => patchItem(s, itemId, { description }),
        () => services.items.updateDescription(itemId, description, user.id),
        "Could not save the description",
      ),
    [run, services, user.id],
  );

  const createItem = useCallback(
    (input: Omit<CreateItemInput, "boardId">) => {
      const tempId = newId();
      return run(
        (s) => {
          const siblings = s.items.filter((i) => i.groupId === input.groupId && (i.parentItemId ?? null) === (input.parentItemId ?? null));
          const after = input.afterItemId ? siblings.find((i) => i.id === input.afterItemId) : undefined;
          const position = after ? after.position + 0.5 : siblings.length;
          const temp: Item = {
            id: tempId,
            boardId,
            groupId: input.groupId,
            parentItemId: input.parentItemId ?? null,
            name: input.name.trim(),
            description: null,
            position,
            createdBy: user.id,
            archivedAt: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
          let next: BoardSnapshot = { ...s, items: [...s.items, temp] };
          for (const v of input.values ?? []) next = upsertValue(next, tempId, v.columnId, v.value);
          const status = s.columns.find((c) => c.type === "STATUS");
          if (status?.settings.kind === "status" && status.settings.defaultLabelId && !input.values?.some((v) => v.columnId === status.id)) {
            next = upsertValue(next, tempId, status.id, { type: "STATUS", labelId: status.settings.defaultLabelId });
          }
          return next;
        },
        // The id travels with the request, so the row the user is looking at keeps
        // the identity it was rendered with — no remount, no stale id in a menu.
        () => services.items.createItem({ ...input, boardId, id: tempId }, user.id),
        "Could not create the item",
        (s, item) => ({
          ...s,
          items: s.items.map((i) => (i.id === tempId ? item : i)),
          values: s.values.map((v) => (v.itemId === tempId ? { ...v, itemId: item.id } : v)),
        }),
      );
    },
    [run, services, boardId, user.id],
  );

  const moveItem = useCallback(
    (input: Omit<MoveItemInput, "boardId">) =>
      run(
        (s) => {
          const targetOrder = new Map(input.orderedIdsInTargetGroup.map((id, i) => [id, i]));
          const sourceOrder = new Map((input.orderedIdsInSourceGroup ?? []).map((id, i) => [id, i]));
          const moved = s.items.find((i) => i.id === input.itemId);
          return {
            ...s,
            items: s.items.map((i) => {
              if (targetOrder.has(i.id)) return { ...i, groupId: input.toGroupId, position: targetOrder.get(i.id)! };
              if (sourceOrder.has(i.id)) return { ...i, position: sourceOrder.get(i.id)! };
              if (moved && i.parentItemId === moved.id) return { ...i, groupId: input.toGroupId };
              return i;
            }),
          };
        },
        () => services.items.moveItem({ ...input, boardId }, user.id),
        "Could not move the item",
      ),
    [run, services, boardId, user.id],
  );

  const moveItemsToGroup = useCallback(
    (itemIds: string[], toGroupId: string) =>
      run(
        (s) => {
          const ids = new Set(itemIds);
          let next = s.items.filter((i) => i.groupId === toGroupId && !i.parentItemId).reduce((m, i) => Math.max(m, i.position), -1) + 1;
          return {
            ...s,
            items: s.items.map((i) => {
              if (ids.has(i.id)) return { ...i, groupId: toGroupId, position: next++ };
              if (i.parentItemId && ids.has(i.parentItemId)) return { ...i, groupId: toGroupId };
              return i;
            }),
          };
        },
        async () => {
          await services.items.moveItemsToGroup(boardId, itemIds, toGroupId, user.id);
          toast.success(itemIds.length === 1 ? "Item moved" : `${itemIds.length} items moved`);
        },
        "Could not move items",
      ),
    [run, services, boardId, user.id],
  );

  const archiveItems = useCallback(
    (itemIds: string[]) =>
      run(
        (s) => {
          const ids = new Set(itemIds);
          return { ...s, items: s.items.filter((i) => !ids.has(i.id) && !(i.parentItemId && ids.has(i.parentItemId))) };
        },
        async () => {
          await services.items.archiveItems(boardId, itemIds, user.id);
          toast.success(itemIds.length === 1 ? "Item archived" : `${itemIds.length} items archived`);
        },
        "Could not archive items",
      ),
    [run, services, boardId, user.id],
  );

  const deleteItems = useCallback(
    (itemIds: string[]) =>
      run(
        (s) => {
          const ids = new Set(itemIds);
          return { ...s, items: s.items.filter((i) => !ids.has(i.id) && !(i.parentItemId && ids.has(i.parentItemId))) };
        },
        async () => {
          await services.items.deleteItems(boardId, itemIds, user.id);
          toast.success(itemIds.length === 1 ? "Item deleted" : `${itemIds.length} items deleted`);
        },
        "Could not delete items",
      ),
    [run, services, boardId, user.id],
  );

  const duplicateItem = useCallback(
    (itemId: string) =>
      run(
        null,
        async () => {
          const copy = await services.items.duplicateItem(itemId, user.id);
          toast.success("Item duplicated");
          return copy;
        },
        "Could not duplicate the item",
      ),
    [run, services, user.id],
  );

  const reorderSubitems = useCallback(
    (orderedIds: string[]) =>
      run(
        (s) => {
          const order = new Map(orderedIds.map((id, i) => [id, i]));
          return { ...s, items: s.items.map((i) => (order.has(i.id) ? { ...i, position: order.get(i.id)! } : i)) };
        },
        () => services.items.reorderSubitems(orderedIds),
        "Could not reorder subitems",
      ),
    [run, services],
  );

  // ---- Groups --------------------------------------------------------------

  const createGroup = useCallback(
    (name: string, position?: number) => {
      const tempId = newId();
      return run(
        (s) => {
          const temp: BoardGroup = {
            id: tempId,
            boardId,
            name: name.trim() || "New group",
            color: "blue",
            position: position ?? s.groups.length,
            collapsed: false,
            createdAt: nowIso(),
          };
          const groups = [...s.groups];
          if (position !== undefined) {
            groups.forEach((g) => {
              if (g.position >= position) g.position += 1;
            });
          }
          return { ...s, groups: [...groups, temp] };
        },
        () => services.boards.createGroup(boardId, name, user.id, position, tempId),
        "Could not create the group",
        (s, group) => ({ ...s, groups: s.groups.map((g) => (g.id === tempId ? group : g)) }),
      );
    },
    [run, services, boardId, user.id],
  );

  const updateGroup = useCallback(
    (groupId: string, patch: Partial<Pick<BoardGroup, "name" | "color" | "collapsed">>) =>
      run(
        (s) => ({ ...s, groups: s.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) }),
        () => services.boards.updateGroup(groupId, patch, user.id),
        "Could not update the group",
      ),
    [run, services, user.id],
  );

  const reorderGroups = useCallback(
    (orderedIds: string[]) =>
      run(
        (s) => {
          const order = new Map(orderedIds.map((id, i) => [id, i]));
          return { ...s, groups: s.groups.map((g) => ({ ...g, position: order.get(g.id) ?? g.position })) };
        },
        () => services.boards.reorderGroups(boardId, orderedIds),
        "Could not reorder groups",
      ),
    [run, services, boardId],
  );

  const duplicateGroup = useCallback(
    (groupId: string) =>
      run(
        null,
        async () => {
          await services.boards.duplicateGroup(groupId, user.id);
          toast.success("Group duplicated");
        },
        "Could not duplicate the group",
      ),
    [run, services, user.id],
  );

  const deleteGroup = useCallback(
    (groupId: string) =>
      run(
        (s) => ({ ...s, groups: s.groups.filter((g) => g.id !== groupId), items: s.items.filter((i) => i.groupId !== groupId) }),
        async () => {
          await services.boards.deleteGroup(groupId, user.id);
          toast.success("Group deleted");
        },
        "Could not delete the group",
      ),
    [run, services, user.id],
  );

  // ---- Columns -------------------------------------------------------------

  /**
   * Adds a column at the end, or directly after `afterColumnId` when the request
   * came from a column's own menu.
   */
  const addColumn = useCallback(
    (name: string, type: ColumnType, options?: { afterColumnId?: string }) => {
      const afterId = options?.afterColumnId;
      const optimisticId = newId();
      return run(
        (s) => {
          const draft: BoardColumn = {
            id: optimisticId,
            boardId,
            name,
            type,
            settings: defaultSettingsFor(type),
            position: s.columns.length,
            width: DEFAULT_COLUMN_WIDTHS[type],
            hidden: false,
            createdAt: nowIso(),
          };
          const ordered = [...s.columns].sort((a, b) => a.position - b.position);
          const at = afterId ? ordered.findIndex((c) => c.id === afterId) : -1;
          if (at === -1) ordered.push(draft);
          else ordered.splice(at + 1, 0, draft);
          return { ...s, columns: ordered.map((c, i) => ({ ...c, position: i })) };
        },
        async () => {
          const created = await services.boards.addColumn({ boardId, name, type, id: optimisticId });
          if (!afterId) return created;
          const previous = queryClient.getQueryData<BoardSnapshot>(key);
          const ordered = [...(previous?.columns ?? [])].sort((a, b) => a.position - b.position).map((c) => c.id);
          const withoutNew = ordered.filter((id) => id !== created.id && id !== optimisticId);
          const at = withoutNew.indexOf(afterId);
          if (at === -1) return created;
          withoutNew.splice(at + 1, 0, created.id);
          await services.boards.reorderColumns(boardId, withoutNew);
          return created;
        },
        "Could not add the column",
        (s, column) => ({ ...s, columns: s.columns.map((c) => (c.id === optimisticId ? column : c)) }),
      );
    },
    [run, services, boardId, queryClient, key],
  );

  const updateColumn = useCallback(
    (columnId: string, patch: Partial<Pick<BoardColumn, "name" | "width" | "hidden">> & { settings?: ColumnSettings }) =>
      run(
        (s) => ({ ...s, columns: s.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c)) }),
        () => services.boards.updateColumn(columnId, patch),
        "Could not update the column",
      ),
    [run, services],
  );

  /**
   * Saves a TAGS column's palette. Values store tag names, so a rename or a
   * removal has to be applied to every item that used the old tag.
   */
  const updateColumnTags = useCallback(
    async (columnId: string, options: TagOption[], renames: Record<string, string>) => {
      const snapshot = queryClient.getQueryData<BoardSnapshot>(key);
      const column = snapshot?.columns.find((c) => c.id === columnId);
      const kept = new Set(options.map((o) => o.name));
      const remap = (tags: string[]) => {
        const next: string[] = [];
        for (const tag of tags) {
          const renamed = renames[tag] ?? tag;
          if (!kept.has(renamed) || next.includes(renamed)) continue;
          next.push(renamed);
        }
        return next;
      };
      const affected = (snapshot?.values ?? []).filter((entry) => {
        if (entry.columnId !== columnId || entry.value.type !== "TAGS") return false;
        const tags = entry.value.tags;
        const next = remap(tags);
        return next.length !== tags.length || next.some((t, i) => t !== tags[i]);
      });

      await run(
        (s) => ({
          ...s,
          columns: s.columns.map((c) => (c.id === columnId ? { ...c, settings: { kind: "tags", options } } : c)),
          values: s.values.map((entry) =>
            entry.columnId === columnId && entry.value.type === "TAGS" ? { ...entry, value: { type: "TAGS", tags: remap(entry.value.tags) } } : entry,
          ),
        }),
        async () => {
          await services.boards.updateColumn(columnId, { settings: { kind: "tags", options } });
          if (!column) return;
          const board = ws.boardById(boardId);
          for (const entry of affected) {
            if (entry.value.type !== "TAGS") continue;
            const item = snapshot?.items.find((i) => i.id === entry.itemId);
            if (!item || !board) continue;
            await services.items.setValue(
              entry.itemId,
              columnId,
              { type: "TAGS", tags: remap(entry.value.tags) },
              { column, item, board, users: ws.users },
              user.id,
            );
          }
        },
        "Could not save the tags",
      );
    },
    [run, services, queryClient, key, boardId, ws, user.id],
  );

  const reorderColumns = useCallback(
    (orderedIds: string[]) =>
      run(
        (s) => {
          const order = new Map(orderedIds.map((id, i) => [id, i]));
          return { ...s, columns: s.columns.map((c) => ({ ...c, position: order.get(c.id) ?? c.position })) };
        },
        () => services.boards.reorderColumns(boardId, orderedIds),
        "Could not reorder columns",
      ),
    [run, services, boardId],
  );

  const deleteColumn = useCallback(
    (columnId: string) =>
      run(
        (s) => ({ ...s, columns: s.columns.filter((c) => c.id !== columnId), values: s.values.filter((v) => v.columnId !== columnId) }),
        async () => {
          await services.boards.deleteColumn(columnId);
          toast.success("Column deleted");
        },
        "Could not delete the column",
      ),
    [run, services],
  );

  return useMemo(
    () => ({
      setValue,
      renameItem,
      updateDescription,
      createItem,
      moveItem,
      moveItemsToGroup,
      archiveItems,
      deleteItems,
      duplicateItem,
      reorderSubitems,
      createGroup,
      updateGroup,
      reorderGroups,
      duplicateGroup,
      deleteGroup,
      addColumn,
      updateColumn,
      updateColumnTags,
      reorderColumns,
      deleteColumn,
    }),
    [
      setValue,
      renameItem,
      updateDescription,
      createItem,
      moveItem,
      moveItemsToGroup,
      archiveItems,
      deleteItems,
      duplicateItem,
      reorderSubitems,
      createGroup,
      updateGroup,
      reorderGroups,
      duplicateGroup,
      deleteGroup,
      addColumn,
      updateColumn,
      updateColumnTags,
      reorderColumns,
      deleteColumn,
    ],
  );
}

export type BoardMutations = ReturnType<typeof useBoardMutations>;
