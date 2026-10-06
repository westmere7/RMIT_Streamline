"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { Tracker, TrackerAssetMapping, TrackerSheet } from "@/domain";
import { mergeSheets } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";
import { onServerRecovered } from "@/lib/server-status";
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

/**
 * Keeps an open tracker in step with whoever else has it open.
 *
 * The sheets of one tracker only: a sheet saves as the typing stops, so an
 * unfiltered subscription would put every tracker in the workspace on the wire
 * every time anyone touched any of them. The list in the sidebar rides on the
 * workspace channel instead, which hears about the trackers themselves.
 *
 * A remote sheet only replaces what is on screen while nothing local is
 * pending — `useSheetEditor` holds the draft until its own save lands — so this
 * cannot take an edit out from under someone mid-keystroke.
 */
export function useTrackerRealtime(trackerId: string | null): void {
  const bindings = React.useMemo<RealtimeBinding[]>(() => {
    if (!trackerId) return [];
    return [
      { table: "trackers", filter: `id=eq.${trackerId}`, keys: [queryKeys.tracker(trackerId), ["trackers"]] },
      { table: "tracker_sheets", filter: `tracker_id=eq.${trackerId}`, keys: [queryKeys.trackerSheets(trackerId)] },
    ];
  }, [trackerId]);
  // A sheet is saved as one row, and a long edit saves every second or so;
  // wait out the run rather than re-reading the sheet between keystrokes.
  useRealtime(trackerId ? `tracker:${trackerId}` : null, bindings, { coalesceMs: 1_000, minIntervalMs: 5_000 });
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
    // A deleted or unlinked sheet takes its task's lines with it.
    void queryClient.invalidateQueries({ queryKey: ["item-assets"] });
    void queryClient.invalidateQueries({ queryKey: ["board-assets"] });
    void queryClient.invalidateQueries({ queryKey: ["item-tracker-sheet"] });
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
    mutationFn: (trackerId: string) => services.trackers.delete(trackerId, user.id),
    onSuccess: () => toast.success("Tracker deleted"),
    onError: fail("Could not delete the tracker"),
    onSettled: settle,
  });
  const duplicate = useMutation({
    mutationFn: (trackerId: string) => services.trackers.duplicate(trackerId, user.id),
    onSuccess: () => toast.success("Tracker duplicated"),
    onError: fail("Could not duplicate the tracker"),
    onSettled: settle,
  });
  const moveSheet = useMutation({
    mutationFn: ({ sheetId, delta }: { sheetId: string; delta: -1 | 1 }) => services.trackers.moveSheet(sheetId, delta),
    onError: fail("Could not move the sheet"),
    onSettled: settle,
  });
  const addSheet = useMutation({
    mutationFn: ({ trackerId, name, layout, copyOf }: { trackerId: string; name: string; layout: "campaign" | "blank" | "copy" | "duplicate"; copyOf?: string }) =>
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
    mutationFn: (sheetId: string) => services.trackers.deleteSheet(sheetId, user.id),
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

  return { create, update, remove, duplicate, addSheet, moveSheet, renameSheet, deleteSheet, reorderSheets, importSheets };
}

/**
 * Linking a sheet to a task, changing how its rows read, and letting go. Each
 * rewrites the task's asset lines, so the task's views refresh with the sheet.
 */
export function useSheetAssetMutations() {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const settle = (trackerId: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.trackerSheets(trackerId) });
    void queryClient.invalidateQueries({ queryKey: ["item-assets"] });
    void queryClient.invalidateQueries({ queryKey: ["board-assets"] });
    void queryClient.invalidateQueries({ queryKey: ["tracker-sheet-item"] });
    void queryClient.invalidateQueries({ queryKey: ["item-tracker-sheet"] });
    publishDataChange({ kinds: ["trackers", "items"] });
  };
  const fail = (title: string) => (error: unknown) => toast.error(title, { description: error instanceof Error ? error.message : undefined });
  const link = useMutation({
    mutationFn: ({ sheetId, itemId, mapping }: { sheetId: string; trackerId: string; itemId: string; mapping: TrackerAssetMapping }) => services.trackers.linkSheet(sheetId, itemId, mapping, user.id),
    onSuccess: ({ sync }) => toast.success("The sheet now holds the task's assets", { description: sync ? `${sync.added} asset${sync.added === 1 ? "" : "s"} added to the task.` : undefined }),
    onError: fail("Could not use the sheet for that task"),
    onSettled: (_data, _error, { trackerId }) => settle(trackerId),
  });
  const setMapping = useMutation({
    mutationFn: ({ sheetId, mapping }: { sheetId: string; trackerId: string; mapping: TrackerAssetMapping }) => services.trackers.setAssetMapping(sheetId, mapping, user.id),
    onError: fail("Could not save the asset settings"),
    onSettled: (_data, _error, { trackerId }) => settle(trackerId),
  });
  const unlink = useMutation({
    mutationFn: ({ sheetId }: { sheetId: string; trackerId: string }) => services.trackers.unlinkSheet(sheetId, user.id),
    onSuccess: () => toast.success("Unlinked. The task no longer counts this sheet's rows."),
    onError: fail("Could not unlink the sheet"),
    onSettled: (_data, _error, { trackerId }) => settle(trackerId),
  });
  return { link, setMapping, unlink };
}

