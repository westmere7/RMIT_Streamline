"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { Check, CornerDownLeft, GripVertical, Link2, Plus, SeparatorVertical, Loader2, Package, Search, Unlink, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
  assignAssetRole,
  columnLetter,
  detectNonAssetRows,
  isFreshSheet,
  isMappingUsable,
  newSpecBreak,
  personIds,
  specBreakKind,
  roleMismatch,
  trackerPeople,
  personValue,
  setTrackerPeople,
  sheetAssetLines,
  suggestAssetMapping,
  trackerPersonName,
  type AssetRole,
  type Item,
  type TrackerAssetMapping,
  type TrackerCellValue,
  type TrackerColumn,
  type TrackerSheet,
  type User,
} from "@/domain";
import { Switch } from "@/components/ui/switch";
import { TrackerService } from "@/services/tracker-service";
import { useServices } from "@/features/data/data-context";
import { useSheetAssetMutations } from "@/features/trackers/hooks";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canEditBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Hands the workspace's members to the People cells (see tracker-people.ts). */
export function useTrackerPeopleDirectory(): void {
  const ws = useWorkspace();
  const people = React.useMemo(
    () =>
      ws.users.flatMap((u) => {
        const full = `${u.firstName} ${u.lastName}`.trim();
        return [...new Set([u.displayName, full].filter(Boolean))].map((name) => ({ id: u.id, name, email: u.email }));
      }),
    [ws.users],
  );
  // Set during render as well as in the effect: the grid formats its cells in
  // the same render, before any effect has run.
  setTrackerPeople(people);
  React.useEffect(() => setTrackerPeople(people), [people]);
}

// ---- People cells -------------------------------------------------------------

/** A People cell: faces and the first name, "+2" for more. */
export function PeopleCellView({ value, users, faded }: { value: unknown; users: User[]; faded?: boolean }) {
  const ids = personIds(typeof value === "string" ? value : null);
  if (ids.length === 0) return null;
  const people = ids.map((id) => users.find((u) => u.id === id) ?? null);
  const first = people[0];
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", faded && "opacity-55")}>
      <span className="flex shrink-0 -space-x-1.5">
        {people.slice(0, 3).map((user, i) => (
          <UserAvatar key={ids[i]} user={user} size="xs" className="ring-2 ring-background" tooltip={false} />
        ))}
      </span>
      <span className="truncate">{first ? first.displayName : trackerPersonName(ids[0]!)}</span>
      {ids.length > 1 && <span className="shrink-0 text-2xs text-muted-foreground">+{ids.length - 1}</span>}
    </span>
  );
}

/**
 * Picks the people in a cell: type to narrow, click or Enter to toggle, and
 * Done (or Tab, or clicking away) to keep it. Several people are allowed.
 * `onPick` hears every toggle as it happens, for a form whose Update should
 * wake up at the first pick rather than when the list closes.
 */
export function PeopleEditor({
  value,
  users,
  onCommit,
  onCancel,
  onPick,
}: {
  value: string;
  users: User[];
  onCommit: (value: string | null) => void;
  onCancel: () => void;
  onPick?: (ids: string[]) => void;
}) {
  const [chosen, setChosen] = React.useState<string[]>(() => personIds(value));
  const pickRef = React.useRef(onPick);
  React.useEffect(() => {
    pickRef.current = onPick;
  });
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pickRef.current?.(chosen);
  }, [chosen]);
  const [query, setQuery] = React.useState("");
  const [highlight, setHighlight] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const needle = query.trim().toLowerCase();
  const visible = users.filter((u) => u.deactivatedAt === null || chosen.includes(u.id)).filter((u) => !needle || u.displayName.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle));
  const toggle = (id: string) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const done = () => onCommit(personValue(chosen));
  React.useEffect(() => inputRef.current?.focus(), []);
  return (
    <div
      ref={rootRef}
      className="absolute top-0 left-0 z-40 w-72 overflow-hidden rounded-lg border bg-popover shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) done();
      }}
      role="listbox"
      aria-multiselectable="true"
      aria-label="Choose people"
      data-testid="people-picker"
    >
      <div className="flex items-center gap-2 border-b px-2.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") onCancel();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(visible.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const user = visible[highlight];
              if (user && query) {
                toggle(user.id);
                setQuery("");
              } else done();
            } else if (e.key === "Tab") {
              e.preventDefault();
              done();
            } else if (e.key === "Backspace" && !query && chosen.length) setChosen((list) => list.slice(0, -1));
          }}
          placeholder="Find a person…"
          aria-label="Find a person"
          className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      <ul className="max-h-64 overflow-y-auto p-1.5">
        {visible.map((user, i) => {
          const on = chosen.includes(user.id);
          return (
            <li key={user.id}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(user.id)}
                onMouseEnter={() => setHighlight(i)}
                className={cn("flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px]", i === highlight && "bg-accent")}
              >
                <UserAvatar user={user} size="xs" tooltip={false} />
                <span className="min-w-0 flex-1 truncate">{user.displayName}</span>
                {on && <Check className="size-3.5 text-primary" />}
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <li className="px-2 py-3 text-center text-2xs text-muted-foreground">Nobody by that name.</li>}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t px-2.5 py-1.5">
        <span className="text-2xs text-muted-foreground">{chosen.length ? `${chosen.length} chosen` : "Nobody"}</span>
        <span className="flex gap-1">
          {chosen.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setChosen([])}>
              Clear
            </Button>
          )}
          <Button size="sm" className="h-7" onClick={done} data-testid="people-picker-done">
            Done
          </Button>
        </span>
      </div>
    </div>
  );
}

