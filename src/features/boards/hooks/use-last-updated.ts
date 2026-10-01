"use client";

import { useQueries } from "@tanstack/react-query";
import * as React from "react";
import { lastUpdatedEvents, lastUpdatedSettings, type BoardColumn, type Item, type ItemColumnValue } from "@/domain";
import { useServices } from "@/features/data/data-context";

/**
 * The board's Last updated cells, worked out from its activity: for each such
 * column, each task's newest change of the kinds the column counts.
 *
 * Asked again whenever the board itself changes (`version`), since anything
 * done to a task is also a new board snapshot, and only one small row a task
 * comes back. A task nothing counted has happened to falls back on its own
 * creation, when the column counts creating it; otherwise the cell is empty.
 *
 * The answers come back as ordinary cell values, so the table, the panel,
 * sorting and filters read them like any other column.
 */
export function useLastUpdatedValues(boardId: string, columns: readonly BoardColumn[], items: readonly Item[], version: number): ItemColumnValue[] {
  const services = useServices();
  const wanted = React.useMemo(
    () =>
      columns
        .filter((c) => c.type === "LAST_UPDATED" && !c.removed)
        .map((column) => {
          const settings = lastUpdatedSettings(column.settings);
          return { column, settings, events: lastUpdatedEvents(settings) };
        }),
    [columns],
  );
  const results = useQueries({
    queries: wanted.map(({ events, settings }) => ({
      queryKey: ["last-updated", boardId, events.join(","), settings.skipSynced, version],
      queryFn: () => services.repos.activities.listLastByBoard(boardId, events, settings.skipSynced),
      staleTime: 30_000,
      placeholderData: (previous: unknown) => previous,
    })),
  });

  const data = results.map((r) => r.data);
  // Changes when any answer does, without a dependency list that grows and shrinks with the columns.
  const stamp = results.map((r) => r.dataUpdatedAt).join(",");
  return React.useMemo(() => {
    const out: ItemColumnValue[] = [];
    wanted.forEach(({ column, settings }, index) => {
      const rows = data[index] as Awaited<ReturnType<typeof services.repos.activities.listLastByBoard>> | undefined;
      const byItem = new Map((rows ?? []).map((row) => [row.itemId, row]));
      const created = settings.sources.includes("created");
      for (const item of items) {
        const row = byItem.get(item.id);
        let userId: string | null = row?.actorId ?? null;
        let at: string | null = row?.at ?? null;
        // Older tasks have no creation in the log; their own record says it.
        if (created && (!at || item.createdAt > at)) {
          userId = item.createdBy;
          at = item.createdAt;
        }
        if (!at) continue;
        out.push({ id: `last-updated:${column.id}:${item.id}`, itemId: item.id, columnId: column.id, value: { type: "LAST_UPDATED", userId, at }, updatedAt: at });
      }
    });
    return out;
    // `data` is a fresh array each render; `stamp` says when its members change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, items, stamp]);
}
