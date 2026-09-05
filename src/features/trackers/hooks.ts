"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { Tracker, TrackerSheet } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { beginUnsavedWork } from "@/lib/unsaved-work";
import type { CreateTrackerInput } from "@/services";

export function useTrackers() {
  const services = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: queryKeys.trackers(ws.workspace.id),
    queryFn: () => services.trackers.list(ws.workspace.id),
    staleTime: 10_000,
  });
}

export function useTracker(trackerId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.tracker(trackerId ?? ""),
    queryFn: () => services.trackers.get(trackerId!),
    enabled: !!trackerId,
    staleTime: 10_000,
  });
}

export function useTrackerSheets(trackerId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.trackerSheets(trackerId ?? ""),
    queryFn: () => services.trackers.listSheets(trackerId!),
    enabled: !!trackerId,
    staleTime: 10_000,
  });
}

export function useTrackerMutations() {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const ws = useWorkspace();

  const settle = async () => {
    await queryClient.invalidateQueries({ queryKey: ["trackers"] });
    void queryClient.invalidateQueries({ queryKey: ["tracker"] });
    void queryClient.invalidateQueries({ queryKey: ["tracker-sheets"] });
    publishDataChange({ kinds: ["trackers"] });
  };
  const fail = (title: string) => (error: unknown) => toast.error(title, { description: error instanceof Error ? error.message : undefined });

  const create = useMutation({
    mutationFn: (input: Omit<CreateTrackerInput, "workspaceId">) => services.trackers.create({ ...input, workspaceId: ws.workspace.id }, user.id),
    onError: fail("Could not create the tracker"),
    onSettled: settle,
  });
  const update = useMutation({
    mutationFn: ({ trackerId, patch }: { trackerId: string; patch: Partial<Pick<Tracker, "name" | "description" | "teamId">> }) => services.trackers.update(trackerId, patch),
    onError: fail("Could not update the tracker"),
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (trackerId: string) => services.trackers.delete(trackerId),
    onSuccess: () => toast.success("Tracker deleted"),
    onError: fail("Could not delete the tracker"),
    onSettled: settle,
  });
  const addSheet = useMutation({
    mutationFn: ({ trackerId, name, layout, copyOf }: { trackerId: string; name: string; layout: "campaign" | "blank" | "copy"; copyOf?: string }) =>
      services.trackers.addSheet(trackerId, name, layout, copyOf),
    onError: fail("Could not add the sheet"),
    onSettled: settle,
  });
  const renameSheet = useMutation({
    mutationFn: ({ sheetId, name }: { sheetId: string; name: string }) => services.trackers.renameSheet(sheetId, name),
    onError: fail("Could not rename the sheet"),
    onSettled: settle,
  });
  const deleteSheet = useMutation({
    mutationFn: (sheetId: string) => services.trackers.deleteSheet(sheetId),
    onError: fail("Could not delete the sheet"),
    onSettled: settle,
  });
  const reorderSheets = useMutation({
    mutationFn: ({ trackerId, orderedIds }: { trackerId: string; orderedIds: string[] }) => services.trackers.reorderSheets(trackerId, orderedIds),
    onError: fail("Could not reorder sheets"),
    onSettled: settle,
  });
  const importSheets = useMutation({
    mutationFn: async ({ trackerId, file }: { trackerId: string; file: File }) => {
      const { workbookToSheets } = await import("@/services/tracker-xlsx");
      const parsed = await workbookToSheets(await file.arrayBuffer());
      if (parsed.sheets.length === 0) throw new Error("No tables were found in that workbook.");
      const created: TrackerSheet[] = [];
      for (const draft of parsed.sheets) created.push(await services.repos.trackers.createSheet({ ...draft, trackerId }));
      return { created, skipped: parsed.skipped };
    },
    onSuccess: ({ created, skipped }) =>
      toast.success(`Imported ${created.length} sheet${created.length === 1 ? "" : "s"}`, { description: skipped.length ? `Skipped (no table found): ${skipped.join(", ")}` : undefined }),
    onError: fail("Could not import the workbook"),
    onSettled: settle,
  });

  return { create, update, remove, addSheet, renameSheet, deleteSheet, reorderSheets, importSheets };
}