// ---- Which column plays which part --------------------------------------------

export type { AssetRole };

export const ASSET_ROLE_LABELS: Record<AssetRole, string> = {
  name: "Asset name",
  type: "Asset type",
  quantity: "Quantity",
  pic: "PIC",
  due: "Due date",
  done: "Done",
  spec: "Spec",
  link: "Link",
};

/** The part each mapped column plays, for the badge in its header. */
export function assetRoles(mapping: TrackerAssetMapping | null | undefined): Map<string, AssetRole> {
  const roles = new Map<string, AssetRole>();
  if (!mapping) return roles;
  const set = (id: string | null, role: AssetRole) => id && !roles.has(id) && roles.set(id, role);
  set(mapping.name, "name");
  set(mapping.type.columnId, "type");
  set(mapping.quantity.columnId, "quantity");
  set(mapping.pic.columnId, "pic");
  set(mapping.due.columnId, "due");
  set(mapping.done.columnId, "done");
  mapping.spec.forEach((id) => set(id, "spec"));
  mapping.links.forEach((id) => set(id, "link"));
  return roles;
}

/** What an empty cell of a mapped column stands for, shown faintly in it. */
export function assetFallbacks(mapping: TrackerAssetMapping | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!mapping) return out;
  if (mapping.type.columnId && mapping.type.value) out.set(mapping.type.columnId, mapping.type.value);
  if (mapping.quantity.columnId && mapping.quantity.value !== null) out.set(mapping.quantity.columnId, String(mapping.quantity.value));
  if (mapping.pic.columnId && mapping.pic.value?.length) out.set(mapping.pic.columnId, mapping.pic.value.join(","));
  if (mapping.due.columnId && mapping.due.value) out.set(mapping.due.columnId, mapping.due.value);
  return out;
}

// ---- The linked task ----------------------------------------------------------

/** The task a sheet holds the assets of, and whether the viewer may edit it. */
export function useLinkedTask(sheet: Pick<TrackerSheet, "id" | "itemId"> | undefined) {
  const services = useServices();
  const ws = useWorkspace();
  const query = useQuery({
    queryKey: ["tracker-sheet-item", sheet?.itemId ?? ""],
    queryFn: () => services.repos.items.getById(sheet!.itemId!),
    enabled: !!sheet?.itemId,
    staleTime: 30_000,
  });
  const item = query.data ?? null;
  const board = item ? ws.boardById(item.boardId) : undefined;
  return { item, board, loading: query.isLoading, canEditTask: !!board && canEditBoard(ws.permissions, board) };
}

/**
 * The strip under the sheet tabs while a sheet holds a task's assets: which
 * task, a way there, and why the grid is read only when the viewer cannot
 * edit that task.
 */
export function LinkedSheetBar({ sheet, onSettings }: { sheet: TrackerSheet; onSettings: (() => void) | null }) {
  const ws = useWorkspace();
  const { item, board, loading, canEditTask } = useLinkedTask(sheet);
  if (!sheet.itemId) return null;
  const lines = sheet.assetMapping && isMappingUsable(sheet.assetMapping) ? sheetAssetLines(sheet, sheet.assetMapping).length : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-primary/[0.04] px-6 py-1.5 text-[13px] max-md:px-3" data-testid="linked-sheet-bar">
      <Package className="size-4 shrink-0 text-primary" aria-hidden />
      {loading ? (
        <span className="text-muted-foreground">Loading the task…</span>
      ) : item && board ? (
        <>
          <span className="min-w-0 truncate">
            Assets of{" "}
            <Link href={routes.board(ws.slug, board.slug, { itemId: item.id })} className="font-medium hover:underline">
              {item.ticket ? `${item.ticket} · ` : ""}
              {item.name}
            </Link>{" "}
            <span className="text-muted-foreground">on {board.name}</span>
          </span>
          <span className="text-muted-foreground">· {lines === 1 ? "1 asset" : `${lines} assets`}</span>
          {!canEditTask && <span className="text-muted-foreground">· Read only: you can&rsquo;t edit that task</span>}
        </>
      ) : (
        <span className="text-muted-foreground">The task this sheet held the assets of is gone.</span>
      )}
      {onSettings && (
        <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={onSettings} data-testid="linked-sheet-settings">
          Asset settings
        </Button>
      )}
    </div>
  );
}

// ---- The dialog ---------------------------------------------------------------

interface TaskHit {
  item: Item;
  boardName: string;
}

