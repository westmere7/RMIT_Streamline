"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import { buttonActionIncomplete, buttonSettings, columnLabels, statusRoleIds, type BoardColumn, type ButtonAction, type ButtonDueOffset, type Item } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { shiftISODate, todayISO } from "@/lib/dates/dates";
import { nowIso } from "@/lib/ids";
import { useBoardUiStore } from "@/stores/board-ui-store";

const DUE_DAYS: Record<Exclude<ButtonDueOffset, "clear">, number> = { today: 0, tomorrow: 1, in3days: 3, nextWeek: 7 };

/**
 * What a Button column's press does, step by step, as the person pressing it.
 *
 * Every step goes through what that person could do by hand (the board's own
 * mutations, the assets and updates services), so it is undone, synced to
 * linked tasks, logged and checked against their rights in the same way. A
 * step that cannot apply on this board (a status label that is not there, a
 * board with no PIC column) is skipped and named, rather than failing the rest.
 */
export function useButtonPress() {
  const { board, model, mutations, canEdit } = useBoardContext();
  const services = useServices();
  const ws = useWorkspace();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const setArchiveRequest = useBoardUiStore((s) => s.setArchiveRequest);
  const [running, setRunning] = React.useState<string | null>(null);

  async function runStep(action: ButtonAction, item: Item): Promise<{ ok: boolean; text: string } | null> {
    switch (action.kind) {
      case "set_status": {
        const column = model.statusColumn;
        if (!column || column.settings.kind !== "status") return { ok: false, text: "no status column" };
        const labelId = action.labelId ?? statusRoleIds(column.settings, "done")[0] ?? null;
        const label = columnLabels(column).find((l) => l.id === labelId);
        if (!label) return { ok: false, text: "status label not on this board" };
        await mutations.setValue(item, column, { type: "STATUS", labelId: label.id });
        return { ok: true, text: `status ${label.name}` };
      }
      case "set_priority": {
        const column = model.priorityColumn;
        if (!column) return { ok: false, text: "no priority column" };
        const label = columnLabels(column).find((l) => l.id === action.labelId);
        await mutations.setValue(item, column, { type: "PRIORITY", labelId: label?.id ?? null });
        return { ok: true, text: label ? `priority ${label.name}` : "priority cleared" };
      }
      case "assign_me":
      case "unassign_me": {
        const column = model.personColumns[0];
        if (!column) return { ok: false, text: "no PIC column" };
        const current = model.getValue(item.id, column.id);
        const ids = current?.type === "PERSON" ? current.userIds : [];
        const on = ids.includes(user.id);
        if (action.kind === "assign_me" ? on : !on) return { ok: true, text: action.kind === "assign_me" ? "already on it" : "not on it" };
        const next = action.kind === "assign_me" ? [...ids, user.id] : ids.filter((id) => id !== user.id);
        await mutations.setValue(item, column, { type: "PERSON", userIds: next });
        return { ok: true, text: action.kind === "assign_me" ? "you're on it" : "you're off it" };
      }
      case "set_due": {
        const column = model.dateColumn;
        if (!column) return { ok: false, text: "no due date column" };
        const date = action.offset === "clear" ? null : shiftISODate(todayISO(), DUE_DAYS[action.offset]);
        await mutations.setValue(item, column, { type: "DATE", date });
        return { ok: true, text: date ? `due ${date}` : "due date cleared" };
      }
      case "move_to_group": {
        const group = model.groups.find((g) => g.id === action.groupId);
        if (!group) return { ok: false, text: "group not on this board" };
        if (item.groupId === group.id) return { ok: true, text: `already in ${group.name}` };
        await mutations.moveItemsToGroup([item.id], group.id);
        return { ok: true, text: `moved to ${group.name}` };
      }
      case "complete_assets": {
        const lines = await services.repos.itemAssets.listByItems([item.id]);
        const open = lines.filter((line) => !line.completedAt);
        if (lines.length === 0) return { ok: true, text: "no assets to tick" };
        const at = nowIso();
        for (const line of open) await services.assets.update(line.id, { completedAt: at }, user.id);
        void queryClient.invalidateQueries({ queryKey: queryKeys.itemAssets(item.id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.boardAssets(board.id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(board.id) });
        return { ok: true, text: open.length ? `${open.length} asset${open.length === 1 ? "" : "s"} ticked` : "assets already done" };
      }
      case "post_update": {
        await services.comments.addComment(item.id, action.text.trim(), user.id, ws.users, {});
        void queryClient.invalidateQueries({ queryKey: queryKeys.comments(item.id) });
        return { ok: true, text: "update posted" };
      }
      case "open_link": {
        window.open(action.url.trim(), "_blank", "noopener,noreferrer");
        return { ok: true, text: "link opened" };
      }
      case "duplicate": {
        await mutations.duplicateItem(item.id);
        return null;
      }
      case "archive": {
        // The board's own archive question, which asks about linked copies too.
        setArchiveRequest([item.id]);
        return null;
      }
    }
  }

  const press = React.useCallback(
    async (item: Item, column: BoardColumn) => {
      if (!canEdit) return;
      const settings = buttonSettings(column.settings);
      const done: string[] = [];
      const skipped: string[] = [];
      setRunning(item.id);
      try {
        for (const action of settings.actions) {
          if (buttonActionIncomplete(action)) continue;
          const result = await runStep(action, item);
          if (result === null) continue;
          (result.ok ? done : skipped).push(result.text);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The button could not finish");
      } finally {
        setRunning(null);
      }
      if (skipped.length > 0) toast.message(`${settings.label}: ${done.length ? `${done.join(", ")}. ` : ""}Skipped: ${skipped.join(", ")}.`);
      else if (done.length > 0) toast.success(`${settings.label}: ${done.join(", ")}`);
    },
    // runStep reads the same context; listed by what it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, model, mutations, services, ws.users, user.id, board.id],
  );

  return { press, running };
}
