"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import type { Tracker, TrackerSheet } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useTrackerMutations } from "./hooks";

/**
 * Whether the assets a sheet gives its task stay on the task when the sheet
 * goes. On unless switched off: losing a task's deliverables is the mistake
 * worth guarding against. Only shown when there is a task to keep them on.
 */
export function KeepAssetsSwitch({ taskNames, keep, onKeep }: { taskNames: string[]; keep: boolean; onKeep: (keep: boolean) => void }) {
  if (taskNames.length === 0) return null;
  const tasks = taskNames.length === 1 ? `“${taskNames[0]}”` : `${taskNames.length} tasks`;
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 px-3 py-2 text-[13px]" data-testid="keep-assets">
      <span className="min-w-0">
        <span className="font-medium">Keep the assets on {tasks}</span>
        <span className="block text-2xs text-muted-foreground">{keep ? "They stay as the task's own assets." : "They are removed from the task too."}</span>
      </span>
      <Switch checked={keep} onCheckedChange={onKeep} aria-label={`Keep the assets on ${tasks}`} data-testid="keep-assets-switch" />
    </label>
  );
}

/** The names of the tasks these sheets hold the assets of. */
export function useLinkedTaskNames(sheets: readonly Pick<TrackerSheet, "itemId">[] | undefined): string[] {
  const services = useServices();
  const ids = (sheets ?? []).map((s) => s.itemId).filter((id): id is string => !!id);
  const items = useQuery({
    queryKey: ["linked-task-names", ...ids],
    queryFn: async () => Promise.all(ids.map(async (id) => (await services.items.getItem(id).catch(() => null))?.name ?? "a task")),
    enabled: ids.length > 0,
    staleTime: 10_000,
  });
  return ids.length === 0 ? [] : (items.data ?? ids.map(() => "a task"));
}

/** Deleting a tracker, asking first what becomes of the assets its sheets give their tasks. */
export function DeleteTrackerDialog({ tracker, onOpenChange, onDeleted }: { tracker: Pick<Tracker, "id" | "name"> | null; onOpenChange: (open: boolean) => void; onDeleted?: () => void }) {
  const services = useServices();
  const mutations = useTrackerMutations();
  const sheets = useQuery({ queryKey: ["tracker-delete-sheets", tracker?.id], queryFn: () => services.trackers.listSheets(tracker!.id), enabled: !!tracker });
  const taskNames = useLinkedTaskNames(sheets.data);
  const [keep, setKeep] = React.useState(true);
  return (
    <ConfirmDialog
      open={tracker !== null}
      onOpenChange={(open) => {
        if (!open) setKeep(true);
        onOpenChange(open);
      }}
      title={`Delete “${tracker?.name ?? ""}”?`}
      description="This permanently deletes the tracker and every sheet in it. Export it first if you want a copy."
      confirmLabel="Delete tracker"
      destructive
      confirmDisabled={sheets.isLoading}
      onConfirm={async () => {
        if (!tracker) return;
        await mutations.remove.mutateAsync({ trackerId: tracker.id, keepAssets: keep });
        setKeep(true);
        onDeleted?.();
      }}
    >
      <KeepAssetsSwitch taskNames={taskNames} keep={keep} onKeep={setKeep} />
    </ConfirmDialog>
  );
}