/** Tasks the viewer can edit, found by name or ticket. */
function useTaskSearch(query: string, enabled: boolean) {
  const services = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: ["tracker-task-search", ws.workspace.id, query],
    queryFn: async (): Promise<TaskHit[]> => {
      const results = await services.search.search(ws.workspace.id, query, { limitPerGroup: 12 });
      return results.items
        .filter(({ board, archived }) => !archived && canEditBoard(ws.permissions, board) && board.system !== "TASK_ALLOCATION")
        .map(({ item, board }) => ({ item, boardName: board.name }));
    },
    enabled: enabled && query.trim().length > 0,
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * Makes a sheet a task's deliverables, or changes how it is read. The task is
 * picked once; the columns are guessed from their names and every guess can
 * be changed, or replaced by one value for every row ("everything here is
 * Jane's"). A line count underneath says what the task will get.
 */
export function TaskAssetsDialog({
  sheet,
  open,
  onOpenChange,
  presetItem,
  initialMapping,
}: {
  sheet: TrackerSheet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetItem?: Item | null;
  /** Opens on this mapping instead of the saved one (a part picked from a column's menu). */
  initialMapping?: TrackerAssetMapping | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90dvh] overflow-y-auto" data-testid="task-assets-dialog">
        {open && <TaskAssetsForm sheet={sheet} presetItem={presetItem ?? null} initialMapping={initialMapping ?? null} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TaskAssetsForm({ sheet, presetItem, initialMapping, onClose }: { sheet: TrackerSheet; presetItem: Item | null; initialMapping: TrackerAssetMapping | null; onClose: () => void }) {
  const ws = useWorkspace();
  const assetTypes = useWorkspaceList(ws.workspace.id, "ASSET_TYPES");
  const linked = useLinkedTask(sheet);
  const mutations = useSheetAssetMutations();
  const [mapping, setMapping] = React.useState<TrackerAssetMapping>(() => initialMapping ?? sheet.assetMapping ?? suggestAssetMapping(sheet));
  // Columns made from here, shown before the sheet on screen has caught up with them.
  const [made, setMade] = React.useState<TrackerColumn[]>([]);
  const columns = React.useMemo(() => [...sheet.columns, ...made.filter((c) => !sheet.columns.some((s) => s.id === c.id))], [sheet.columns, made]);
  const shown = React.useMemo(() => ({ ...sheet, columns }), [sheet, columns]);
  /** Makes the column a part is missing, and gives the part to it. */
  const newColumn = (role: Exclude<AssetRole, "spec">) => async () => {
    const { column } = await mutations.addColumn.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, role, options: role === "type" ? assetTypes.map((t) => t.name) : undefined });
    setMade((list) => [...list, column]);
    setMapping((m) => assignAssetRole(m, column, role));
  };
  const [chosen, setChosen] = React.useState<Item | null>(presetItem);
  const services = useServices();
  // The chosen task's own lines (not ones from a sheet): offered to the sheet when it is first linked.
  const ownLines = useQuery({
    queryKey: ["item-own-asset-lines", chosen?.id ?? ""],
    queryFn: async () => (await services.assets.list(chosen!.id)).filter((a) => a.itemId === chosen!.id && !a.trackerSheetId).length,
    enabled: !!chosen && !sheet.itemId,
    staleTime: 5_000,
  });
  const movable = sheet.itemId ? 0 : (ownLines.data ?? 0);
  const [moveAssets, setMoveAssets] = React.useState(true);
  // A sheet nobody has started is given the asset columns rather than mapped.
  const fresh = !sheet.itemId && isFreshSheet(sheet);
  const [query, setQuery] = React.useState("");
  const hits = useTaskSearch(query, !sheet.itemId && !presetItem);
  const task = sheet.itemId ? linked.item : chosen;
  // Rows that are not assets (a repeated header, a section label, a total): sections become bands, the rest are left out.
  const detected = React.useMemo(() => detectNonAssetRows(shown, mapping), [shown, mapping]);
  const [handleDetected, setHandleDetected] = React.useState(true);
  const bandIds = React.useMemo(() => (handleDetected ? detected.filter((d) => d.kind === "section").map((d) => d.rowId) : []), [detected, handleDetected]);
  const skipIds = React.useMemo(() => (handleDetected ? detected.filter((d) => d.kind !== "section").map((d) => d.rowId) : []), [detected, handleDetected]);
  const previewSheet = React.useMemo(() => (bandIds.length ? TrackerService.setRowKind(shown, bandIds, "section") : shown), [shown, bandIds]);
  const effectiveMapping = React.useMemo<TrackerAssetMapping>(() => (skipIds.length ? { ...mapping, ignoreRows: [...new Set([...(mapping.ignoreRows ?? []), ...skipIds])] } : mapping), [mapping, skipIds]);
  const lines = React.useMemo(() => (isMappingUsable(effectiveMapping) ? sheetAssetLines(previewSheet, effectiveMapping) : []), [previewSheet, effectiveMapping]);
  // The column under the pointer (or keyboard) in a dropdown or chip, lit up in the preview.
  const [peek, setPeek] = React.useState<string | null>(null);
  const units = lines.reduce((sum, l) => sum + (l.quantity ?? 1), 0);
  const people = new Set(lines.flatMap((l) => l.assigneeIds)).size;
  const pending = mutations.link.isPending || mutations.setMapping.isPending || mutations.unlink.isPending || mutations.addColumn.isPending || mutations.bandRows.isPending;
  // A column plays one part: choosing it for one takes it out of Spec and Links.
  const set = (patch: Partial<TrackerAssetMapping>) =>
    setMapping((m) => {
      const next = { ...m, ...patch };
      const taken = new Set([next.name, next.type.columnId, next.quantity.columnId, next.pic.columnId, next.due.columnId, next.done.columnId].filter(Boolean));
      return { ...next, spec: next.spec.filter((id) => !taken.has(id)), links: next.links.filter((id) => !taken.has(id)) };
    });
  // One column per part: picking a column for one takes it from whichever part had it.
  const pick = (role: AssetRole) => (columnId: string | null) =>
    setMapping((m) => {
      const current = role === "name" ? m.name : role === "spec" || role === "link" ? null : m[role].columnId;
      const column = columns.find((c) => c.id === (columnId ?? current));
      return column ? assignAssetRole(m, column, columnId ? role : null) : m;
    });
  const taken = new Set([mapping.name, mapping.type.columnId, mapping.quantity.columnId, mapping.pic.columnId, mapping.due.columnId, mapping.done.columnId].filter((id): id is string => !!id));

  const save = async () => {
    // Section labels first become bands, so the lines come out in their blocks.
    if (!fresh && bandIds.length) await mutations.bandRows.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, rowIds: bandIds });
    const saving = fresh ? mapping : effectiveMapping;
    if (sheet.itemId) await mutations.setMapping.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, mapping: saving });
    else if (chosen)
      await mutations.link.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, itemId: chosen.id, mapping: saving, moveAssets: movable > 0 && moveAssets, setUpColumns: fresh, assetTypes: assetTypes.map((t) => t.name) });
    onClose();
  };

  const listCol = mapping.done.columnId ? columns.find((c) => c.id === mapping.done.columnId) : null;
  const warn = (columnId: string | null, role: AssetRole) => {
    const mismatch = columnId ? roleMismatch(shown, columnId, role, trackerPeople()) : null;
    return mismatch ? (
      <MapRow label="">
        <span className="text-xs text-amber-700 dark:text-amber-400" data-testid={`map-warning-${role}`}>
          {mismatchText(mismatch)}
        </span>
      </MapRow>
    ) : null;
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Task assets</DialogTitle>
        <DialogDescription>Each row of “{sheet.name}” becomes one of the task&rsquo;s assets, counted on its board, in My Work and on the dashboard.</DialogDescription>
      </DialogHeader>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Task</h3>
        {task ? (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2" data-testid="task-assets-task">
            <Link2 className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {task.ticket ? `${task.ticket} · ` : ""}
              {task.name}
            </span>
            {sheet.itemId ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                disabled={pending}
                onClick={async () => {
                  await mutations.unlink.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId });
                  onClose();
                }}
                data-testid="task-assets-unlink"
              >
                <Unlink /> Unlink
              </Button>
            ) : (
              !presetItem && (
                <Button size="icon-xs" variant="ghost" aria-label="Choose another task" onClick={() => setChosen(null)}>
                  <X />
                </Button>
              )
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a task by name or ticket…" aria-label="Find a task" className="pl-8" data-testid="task-assets-search" />
            </div>
            {query.trim() && (
              <ul className="max-h-52 overflow-y-auto rounded-lg border p-1" data-testid="task-assets-hits">
                {(hits.data ?? []).map(({ item, boardName }) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => setChosen(item)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent">
                      <span className="min-w-0 flex-1 truncate">
                        {item.ticket ? <span className="font-mono text-2xs text-muted-foreground">{item.ticket} </span> : null}
                        {item.name}
                      </span>
                      <span className="shrink-0 truncate text-2xs text-muted-foreground">{boardName}</span>
                    </button>
                  </li>
                ))}
                {hits.isFetching && !hits.data && (
                  <li className="flex justify-center py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </li>
                )}
                {hits.data && hits.data.length === 0 && <li className="px-2 py-2 text-center text-2xs text-muted-foreground">No task you can edit matches.</li>}
              </ul>
            )}
          </div>
        )}
      </section>

      {fresh ? (
        // Nothing to map in a sheet nobody has started: it gets the asset columns as it is linked.
        <section className="space-y-2" data-testid="task-assets-fresh">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Columns</h3>
          <p className="text-[13px] text-muted-foreground">This sheet is empty, so it gets these columns:</p>
          <div className="flex flex-wrap gap-1.5">
            {FRESH_COLUMNS.map((name) => (
              <span key={name} className="rounded-md border border-border/60 bg-surface px-2 py-0.5 text-xs">
                {name}
              </span>
            ))}
          </div>
        </section>
      ) : (
        <>
        <section className="space-y-2" data-testid="task-assets-sheet">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">The sheet</h3>
          <SheetPreview sheet={previewSheet} mapping={effectiveMapping} peek={peek} bandIds={bandIds} />
          {detected.length > 0 && (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 px-3 py-2 text-[13px]" data-testid="task-assets-nonasset">
              <span className="min-w-0">
                {nonAssetSummary(detected)}
                <span className="block text-2xs text-muted-foreground">
                  {handleDetected ? "Sections become bands; headers and totals are left out of the assets and stay in the sheet." : "They are read as assets like any other row."}
                </span>
              </span>
              <Switch checked={handleDetected} onCheckedChange={setHandleDetected} aria-label="Deal with rows that are not assets" data-testid="task-assets-nonasset-switch" />
            </label>
          )}
        </section>
        <section className="space-y-2.5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Columns</h3>
          <MapRow label="Asset name">
            <ColumnSelect columns={columns} onPeek={setPeek} value={mapping.name} onChange={pick("name")} onCreate={newColumn("name")} none="Choose a column" testId="map-name" />
          </MapRow>
          <MapRow label="Type">
            <ColumnSelect columns={columns} onPeek={setPeek} value={mapping.type.columnId} onChange={pick("type")} onCreate={newColumn("type")} none="No column" testId="map-type" />
            <select
              value={mapping.type.value ?? ""}
              onChange={(e) => set({ type: { ...mapping.type, value: e.target.value || null } })}
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-[13px]"
              aria-label="Type for every row"
              data-testid="map-type-value"
            >
              <option value="">{mapping.type.columnId ? "Empty cells: none" : "Every row: none"}</option>
              {assetTypes.map((t) => (
                <option key={t.name} value={t.name}>
                  {mapping.type.columnId ? "Empty cells: " : "Every row: "}
                  {t.name}
                </option>
              ))}
            </select>
          </MapRow>
          <MapRow label="Quantity">
            <ColumnSelect columns={columns} onPeek={setPeek} value={mapping.quantity.columnId} onChange={pick("quantity")} onCreate={newColumn("quantity")} none="No column" testId="map-quantity" />
            <Input
              type="number"
              min={0}
              value={mapping.quantity.value ?? ""}
              onChange={(e) => set({ quantity: { ...mapping.quantity, value: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) } })}
              placeholder={mapping.quantity.columnId ? "Empty cells" : "Every row"}
              aria-label="Quantity for every row"
              className="h-8 min-w-0 flex-1"
            />
          </MapRow>
          {warn(mapping.quantity.columnId, "quantity")}
          <MapRow label="PIC">
            <ColumnSelect columns={columns} onPeek={setPeek} value={mapping.pic.columnId} onChange={pick("pic")} onCreate={newColumn("pic")} none="No column" testId="map-pic" />
            <PeopleValue users={ws.activeUsers} value={mapping.pic.value ?? []} onChange={(value) => set({ pic: { ...mapping.pic, value: value.length ? value : null } })} placeholder={mapping.pic.columnId ? "Empty cells" : "Every row"} />
          </MapRow>
          {warn(mapping.pic.columnId, "pic")}
          <MapRow label="Due date">
            <ColumnSelect columns={columns} onPeek={setPeek} value={mapping.due.columnId} onChange={pick("due")} onCreate={newColumn("due")} none="No column" testId="map-due" />
            <Input type="date" value={mapping.due.value ?? ""} onChange={(e) => set({ due: { ...mapping.due, value: e.target.value || null } })} aria-label="Due date for every row" className="h-8 min-w-0 flex-1" />
          </MapRow>
          {warn(mapping.due.columnId, "due")}
          <MapRow label="Done">
            <ColumnSelect
              columns={columns} onPeek={setPeek}
              value={mapping.done.columnId}
              onChange={pick("done")}
              onCreate={newColumn("done")}
              none="Nothing counts as done"
              testId="map-done"
            />
          </MapRow>
          {listCol && listCol.type !== "list" && listCol.type !== "checkbox" && (
            <MapRow label="">
              <span className="text-xs text-muted-foreground">Done, Delivered, Approved and the like count as done.</span>
            </MapRow>
          )}
          {listCol?.type === "list" && (
            <MapRow label="">
              <div className="flex flex-wrap gap-1.5" aria-label="Choices that count as done">
                {(listCol.options ?? []).map((option) => {
                  const on = mapping.done.values.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ done: { ...mapping.done, values: on ? mapping.done.values.filter((v) => v !== option) : [...mapping.done.values, option] } })}
                      className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-green-600 bg-green-600/10 text-green-700 dark:text-green-300" : "text-muted-foreground hover:bg-accent")}
                    >
                      {on && <Check className="mr-1 inline size-3" />}
                      {option}
                    </button>
                  );
                })}
              </div>
            </MapRow>
          )}
          <MapRow label="Spec">
            <SpecChips onPeek={setPeek} columns={columns} hidden={new Set([...taken, ...mapping.links])} value={mapping.spec} onChange={(spec) => set({ spec })} />
          </MapRow>
          <MapRow label="Links">
            <ColumnChips onPeek={setPeek} columns={columns} hidden={new Set([...taken, ...mapping.spec])} value={mapping.links} onChange={(links) => set({ links })} />
          </MapRow>
        </section>
        <p className="rounded-lg bg-surface px-3 py-2 text-[13px]" data-testid="task-assets-preview">
          {isMappingUsable(mapping) ? (
            <>
              <span className="font-semibold">{lines.length === 1 ? "1 asset" : `${lines.length} assets`}</span>
              {lines.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {units} {units === 1 ? "unit" : "units"} · {people === 1 ? "1 person" : `${people} people`} in charge · {lines.filter((l) => l.done).length} done
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Choose the column that names each asset.</span>
          )}
        </p>
        </>
      )}

      {movable > 0 && (
        // The task's own lines, moved in as rows below what the sheet holds, or left beside the sheet's.
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 px-3 py-2 text-[13px]" data-testid="task-assets-move">
          <span className="min-w-0">
            Move the task&rsquo;s {movable === 1 ? "asset" : `${movable} assets`} into this sheet
            <span className="block text-2xs text-muted-foreground">{moveAssets ? "Added below the sheet's rows; columns they need are added." : "They stay on the task, beside the sheet's."}</span>
          </span>
          <Switch checked={moveAssets} onCheckedChange={setMoveAssets} aria-label="Move the task's assets into this sheet" data-testid="task-assets-move-switch" />
        </label>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={pending || !isMappingUsable(mapping) || (!sheet.itemId && !chosen)} data-testid="task-assets-save">
          {pending && <Loader2 className="animate-spin" />}
          {sheet.itemId ? "Save" : "Use for this task"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** "2 section rows and 1 header row aren't assets." */
function nonAssetSummary(detected: ReadonlyArray<{ kind: "header" | "section" | "total" }>): string {
  const count = (kind: string, word: string) => {
    const n = detected.filter((d) => d.kind === kind).length;
    return n ? `${n} ${word} row${n === 1 ? "" : "s"}` : null;
  };
  const parts = [count("section", "section"), count("header", "header"), count("total", "total")].filter(Boolean) as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]!;
  return `${list} ${detected.length === 1 ? "isn't an asset" : "aren't assets"}`;
}

const ROLE_TAGS: Array<{ label: string; has: (m: TrackerAssetMapping, id: string) => boolean }> = [
  { label: "Name", has: (m, id) => m.name === id },
  { label: "Type", has: (m, id) => m.type.columnId === id },
  { label: "Qty", has: (m, id) => m.quantity.columnId === id },
  { label: "PIC", has: (m, id) => m.pic.columnId === id },
  { label: "Due", has: (m, id) => m.due.columnId === id },
  { label: "Done", has: (m, id) => m.done.columnId === id },
  { label: "Spec", has: (m, id) => m.spec.includes(id) },
  { label: "Link", has: (m, id) => m.links.includes(id) },
];

/**
 * The sheet as it will be read, in miniature: each column with the part it
 * plays, bands as bands, rows left out dimmed, and the column a dropdown or
 * chip is pointing at lit up (and scrolled to) so a choice can be seen before
 * it is made.
 */
function SheetPreview({ sheet, mapping, peek, bandIds }: { sheet: TrackerSheet; mapping: TrackerAssetMapping; peek: string | null; bandIds: readonly string[] }) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const ignored = new Set(mapping.ignoreRows ?? []);
  const spotted = new Set(bandIds);
  const filled = sheet.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind !== "data" || Object.values(row.cells).some((v) => v !== null && v !== "" && v !== false));
  const shownRows = filled.slice(0, 14);
  React.useEffect(() => {
    if (!peek) return;
    scroller.current?.querySelector<HTMLElement>(`[data-column="${peek}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [peek]);
  const show = (column: TrackerColumn, value: TrackerCellValue | undefined): string => {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "boolean") return value ? "✓" : "";
    if (column.type === "person") return personIds(value).map((id) => trackerPersonName(id)).join(", ");
    return String(value);
  };
  if (filled.length === 0) return <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-[13px] text-muted-foreground">Nothing in the sheet yet.</p>;
  return (
    <div ref={scroller} className="scrollbar-thin max-h-60 overflow-auto rounded-lg border border-border/60" data-testid="task-assets-preview-sheet">
      <table className="w-max min-w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th className="w-7 border-b border-border/60" />
            {sheet.columns.map((c, index) => {
              const roles = ROLE_TAGS.filter((r) => r.has(mapping, c.id)).map((r) => r.label);
              const hot = peek === c.id;
              return (
                <th key={c.id} data-column={c.id} className={cn("border-b border-border/60 px-2 py-1 text-left align-bottom font-medium transition-colors", hot ? "bg-primary/20" : roles.length ? "bg-primary/5" : "text-muted-foreground")}>
                  <span className="mb-0.5 flex min-h-4 flex-wrap gap-1">
                    {roles.map((r) => (
                      <span key={r} className="rounded bg-primary/15 px-1 text-[10px] leading-4 font-semibold text-primary">
                        {r}
                      </span>
                    ))}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ColumnBadge index={index} />
                    <span className="max-w-32 truncate">{c.name}</span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shownRows.map(({ row, index }) =>
            row.kind !== "data" ? (
              <tr key={row.id} data-testid="preview-band">
                <td className="border-t border-border/40 px-1 text-center text-[10px] text-muted-foreground">{index + 1}</td>
                <td colSpan={sheet.columns.length} className="border-t border-border/40 bg-surface/70 px-2 py-1 font-semibold">
                  {row.label || (row.kind === "section" ? "Phase" : "Channel")}
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{spotted.has(row.id) ? "becomes a band" : "band"}</span>
                </td>
              </tr>
            ) : (
              <tr key={row.id} className={cn(ignored.has(row.id) && "opacity-40")} title={ignored.has(row.id) ? "Left out of the assets" : undefined} data-testid={ignored.has(row.id) ? "preview-left-out" : "preview-row"}>
                <td className="border-t border-border/40 px-1 text-center text-[10px] text-muted-foreground">{index + 1}</td>
                {sheet.columns.map((c) => (
                  <td key={c.id} className={cn("max-w-44 truncate border-t border-border/40 px-2 py-1", peek === c.id && "bg-primary/10")}>
                    {show(c, row.cells[c.id])}
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
      {filled.length > shownRows.length && <p className="px-2 py-1 text-2xs text-muted-foreground">and {filled.length - shownRows.length} more rows</p>}
    </div>
  );
}

/** The columns a fresh sheet gets when used for a task (assetSheet's, in order). */
const FRESH_COLUMNS = ["Asset", "Type", "Quantity", "Spec", "PIC", "Due date", "Done"];

/** The warning for cells a role cannot read; the sheet keeps them either way. */
export function mismatchText({ unreadable, filled, expected }: { unreadable: number; filled: number; expected: string }): string {
  return `${unreadable === filled ? `All ${filled}` : `${unreadable} of ${filled}`} filled cells aren’t ${expected}. Those assets get nothing from them; the sheet keeps them.`;
}

function MapRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 max-sm:grid-cols-1">
      <span className="text-[13px] font-medium">{label}</span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** A sheet column's letter, as the grid's header menu names it. */
function ColumnBadge({ index }: { index: number }) {
  return (
    <span aria-hidden className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-foreground/10 px-1.5 font-mono text-[10px] leading-none font-semibold text-muted-foreground">
      {columnLetter(index)}
    </span>
  );
}

const NO_COLUMN = "__none";
const NEW_COLUMN = "__new";

/** Any column of the sheet, each with its letter; and, with `onCreate`, a new one made for the part. */
function ColumnSelect({
  columns,
  value,
  onChange,
  onCreate,
  none,
  testId,
  onPeek,
}: {
  columns: TrackerColumn[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate?: () => Promise<void>;
  none: string;
  testId?: string;
  /** The column an option points at as the pointer or keyboard reaches it; null as the list closes. */
  onPeek?: (id: string | null) => void;
}) {
  return (
    <Select
      value={value ?? NO_COLUMN}
      onOpenChange={(open) => onPeek?.(open ? value : null)}
      onValueChange={(next) => {
        if (next === NEW_COLUMN) void onCreate?.().catch(() => undefined);
        else onChange(next === NO_COLUMN ? null : next);
      }}
    >
      <SelectTrigger className="h-8 min-w-0 flex-1 rounded-md bg-background px-2 max-md:h-10" aria-label={none} data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_COLUMN} className="text-muted-foreground">
          {none}
        </SelectItem>
        <SelectSeparator />
        {columns.map((c, index) => (
          <SelectItem key={c.id} value={c.id} onFocus={() => onPeek?.(c.id)} onPointerEnter={() => onPeek?.(c.id)}>
            {/* One flex row inside the item's text, so the letter keeps its distance from the name here and in the closed select. */}
            <span className="flex min-w-0 items-center gap-2">
              <ColumnBadge index={index} />
              <span className="truncate">{c.name}</span>
            </span>
          </SelectItem>
        ))}
        {onCreate && (
          <>
            <SelectSeparator />
            <SelectItem value={NEW_COLUMN} className="text-primary" data-testid={testId ? `${testId}-new` : undefined}>
              <span className="flex items-center gap-2">
                <Plus className="size-3.5 shrink-0" aria-hidden />
                New column
              </span>
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}

/** Columns as toggles, each with its letter; `hidden` are playing another part. */
function ColumnChips({ columns, hidden, value, onChange, onPeek }: { columns: TrackerColumn[]; hidden: ReadonlySet<string>; value: string[]; onChange: (ids: string[]) => void; onPeek?: (id: string | null) => void }) {
  const shown = columns.map((c, index) => ({ c, index })).filter(({ c }) => !hidden.has(c.id));
  if (shown.length === 0) return <span className="text-[13px] text-muted-foreground">No columns left</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map(({ c, index }) => {
        const on = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((id) => id !== c.id) : [...value, c.id])}
            onMouseEnter={() => onPeek?.(c.id)}
            onMouseLeave={() => onPeek?.(null)}
            onFocus={() => onPeek?.(c.id)}
            onBlur={() => onPeek?.(null)}
            className={cn("inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 text-xs", on ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent")}
          >
            <ColumnBadge index={index} />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Spec columns: the chosen ones first, in the order the spec line reads
 * ("Duration: 30s · Aspect ratio: 9:16"), dragged to reorder and clicked to
 * take out; the rest after them, clicked to add at the end.
 */
function SpecChips({ columns, hidden, value, onChange, onPeek }: { columns: TrackerColumn[]; hidden: ReadonlySet<string>; value: string[]; onChange: (ids: string[]) => void; onPeek?: (id: string | null) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const indexOf = new Map(columns.map((c, i) => [c.id, i]));
  const chosen = value.filter((id) => indexOf.has(id) || specBreakKind(id));
  const rest = columns.map((c, index) => ({ c, index })).filter(({ c }) => !hidden.has(c.id) && !value.includes(c.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onChange(arrayMove(chosen, chosen.indexOf(String(active.id)), chosen.indexOf(String(over.id))));
  };
  if (chosen.length === 0 && rest.length === 0) return <span className="text-[13px] text-muted-foreground">No columns left</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="map-spec">
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToParentElement]} onDragEnd={onDragEnd}>
        <SortableContext items={chosen} strategy={rectSortingStrategy}>
          {chosen.map((id) => (
            <SortableSpecChip key={id} id={id} index={indexOf.get(id) ?? null} name={columns[indexOf.get(id) ?? -1]?.name ?? ""} onRemove={() => onChange(chosen.filter((x) => x !== id))} onPeek={onPeek} />
          ))}
        </SortableContext>
      </DndContext>
      {chosen.length > 0 && (
        <>
          <SimpleTooltip label="Add a divider">
            <Button type="button" size="icon-xs" variant="ghost" className="rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground" aria-label="Add a divider" onClick={() => onChange([...chosen, newSpecBreak("sep")])} data-testid="map-spec-add-sep">
              <SeparatorVertical />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip label="Add a line break">
            <Button type="button" size="icon-xs" variant="ghost" className="rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground" aria-label="Add a line break" onClick={() => onChange([...chosen, newSpecBreak("br")])} data-testid="map-spec-add-br">
              <CornerDownLeft />
            </Button>
          </SimpleTooltip>
        </>
      )}
      {chosen.length > 0 && rest.length > 0 && <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />}
      {rest.map(({ c, index }) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={false}
          onClick={() => onChange([...chosen, c.id])}
          onMouseEnter={() => onPeek?.(c.id)}
          onMouseLeave={() => onPeek?.(null)}
          onFocus={() => onPeek?.(c.id)}
          onBlur={() => onPeek?.(null)}
          className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 text-xs text-muted-foreground hover:bg-accent"
        >
          <ColumnBadge index={index} />
          {c.name}
        </button>
      ))}
    </div>
  );
}

function SortableSpecChip({ id, index, name, onRemove, onPeek }: { id: string; index: number | null; name: string; onRemove: () => void; onPeek?: (id: string | null) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const kind = specBreakKind(id);
  if (kind) {
    const label = kind === "sep" ? "Divider" : "Line break";
    return (
      <button
        ref={setNodeRef}
        type="button"
        style={{ transform: CSS.Translate.toString(transform), transition }}
        {...attributes}
        {...listeners}
        onClick={onRemove}
        aria-label={`${label}: drag to move, click to take out`}
        title={`${label}: drag to move, click to take out`}
        className={cn("inline-flex h-[22px] cursor-grab touch-none items-center rounded-full border border-primary bg-primary/10 px-2 text-foreground active:cursor-grabbing", isDragging && "z-10 shadow-md")}
        data-testid={`map-spec-${kind}`}
      >
        {kind === "sep" ? <SeparatorVertical className="size-3.5" /> : <CornerDownLeft className="size-3.5" />}
      </button>
    );
  }
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onRemove}
      onMouseEnter={() => onPeek?.(id)}
      onMouseLeave={() => onPeek?.(null)}
      title="Drag to reorder, click to take out"
      className={cn("inline-flex cursor-grab touch-none items-center gap-1 rounded-full border border-primary bg-primary/10 py-0.5 pr-2.5 pl-0.5 text-xs text-foreground active:cursor-grabbing", isDragging && "z-10 shadow-md")}
      data-testid={`map-spec-${id}`}
    >
      <GripVertical className="size-3 text-muted-foreground" aria-hidden />
      {index !== null && <ColumnBadge index={index} />}
      {name}
    </button>
  );
}

/** People for every row (or every empty cell). */
export function PeopleValue({
  users,
  value,
  onChange,
  placeholder,
  label = "PIC for every row",
  testId = "map-pic-value",
}: {
  users: User[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  label?: string;
  testId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setOpen(true)} className="flex h-8 w-full items-center gap-1.5 rounded-md border bg-background px-2 text-left text-[13px]" aria-label={label} data-testid={testId}>
        {value.length ? <PeopleCellView value={value.join(",")} users={users} /> : <span className="text-muted-foreground">{placeholder}: nobody</span>}
      </button>
      {open && (
        <PeopleEditor
          value={value.join(",")}
          users={users}
          onPick={onChange}
          onCommit={(next) => {
            onChange(personIds(next));
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}