/** The sheet holding a task's assets, for the task's Assets tab. */
export function useItemTrackerSheet(itemId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: ["item-tracker-sheet", itemId ?? ""],
    queryFn: () => services.trackers.sheetForItem(itemId!),
    enabled: !!itemId,
    staleTime: 10_000,
  });
}

/** Downloads the tracker as .xlsx. */
export async function exportTrackerToFile(tracker: Tracker, sheets: TrackerSheet[]): Promise<void> {
  const { sheetsToWorkbook } = await import("@/services/tracker-xlsx");
  const bytes = await sheetsToWorkbook(tracker.name, sheets);
  downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeFilename(tracker.name)}.xlsx`);
}

/** Downloads one sheet as .csv, for anything that is not Excel. */
export async function exportSheetToCsv(tracker: Tracker, sheet: TrackerSheet): Promise<void> {
  const { sheetToCsv } = await import("@/features/trackers/grid-model");
  downloadBlob(new Blob([sheetToCsv(sheet)], { type: "text/csv;charset=utf-8" }), `${safeFilename(tracker.name)} - ${safeFilename(sheet.name)}.csv`);
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "tracker";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Local editing state for one sheet: edits apply instantly, history supports
 * undo/redo, and the document is saved shortly after typing stops.
 *
 * Saving is careful because several people can have one sheet open. Each save
 * is written only if the sheet is still the version this editor started from
 * (`base`); when somebody else saved in between, their version is merged with
 * this one, cell by cell (mergeSheets), and saved again. A version arriving
 * over realtime is merged the same way while anything here is unsaved, and
 * simply shown when nothing is. Nobody's typing is lost to somebody else's.
 *
 * Mount the caller with `key={sheet.id}` (see SheetEditorProvider): the hook
 * assumes it lives for exactly one sheet.
 */
export function useSheetEditor(sheet: TrackerSheet | undefined, canEdit: boolean) {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const [draft, setDraft] = React.useState<TrackerSheet | undefined>(sheet);
  // Bookkeeping, not render inputs: one stable mutable object (never replaced)
  // keeps the history, the versions and the save loop out of React's cycle.
  const storeRef = React.useRef({
    past: [] as TrackerSheet[],
    future: [] as TrackerSheet[],
    dirty: false,
    /** What is on screen; every edit starts from this, never from a stale closure. */
    current: sheet,
    /** The server version `current` was built on. */
    base: sheet,
    timer: null as number | null,
    running: false,
    again: false,
    settled: null as (() => void) | null,
    failed: false,
  });
  const [saving, setSaving] = React.useState<"idle" | "pending" | "saving" | "error">("idle");

  const show = React.useCallback(
    (next: TrackerSheet) => {
      const store = storeRef.current;
      store.current = next;
      setDraft(next);
    },
    [],
  );

  // A version from elsewhere: shown as it is when nothing here is unsaved,
  // merged with what is when something is.
  React.useEffect(() => {
    const store = storeRef.current;
    if (!sheet || !store.base || sheet.updatedAt === store.base.updatedAt) return;
    if (sheet.updatedAt < store.base.updatedAt) return;
    if (!store.dirty) {
      store.base = sheet;
      show(sheet);
      return;
    }
    const merged = mergeSheets(store.base, store.current ?? sheet, sheet);
    store.base = sheet;
    show({ ...merged, updatedAt: sheet.updatedAt, name: sheet.name, itemId: sheet.itemId, assetMapping: sheet.assetMapping });
  }, [sheet, show]);

  const run = React.useCallback(async () => {
      const store = storeRef.current;
    store.timer = null;
    if (store.running) {
      store.again = true;
      return;
    }
    store.running = true;
    setSaving("saving");
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        const mine = store.current;
        const base = store.base;
        if (!mine || !base) return;
        const result = await services.trackers.saveSheetDraft(mine.id, { columns: mine.columns, rows: mine.rows, frozenColumns: mine.frozenColumns }, base.updatedAt, user.id);
        if ("conflict" in result) {
          // Somebody saved first: take their changes in and try again on top of them.
          const merged = mergeSheets(base, store.current ?? mine, result.conflict);
          store.base = result.conflict;
          show({ ...merged, updatedAt: result.conflict.updatedAt, name: result.conflict.name, itemId: result.conflict.itemId, assetMapping: result.conflict.assetMapping });
          continue;
        }
        store.base = result.sheet;
        // Typing that arrived while this was on the wire is still unsaved.
        const caughtUp = store.current === mine;
        if (caughtUp) store.dirty = false;
        store.failed = false;
        queryClient.setQueryData<TrackerSheet[]>(queryKeys.trackerSheets(mine.trackerId), (old) => old?.map((s) => (s.id === result.sheet.id ? result.sheet : s)));
        if (result.sync && result.sync.added + result.sync.updated + result.sync.removed > 0) {
          void queryClient.invalidateQueries({ queryKey: ["item-assets"] });
          void queryClient.invalidateQueries({ queryKey: ["board-assets"] });
          publishDataChange({ kinds: ["items"] });
        }
        if (result.syncError) toast.error("The sheet saved, but its task's assets could not be updated", { description: result.syncError });
        publishDataChange({ kinds: ["trackers"] });
        if (!caughtUp) store.again = true;
        setSaving(store.again || store.timer ? "pending" : "idle");
        return;
      }
      throw new Error("The sheet kept changing while saving. Your changes are still here; they will save on the next edit.");
    } catch (error) {
      store.failed = true;
      setSaving("error");
      toast.error("Could not save the sheet", { description: error instanceof Error ? error.message : undefined });
    } finally {
      store.running = false;
      if (store.again) {
        store.again = false;
        if (!store.failed) void run();
      }
      if (!store.running && !store.timer && !store.dirty) {
        store.settled?.();
        store.settled = null;
      }
    }
  }, [services, queryClient, show, user.id]);

  const schedule = React.useCallback(() => {
      const store = storeRef.current;
    if (store.timer) window.clearTimeout(store.timer);
    setSaving("pending");
    // The sheet waits for typing to stop before it saves, so an edit is only
    // in memory for up to a second: hold the unload guard for that whole time.
    store.settled ??= beginUnsavedWork();
    store.timer = window.setTimeout(() => void run(), 600);
  }, [run]);

  React.useEffect(
    () =>
      onServerRecovered(() => {
        const store = storeRef.current;
        if (store.failed && store.dirty) schedule();
      }),
    [schedule],
  );

  const apply = React.useCallback(
    (next: TrackerSheet) => {
      const store = storeRef.current;
      store.dirty = true;
      show(next);
      schedule();
    },
    [schedule, show],
  );

  const commit = React.useCallback(
    (updater: (current: TrackerSheet) => TrackerSheet) => {
      const store = storeRef.current;
      if (!canEdit) return;
      const current = store.current;
      if (!current) return;
      const next = updater(current);
      if (next === current) return;
      store.past = [...store.past.slice(-49), current];
      store.future = [];
      apply(next);
    },
    [canEdit, apply],
  );

  const undo = React.useCallback(() => {
      const store = storeRef.current;
    const current = store.current;
    const previous = store.past.pop();
    if (!canEdit || !current || !previous) return;
    store.future.push(current);
    apply({ ...previous, updatedAt: current.updatedAt });
  }, [apply, canEdit]);

  const redo = React.useCallback(() => {
      const store = storeRef.current;
    const current = store.current;
    const next = store.future.pop();
    if (!canEdit || !current || !next) return;
    store.past.push(current);
    apply({ ...next, updatedAt: current.updatedAt });
  }, [apply, canEdit]);

  /**
   * Finish a pending save when the editor goes away (a sheet switch, closing
   * the page): an edit made in the last 600 ms is written, not dropped.
   * (Audit F-004.) Fire and forget: the component is going, the write is not.
   */
  const latestRun = React.useRef(run);
  React.useEffect(() => {
    latestRun.current = run;
  }, [run]);
  React.useEffect(() => {
    const store = storeRef.current;
    return () => {
      if (store.timer) {
        window.clearTimeout(store.timer);
        void latestRun.current();
      }
    };
  }, []);

  return { sheet: draft, commit, undo, redo, saving };
}
