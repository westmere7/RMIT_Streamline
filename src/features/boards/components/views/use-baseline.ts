"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { ItemBaseline, ItemBaselineInput } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { toISODate } from "@/lib/dates/dates";
import { scheduleOf } from "./date-scale";

export interface BoardBaseline {
  /** Each task's planned dates, by task id. Empty when the board has no baseline. */
  byItem: Map<string, ItemBaseline>;
  /** When it was saved, or null when there is none. */
  savedAt: string | null;
  saving: boolean;
  /** Takes every dated task's dates as they stand now as the plan, replacing the last one. */
  save: () => Promise<void>;
  clear: () => Promise<void>;
}

const NONE = new Map<string, ItemBaseline>();

/**
 * The board's baseline: what was planned when somebody last said "this is the
 * plan", for the Gantt to draw under the bars and count the slips against.
 */
export function useBaseline(): BoardBaseline {
  const { board, model } = useBoardContext();
  const services = useServices();
  const queryClient = useQueryClient();
  const key = React.useMemo(() => ["baseline", board.id], [board.id]);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => new Map((await services.repos.baselines.listByBoard(board.id)).map((row) => [row.itemId, row])),
    staleTime: 5 * 60_000,
  });
  const [saving, setSaving] = React.useState(false);
  const byItem = query.data ?? NONE;
  const savedAt = React.useMemo(() => [...byItem.values()].reduce<string | null>((latest, row) => (!latest || row.savedAt > latest ? row.savedAt : latest), null), [byItem]);

  const write = React.useCallback(
    async (action: () => Promise<void>, done: string, failed: string) => {
      setSaving(true);
      try {
        await action();
        await queryClient.invalidateQueries({ queryKey: key });
        toast.success(done);
      } catch (error) {
        toast.error(failed, { description: error instanceof Error ? error.message : undefined });
      } finally {
        setSaving(false);
      }
    },
    [queryClient, key],
  );

  const save = React.useCallback(() => {
    // Subitems too: a parent's dates can hold while the work under it slips.
    const rows: ItemBaselineInput[] = [];
    for (const item of model.itemById.values()) {
      const schedule = scheduleOf(model, item);
      if (schedule) rows.push({ itemId: item.id, start: schedule.milestone ? null : toISODate(schedule.start), end: toISODate(schedule.end) });
    }
    return write(() => services.repos.baselines.saveForBoard(board.id, rows), `Baseline saved for ${rows.length} ${rows.length === 1 ? "task" : "tasks"}`, "Could not save the baseline");
  }, [model, services, board.id, write]);

  const clear = React.useCallback(() => write(() => services.repos.baselines.clearForBoard(board.id), "Baseline cleared", "Could not clear the baseline"), [services, board.id, write]);

  return { byItem, savedAt, saving, save, clear };
}