/** Downloads the tracker as .xlsx. */
export async function exportTrackerToFile(tracker: Tracker, sheets: TrackerSheet[]): Promise<void> {
  const { sheetsToWorkbook } = await import("@/services/tracker-xlsx");
  const bytes = await sheetsToWorkbook(tracker.name, sheets);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${tracker.name.replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Local editing state for one sheet: edits apply instantly, history supports
 * undo/redo, and the document is saved shortly after typing stops. Remote
 * updates (other tabs) replace the local copy only while nothing is pending.
 * Mount the caller with `key={sheet.id}` (see SheetEditorProvider): the hook
 * assumes it lives for exactly one sheet.
 */
export function useSheetEditor(sheet: TrackerSheet | undefined, canEdit: boolean) {
  const services = useServices();
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<TrackerSheet | undefined>(sheet);
  const [seenVersion, setSeenVersion] = React.useState(sheet?.updatedAt);
  // Undo history and the dirty flag are bookkeeping, not render inputs: one stable
  // mutable object (never replaced) keeps them out of React's render cycle.
  const [store] = React.useState<{ past: TrackerSheet[]; future: TrackerSheet[]; dirty: boolean }>(() => ({ past: [], future: [], dirty: false }));
  const timer = React.useRef<number | null>(null);
  const pendingSave = React.useRef<(() => void) | null>(null);
  const [saving, setSaving] = React.useState<"idle" | "pending" | "saving" | "error">("idle");

  // A newer server copy (another tab saved) replaces the local one while nothing
  // local is pending — derived state, resolved during render.
  if (sheet && seenVersion !== sheet.updatedAt) {
    setSeenVersion(sheet.updatedAt);
    if (!store.dirty) setDraft(sheet);
  }

  const persist = React.useCallback(
    (next: TrackerSheet) => {
      if (timer.current) window.clearTimeout(timer.current);
      setSaving("pending");
      // The sheet waits for typing to stop before it saves, so an edit is only
      // in memory for up to a second: hold the unload guard for that whole time.
      const settled = pendingSave.current ?? beginUnsavedWork();
      pendingSave.current = settled;
      timer.current = window.setTimeout(async () => {
        setSaving("saving");
        try {
          const saved = await services.trackers.saveSheet(next.id, { columns: next.columns, rows: next.rows, frozenColumns: next.frozenColumns });
          store.dirty = false;
          queryClient.setQueryData<TrackerSheet[]>(queryKeys.trackerSheets(next.trackerId), (old) => old?.map((s) => (s.id === saved.id ? saved : s)));
          publishDataChange({ kinds: ["trackers"] });
          setSaving("idle");
        } catch (error) {
          setSaving("error");
          toast.error("Could not save the sheet", { description: error instanceof Error ? error.message : undefined });
        } finally {
          pendingSave.current = null;
          settled();
        }
      }, 600);
    },
    [services, queryClient, store],
  );

  const commit = React.useCallback(
    (updater: (current: TrackerSheet) => TrackerSheet) => {
      if (!canEdit) return;
      setDraft((current) => {
        if (!current) return current;
        const next = updater(current);
        if (next === current) return current;
        store.past = [...store.past.slice(-49), current];
        store.future = [];
        store.dirty = true;
        persist(next);
        return next;
      });
    },
    [canEdit, persist, store],
  );

  const undo = React.useCallback(() => {
    setDraft((current) => {
      const previous = store.past.pop();
      if (!current || !previous) return current;
      store.future.push(current);
      store.dirty = true;
      persist(previous);
      return previous;
    });
  }, [persist, store]);

  const redo = React.useCallback(() => {
    setDraft((current) => {
      const next = store.future.pop();
      if (!current || !next) return current;
      store.past.push(current);
      store.dirty = true;
      persist(next);
      return next;
    });
  }, [persist, store]);

  // Flush a pending save if the user navigates away mid-debounce.
  React.useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return { sheet: draft, commit, undo, redo, saving };
}
