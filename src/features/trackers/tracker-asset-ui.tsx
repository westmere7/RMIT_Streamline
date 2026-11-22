"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, CornerDownLeft, Info, ListChecks, GripVertical, Table2, Link2, Plus, SeparatorVertical, Loader2, Package, Search, Unlink, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PersonName, UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
  assetRoleOf,
  assignAssetRole,
  canBeBand,
  columnLetter,
  fitTypeFor,
  nonAssetPlan,
  type RowMark,
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
  TRACKER_COLUMN_TYPE_LABELS,
  type AssetRole,
  type RoleMismatch,
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
import { KeepAssetsSwitch } from "./delete-tracker-dialog";
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
          <UserAvatar key={ids[i]} user={user} size="xs" className="ring-2 ring-background" />
        ))}
      </span>
      {first ? <PersonName user={first} className="truncate" /> : <span className="truncate">{trackerPersonName(ids[0]!)}</span>}
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
  afterLink,
}: {
  sheet: TrackerSheet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetItem?: Item | null;
  /** Opens on this mapping instead of the saved one (a part picked from a column's menu). */
  initialMapping?: TrackerAssetMapping | null;
  /**
   * Opened from a task: the sheet is linked without moving anything, and this
   * runs after, for the task to offer its assets one by one (Move into sheet).
   */
  afterLink?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90dvh] overflow-y-auto" data-testid="task-assets-dialog">
        {open && <TaskAssetsForm sheet={sheet} presetItem={presetItem ?? null} initialMapping={initialMapping ?? null} afterLink={afterLink} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TaskAssetsForm({ sheet, presetItem, initialMapping, afterLink, onClose }: { sheet: TrackerSheet; presetItem: Item | null; initialMapping: TrackerAssetMapping | null; afterLink?: () => void; onClose: () => void }) {
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
    enabled: !!chosen && !sheet.itemId && !afterLink,
    staleTime: 5_000,
  });
  // From a task, the assets are chosen after linking (afterLink), so no all-or-nothing switch here.
  const movable = sheet.itemId || afterLink ? 0 : (ownLines.data ?? 0);
  const [moveAssets, setMoveAssets] = React.useState(true);
  // Unlink asks first; keeping the sheet's assets on the task is the default.
  const [unlinkOpen, setUnlinkOpen] = React.useState(false);
  const [keepOnUnlink, setKeepOnUnlink] = React.useState(true);
  // A sheet nobody has started is given the asset columns rather than mapped.
  const fresh = !sheet.itemId && isFreshSheet(sheet);
  const [query, setQuery] = React.useState("");
  const hits = useTaskSearch(query, !sheet.itemId && !presetItem);
  const task = sheet.itemId ? linked.item : chosen;
  // Rows that are not assets (a repeated header, a section label, a total): sections become bands, the rest are left out.
  const detected = React.useMemo(() => detectNonAssetRows(shown, mapping), [shown, mapping]);
  const [handleDetected, setHandleDetected] = React.useState(true);
  // Rows marked by hand (Mark rows): they win over what was spotted and over rows left out before.
  const [marks, setMarks] = React.useState<Record<string, RowMark>>({});
  const [marking, setMarking] = React.useState(false);
  const savedIgnore = mapping.ignoreRows;
  const spottedRows = React.useMemo(() => (handleDetected ? detected : []), [handleDetected, detected]);
  const plan = React.useMemo(() => nonAssetPlan(shown, savedIgnore ?? [], spottedRows, marks), [shown, savedIgnore, spottedRows, marks]);
  const bandIds = plan.bandIds;
  const previewSheet = React.useMemo(() => (bandIds.length ? TrackerService.setRowKind(shown, bandIds, "section") : shown), [shown, bandIds]);
  const effectiveMapping = React.useMemo<TrackerAssetMapping>(() => ({ ...mapping, ignoreRows: plan.ignoreRows }), [mapping, plan.ignoreRows]);
  const lines = React.useMemo(() => (isMappingUsable(effectiveMapping) ? sheetAssetLines(previewSheet, effectiveMapping) : []), [previewSheet, effectiveMapping]);
  // Choosing columns on the sheet itself, in a pop-up of their own: off unless asked for, remembered in this browser.
  // The part whose column is being chosen on the sheet, when the pop-up is open.
  const [picking, setPicking] = React.useState<PickRequest | null>(null);
  const onSheet = (role: SinglePart) => () => setPicking(pickerFor(role));
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
  // A column that does not fit its part waits here: clear what it cannot read, choose another, make a new one, or cancel.
  const [fitCheck, setFitCheck] = React.useState<FitCheck | null>(null);
  const choose = (role: SinglePart) => (columnId: string | null) => {
    const check = columnId ? fitCheckFor(shown, columnId, role, mapping) : null;
    if (check) return setFitCheck(check);
    pick(role)(columnId);
  };
  const pickerFor = (role: SinglePart): PickRequest => ({
    label: PART_LABELS[role],
    role,
    value: role === "name" ? mapping.name : mapping[role].columnId,
    allowNone: role !== "name",
    onChoose: choose(role),
    onCreate: newColumn(role),
  });

  const save = async () => {
    // Section labels first become bands, so the lines come out in their blocks.
    if (!fresh && bandIds.length) await mutations.bandRows.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, rowIds: bandIds });
    const saving = fresh ? mapping : effectiveMapping;
    if (sheet.itemId) await mutations.setMapping.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, mapping: saving });
    else if (chosen)
      await mutations.link.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, itemId: chosen.id, mapping: saving, moveAssets: movable > 0 && moveAssets, setUpColumns: fresh, assetTypes: assetTypes.map((t) => t.name) });
    onClose();
    if (!sheet.itemId && chosen) afterLink?.();
  };

  const listCol = mapping.done.columnId ? columns.find((c) => c.id === mapping.done.columnId) : null;
  const warn = (columnId: string | null, role: AssetRole) => {
    const mismatch = columnId ? roleMismatch(shown, columnId, role, trackerPeople()) : null;
    return mismatch ? (
      <p className="text-xs text-amber-700 dark:text-amber-400" data-testid={`map-warning-${role}`}>
        {mismatchText(mismatch)}
      </p>
    ) : null;
  };

  return (
    <>
      <ConfirmDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        title={`Unlink “${sheet.name}”?`}
        description="The sheet keeps its rows."
        confirmLabel="Unlink"
        onConfirm={async () => {
          await mutations.unlink.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, keepAssets: keepOnUnlink });
          setUnlinkOpen(false);
          onClose();
        }}
      >
        {task && <KeepAssetsSwitch taskNames={[task.name]} keep={keepOnUnlink} onKeep={setKeepOnUnlink} />}
      </ConfirmDialog>
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
                onClick={() => {
                  setKeepOnUnlink(true);
                  setUnlinkOpen(true);
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
        <section className="min-w-0 space-y-2" data-testid="task-assets-sheet">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">The sheet</h3>
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
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span data-testid="task-assets-rows-summary">{rowsSummary(plan, Object.keys(marks).length)}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setMarking(true)} data-testid="task-assets-mark-rows">
              <ListChecks /> Mark rows
            </Button>
          </div>
        </section>
        <RowMarkDialog open={marking} sheet={shown} mapping={mapping} savedIgnore={savedIgnore ?? []} detected={spottedRows} marks={marks} onApply={setMarks} onClose={() => setMarking(false)} />
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Where each part comes from</h3>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 max-sm:grid-cols-2" data-testid="task-assets-parts">
          <span aria-hidden className="max-sm:hidden" />
          <span className="text-2xs text-muted-foreground">Sheet column</span>
          <span className="text-2xs text-muted-foreground">If the cell is empty</span>
          <FieldRow
            label="Asset name"
            column={<ColumnSelect columns={columns} value={mapping.name} onChange={choose("name")} onCreate={newColumn("name")} none="Choose a column" testId="map-name" onPickOnSheet={onSheet("name")} />}
            fallback={
              <Input
                value={mapping.nameValue ?? ""}
                onChange={(e) => set({ nameValue: e.target.value.slice(0, 500) || null })}
                placeholder="Custom name, or skip the row"
                aria-label={mapping.name ? "Name when a cell is empty" : "Name for every row"}
                className="h-8 w-full min-w-0 max-md:h-10"
                data-testid="map-name-value"
              />
            }
          >
            {warn(mapping.name, "name")}
          </FieldRow>
          <FieldRow
            label="Type"
            column={<ColumnSelect columns={columns} value={mapping.type.columnId} onChange={choose("type")} onCreate={newColumn("type")} none="No column" testId="map-type" onPickOnSheet={onSheet("type")} />}
            fallback={
              <select
                value={mapping.type.value ?? ""}
                onChange={(e) => set({ type: { ...mapping.type, value: e.target.value || null } })}
                className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-[13px] max-md:h-10"
                aria-label={mapping.type.columnId ? "Type when a cell is empty" : "Type for every row"}
                data-testid="map-type-value"
              >
                <option value="">None</option>
                {assetTypes.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            }
          >
            {warn(mapping.type.columnId, "type")}
          </FieldRow>
          <FieldRow
            label="Quantity"
            column={<ColumnSelect columns={columns} value={mapping.quantity.columnId} onChange={choose("quantity")} onCreate={newColumn("quantity")} none="No column" testId="map-quantity" onPickOnSheet={onSheet("quantity")} />}
            fallback={
              <Input
                type="number"
                min={0}
                value={mapping.quantity.value ?? ""}
                onChange={(e) => set({ quantity: { ...mapping.quantity, value: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) } })}
                placeholder="1"
                aria-label={mapping.quantity.columnId ? "Quantity when a cell is empty" : "Quantity for every row"}
                className="h-8 w-full min-w-0 max-md:h-10"
              />
            }
          >
            {warn(mapping.quantity.columnId, "quantity")}
          </FieldRow>
          <FieldRow
            label="PIC"
            column={<ColumnSelect columns={columns} value={mapping.pic.columnId} onChange={choose("pic")} onCreate={newColumn("pic")} none="No column" testId="map-pic" onPickOnSheet={onSheet("pic")} />}
            fallback={<PeopleValue users={ws.activeUsers} value={mapping.pic.value ?? []} onChange={(value) => set({ pic: { ...mapping.pic, value: value.length ? value : null } })} placeholder="Nobody" />}
          >
            {warn(mapping.pic.columnId, "pic")}
          </FieldRow>
          <FieldRow
            label="Due date"
            column={<ColumnSelect columns={columns} value={mapping.due.columnId} onChange={choose("due")} onCreate={newColumn("due")} none="No column" testId="map-due" onPickOnSheet={onSheet("due")} />}
            fallback={<Input type="date" value={mapping.due.value ?? ""} onChange={(e) => set({ due: { ...mapping.due, value: e.target.value || null } })} aria-label={mapping.due.columnId ? "Due date when a cell is empty" : "Due date for every row"} className="h-8 w-full min-w-0 max-md:h-10" />}
          >
            {warn(mapping.due.columnId, "due")}
          </FieldRow>
          <FieldRow
            label="Done"
            column={<ColumnSelect columns={columns} value={mapping.done.columnId} onChange={choose("done")} onCreate={newColumn("done")} none="Nothing counts as done" testId="map-done" onPickOnSheet={onSheet("done")} />}
            // Fixed: an empty cell is a line not done yet.
            fallback={<span className="flex h-8 w-full min-w-0 items-center rounded-md border border-dashed border-border px-2 text-[13px] text-muted-foreground max-md:h-10">Not done</span>}
          >
            {warn(mapping.done.columnId, "done")}
            {listCol && listCol.type !== "list" && listCol.type !== "checkbox" && <p className="text-2xs text-muted-foreground">Done, Delivered, Approved and the like count as done.</p>}
            {listCol?.type === "list" && (
              <div className="space-y-1">
              <p className="text-2xs text-muted-foreground">These count as done</p>
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
              </div>
            )}
          </FieldRow>
          <FieldRow label="Spec" hint="Shown under each asset's name, in this order. Click a column to add it, click again to take it out." wide={<SpecChips columns={columns} hidden={new Set([...taken, ...mapping.links])} value={mapping.spec} onChange={(spec) => set({ spec })} />} />
          <FieldRow label="Links" hint="Columns holding links to files or drafts." wide={<ColumnChips columns={columns} hidden={new Set([...taken, ...mapping.spec])} value={mapping.links} onChange={(links) => set({ links })} />} />
          </div>
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

      <ColumnPickerDialog request={picking} sheet={previewSheet} mapping={effectiveMapping} bandIds={bandIds} onClose={() => setPicking(null)} />
      <ColumnFitPrompt
        check={fitCheck}
        busy={mutations.fitColumn.isPending}
        onFix={async () => {
          if (!fitCheck) return;
          await mutations.fitColumn.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, columnId: fitCheck.column.id, role: fitCheck.role });
          pick(fitCheck.role)(fitCheck.column.id);
          setFitCheck(null);
        }}
        onOther={() => {
          if (fitCheck && fitCheck.role !== "link") setPicking(pickerFor(fitCheck.role));
          setFitCheck(null);
        }}
        onNew={() => {
          if (fitCheck) void newColumn(fitCheck.role)().catch(() => undefined);
          setFitCheck(null);
        }}
        onCancel={() => setFitCheck(null)}
      />

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

/** The parts one column plays alone (spec and links take several). */
type SinglePart = Exclude<AssetRole, "spec" | "link">;

/** What each part is called where its column is chosen. */
const PART_LABELS: Record<SinglePart, string> = { name: "Asset name", type: "Type", quantity: "Quantity", pic: "PIC", due: "Due date", done: "Done" };

/** A column chosen for a part it does not fit, with what is wrong with it. */
export interface FitCheck {
  role: Exclude<AssetRole, "spec">;
  column: TrackerColumn;
  mismatch: RoleMismatch;
  /** A few of the values the part cannot read, as they show. */
  samples: string[];
  /** The part the column plays now, when another: clearing it takes from that part too. */
  plays: AssetRole | null;
}

/** The check for a column chosen for a part, or null when it fits. */
export function fitCheckFor(sheet: Pick<TrackerSheet, "columns" | "rows">, columnId: string, role: Exclude<AssetRole, "spec">, mapping?: TrackerAssetMapping | null): FitCheck | null {
  const column = sheet.columns.find((c) => c.id === columnId);
  const mismatch = column ? roleMismatch(sheet, columnId, role, trackerPeople()) : null;
  if (!column || !mismatch) return null;
  const show = (value: TrackerCellValue | undefined) =>
    value === true ? "✓" : column.type === "person" ? personIds(value).map((id) => trackerPersonName(id)).join(", ") : String(value ?? "").trim();
  const ids = new Set(mismatch.rowIds);
  const samples = [...new Set(sheet.rows.filter((r) => ids.has(r.id)).map((r) => show(r.cells[columnId])))].filter(Boolean);
  const plays = assetRoleOf(mapping, columnId);
  return { role, column, mismatch, samples, plays: plays && plays !== role ? plays : null };
}

/**
 * A column that does not fit the part it was chosen for, and the ways out:
 * clear the cells the part cannot read (turning the column into the part's
 * type when its own cannot hold it), choose another column, make a new one,
 * or leave things as they were.
 */
export function ColumnFitPrompt({
  check,
  busy,
  onFix,
  onOther,
  onNew,
  onCancel,
}: {
  check: FitCheck | null;
  busy: boolean;
  onFix: () => Promise<void>;
  onOther: () => void;
  onNew: () => void;
  onCancel: () => void;
}) {
  const m = check?.mismatch;
  const type = check && m?.wrongType ? TRACKER_COLUMN_TYPE_LABELS[fitTypeFor(check.role)] : null;
  const cells = m ? `${m.unreadable} ${m.unreadable === 1 ? "cell" : "cells"}` : "";
  const fixLabel = !m ? "" : m.unreadable && type ? `Clear ${cells} and make it a ${type} column` : m.unreadable ? `Clear ${cells}` : `Make it a ${type} column`;
  const part = check ? (check.role === "pic" ? "PIC" : ASSET_ROLE_LABELS[check.role].toLowerCase()) : "";
  return (
    <Dialog open={!!check} onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent size="sm" data-testid="column-fit-prompt">
        {check && m && (
          <>
            <DialogHeader>
              <DialogTitle>
                “{check.column.name}” doesn’t fit {part}
              </DialogTitle>
              <DialogDescription>
                {m.wrongType && `A ${TRACKER_COLUMN_TYPE_LABELS[m.wrongType]} column can’t hold ${m.expected}. `}
                {m.unreadable > 0 && `${m.unreadable === m.filled ? (m.filled === 1 ? "Its one filled cell isn’t" : `All ${m.filled} filled cells aren’t`) : `${m.unreadable} of ${m.filled} filled cells aren’t`} ${m.expected}.`}
              </DialogDescription>
            </DialogHeader>
            {check.samples.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="column-fit-samples">
                {check.samples.slice(0, 5).map((s) => (
                  <span key={s} className="max-w-48 truncate rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-200">
                    {s}
                  </span>
                ))}
                {check.samples.length > 5 && <span className="px-1 py-0.5 text-xs text-muted-foreground">+{check.samples.length - 5} more</span>}
              </div>
            )}
            <div className="grid gap-2">
              <Button type="button" disabled={busy} onClick={() => void onFix().catch(() => undefined)} data-testid="column-fit-fix">
                {busy && <Loader2 className="animate-spin" />}
                {fixLabel}
              </Button>
              {check.role !== "link" && (
                <Button type="button" variant="outline" disabled={busy} onClick={onOther} data-testid="column-fit-other">
                  <Table2 /> Choose another column
                </Button>
              )}
              <Button type="button" variant="outline" disabled={busy} onClick={onNew} data-testid="column-fit-new">
                <Plus /> New column
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={onCancel} data-testid="column-fit-cancel">
                Cancel
              </Button>
            </div>
            {m.unreadable > 0 && (
              <p className={cn("text-2xs", check.plays ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")} data-testid="column-fit-note">
                Clearing empties those cells in the sheet.
                {check.plays && ` It’s the ${check.plays === "pic" ? "PIC" : ASSET_ROLE_LABELS[check.plays].toLowerCase()} column now, so that loses them too.`}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One part's column, chosen on the sheet. */
interface PickRequest {
  label: string;
  role: AssetRole;
  value: string | null;
  /** Whether the part can have no column (all but the asset name). */
  allowNone: boolean;
  onChoose: (columnId: string | null) => void;
  onCreate?: () => Promise<void>;
}

/**
 * The sheet in full, for choosing one part's column on it: pointing at a
 * column lights it up, clicking chooses it, and nothing changes until "Use".
 * A pop-up of its own over the settings, so the sheet has the room.
 */
function ColumnPickerDialog({ request, sheet, mapping, bandIds, onClose }: { request: PickRequest | null; sheet: TrackerSheet; mapping: TrackerAssetMapping; bandIds: readonly string[]; onClose: () => void }) {
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl" className="max-w-[min(96vw,1400px)]" data-testid="column-picker-dialog">
        {request && <ColumnPickerBody key={request.label} request={request} sheet={sheet} mapping={mapping} bandIds={bandIds} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ColumnPickerBody({ request, sheet, mapping, bandIds, onClose }: { request: PickRequest; sheet: TrackerSheet; mapping: TrackerAssetMapping; bandIds: readonly string[]; onClose: () => void }) {
  const [chosen, setChosen] = React.useState<string | null>(request.value);
  const [hover, setHover] = React.useState<string | null>(null);
  const index = sheet.columns.findIndex((c) => c.id === chosen);
  // What the column under the pointer, else the chosen one, gives this part: a type it cannot use, cells it cannot read.
  const focus = hover ?? chosen;
  const focusIndex = sheet.columns.findIndex((c) => c.id === focus);
  const fit = React.useMemo(() => (focus ? roleMismatch(sheet, focus, request.role, trackerPeople()) : null), [sheet, focus, request.role]);
  const flagged = React.useMemo(() => (focus && fit ? { columnId: focus, rowIds: new Set(fit.rowIds) } : null), [focus, fit]);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{request.label}: choose a column</DialogTitle>
        <DialogDescription>Point at a column to see it, click to choose it.</DialogDescription>
      </DialogHeader>
      <p className={cn("flex min-h-5 items-start gap-1.5 text-xs", fit ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")} aria-live="polite" data-testid="column-picker-fit">
        {focusIndex >= 0 && (
          <>
            {fit ? <AlertTriangle className="mt-px size-3.5 shrink-0" /> : <Check className="mt-px size-3.5 shrink-0" />}
            <span>
              <span className="font-medium">
                {columnLetter(focusIndex)} · {sheet.columns[focusIndex]!.name}:
              </span>{" "}
              {fit ? mismatchText(fit) : "every filled cell reads."}
            </span>
          </>
        )}
      </p>
      <SheetPreview sheet={sheet} mapping={mapping} peek={hover} bandIds={bandIds} selected={chosen} flagged={flagged} onHover={setHover} onPick={setChosen} />
      <DialogFooter className="items-center gap-2 sm:justify-between">
        <div className="flex gap-1">
          {request.allowNone && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                request.onChoose(null);
                onClose();
              }}
              data-testid="column-picker-none"
            >
              No column
            </Button>
          )}
          {request.onCreate && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                void request.onCreate?.().catch(() => undefined);
                onClose();
              }}
              data-testid="column-picker-new"
            >
              <Plus /> New column
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!chosen}
            onClick={() => {
              request.onChoose(chosen);
              onClose();
            }}
            data-testid="column-picker-use"
          >
            {index >= 0 ? `Use column ${columnLetter(index)} · ${sheet.columns[index]!.name}` : "Choose a column"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

/** "2 rows left out, 1 becomes a band · 3 marked by hand" */
function rowsSummary(plan: { bandIds: readonly string[]; ignoreRows: readonly string[] }, byHand: number): string {
  const parts: string[] = [];
  if (plan.ignoreRows.length) parts.push(`${plan.ignoreRows.length} ${plan.ignoreRows.length === 1 ? "row" : "rows"} left out`);
  if (plan.bandIds.length) parts.push(`${plan.bandIds.length} ${plan.bandIds.length === 1 ? "becomes a band" : "become bands"}`);
  const text = parts.length ? parts.join(", ") : "Every row is an asset";
  return byHand ? `${text} · ${byHand} marked by hand` : text;
}

/**
 * The sheet in full, for marking rows by hand: select rows (shift for a range)
 * and make them assets, leave them out (they stay in the sheet) or make them
 * bands. Nothing changes until Done; the dialog's Save then applies it.
 */
function RowMarkDialog({
  open,
  onClose,
  ...body
}: {
  open: boolean;
  sheet: TrackerSheet;
  mapping: TrackerAssetMapping;
  savedIgnore: readonly string[];
  detected: ReadonlyArray<{ rowId: string; kind: "header" | "section" | "total" }>;
  marks: Record<string, RowMark>;
  onApply: (marks: Record<string, RowMark>) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl" className="max-w-[min(96vw,1400px)]" data-testid="row-mark-dialog">
        {open && <RowMarkBody {...body} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function RowMarkBody({
  sheet,
  mapping,
  savedIgnore,
  detected,
  marks,
  onApply,
  onClose,
}: {
  sheet: TrackerSheet;
  mapping: TrackerAssetMapping;
  savedIgnore: readonly string[];
  detected: ReadonlyArray<{ rowId: string; kind: "header" | "section" | "total" }>;
  marks: Record<string, RowMark>;
  onApply: (marks: Record<string, RowMark>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState(marks);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());
  const anchor = React.useRef<string | null>(null);
  const plan = React.useMemo(() => nonAssetPlan(sheet, savedIgnore, detected, draft), [sheet, savedIgnore, detected, draft]);
  const preview = React.useMemo(() => (plan.bandIds.length ? TrackerService.setRowKind(sheet, plan.bandIds, "section") : sheet), [sheet, plan.bandIds]);
  const previewMapping = React.useMemo(() => ({ ...mapping, ignoreRows: plan.ignoreRows }), [mapping, plan.ignoreRows]);
  // The rows that can be marked, in sheet order: data rows with something in them.
  const rows = React.useMemo(() => sheet.rows.filter((r) => r.kind === "data" && Object.values(r.cells).some((v) => v !== null && v !== "" && v !== false)), [sheet.rows]);
  const onRow = (id: string, shift: boolean) => {
    const next = new Set(selected);
    const from = shift && anchor.current ? rows.findIndex((r) => r.id === anchor.current) : -1;
    const to = rows.findIndex((r) => r.id === id);
    if (from >= 0 && to >= 0) for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(rows[i]!.id);
    else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
      anchor.current = id;
    }
    setSelected(next);
  };
  const bandable = [...selected].every((id) => {
    const row = rows.find((r) => r.id === id);
    return !row || canBeBand(row);
  });
  const mark = (m: RowMark) => {
    setDraft((d) => ({ ...d, ...Object.fromEntries([...selected].map((id) => [id, m])) }));
    setSelected(new Set());
  };
  const byHand = Object.keys(draft).length;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark rows</DialogTitle>
        <DialogDescription>Rows left out stay in the sheet. A band groups the rows under it.</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-8 flex-wrap items-center gap-2 text-xs" data-testid="row-mark-actions">
        {selected.size > 0 ? (
          <>
            <span className="font-medium">
              {selected.size} {selected.size === 1 ? "row" : "rows"}:
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => mark("asset")} data-testid="row-mark-asset">
              Asset
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => mark("skip")} data-testid="row-mark-skip">
              Leave out
            </Button>
            <span title={bandable ? undefined : "Only a row with one value can become a band"}>
              <Button type="button" size="sm" variant="outline" disabled={!bandable} onClick={() => mark("band")} data-testid="row-mark-band">
                Band
              </Button>
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground">
            {rowsSummary(plan, byHand)} · Click rows to select them, shift-click for a range.
          </span>
        )}
      </div>
      <SheetPreview sheet={preview} mapping={previewMapping} peek={null} bandIds={plan.bandIds} rowSelect={{ selected, onRow }} />
      <DialogFooter className="items-center gap-2 sm:justify-between">
        <div>
          {byHand > 0 && (
            <Button type="button" variant="ghost" onClick={() => setDraft({})} data-testid="row-mark-reset">
              Undo my marks
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            data-testid="row-mark-done"
          >
            Done
          </Button>
        </div>
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
function SheetPreview({
  sheet,
  mapping,
  peek,
  bandIds,
  selected = null,
  flagged = null,
  rowSelect,
  onHover,
  onPick,
}: {
  sheet: TrackerSheet;
  mapping: TrackerAssetMapping;
  peek: string | null;
  bandIds: readonly string[];
  selected?: string | null;
  /** Cells of one column the part being picked cannot read, marked. */
  flagged?: { columnId: string; rowIds: ReadonlySet<string> } | null;
  /** Rows are chosen instead of columns (Mark rows): click one, shift-click for a range. */
  rowSelect?: { selected: ReadonlySet<string>; onRow: (id: string, shift: boolean) => void };
  onHover?: (id: string | null) => void;
  onPick?: (id: string) => void;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  // Where the column under the pointer sits, for the box drawn round it top to bottom.
  const [box, setBox] = React.useState<{ id: string; left: number; width: number } | null>(null);
  const measure = (id: string) => {
    const th = scroller.current?.querySelector<HTMLElement>(`th[data-column="${id}"]`);
    setBox(th ? { id, left: th.offsetLeft, width: th.offsetWidth } : null);
  };
  const ignored = new Set(mapping.ignoreRows ?? []);
  const spotted = new Set(bandIds);
  const filled = sheet.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind !== "data" || Object.values(row.cells).some((v) => v !== null && v !== "" && v !== false));
  const full = !!onPick || !!rowSelect;
  const shownRows = filled.slice(0, full ? 300 : 14);
  const selectable = (id: string, canSelect = true) =>
    rowSelect && canSelect
      ? {
          onClick: (e: React.MouseEvent) => rowSelect.onRow(id, e.shiftKey),
          "aria-selected": rowSelect.selected.has(id),
          "data-row-id": id,
        }
      : {};
  const picked = (id: string) => rowSelect?.selected.has(id) && "!opacity-100 bg-primary/25";
  const pickable = (id: string) =>
    onPick
      ? {
          onMouseEnter: () => {
            onHover?.(id);
            measure(id);
          },
          onClick: () => onPick(id),
          style: { cursor: "pointer" } as React.CSSProperties,
        }
      : {};
  const tint = (id: string) => (selected === id ? "bg-primary/35" : peek === id ? "bg-primary/20" : "");
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
    <div
      ref={scroller}
      className={cn("scrollbar-thin w-full max-w-full min-w-0 overflow-auto rounded-lg border border-border/60", full ? "max-h-[62dvh]" : "max-h-60", rowSelect && "select-none")}
      onMouseLeave={() => onHover?.(null)}
      data-testid="task-assets-preview-sheet"
    >
      <div className="relative w-max min-w-full">
      {box && box.id === peek && (
        <div
          aria-hidden
          className={cn("pointer-events-none absolute inset-y-0 z-20 rounded-sm border-2", flagged?.columnId === box.id ? "border-amber-500" : "border-primary")}
          style={{ left: box.left, width: box.width }}
          data-testid="preview-column-box"
        />
      )}
      <table className="w-max min-w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th className="w-7 border-b border-border/60" />
            {sheet.columns.map((c, index) => {
              const roles = ROLE_TAGS.filter((r) => r.has(mapping, c.id)).map((r) => r.label);
              const hot = peek === c.id;
              return (
                <th key={c.id} data-column={c.id} {...pickable(c.id)} className={cn("border-b border-border/60 px-2 py-1 text-left align-bottom font-medium transition-colors", tint(c.id) || (hot ? "bg-primary/20" : roles.length ? "bg-primary/5" : "text-muted-foreground"))}>
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
              <tr key={row.id} data-testid="preview-band" {...selectable(row.id, spotted.has(row.id))} className={cn(rowSelect && spotted.has(row.id) && "cursor-pointer hover:bg-primary/10", picked(row.id))}>
                <td className="border-t border-border/40 px-1 text-center text-[10px] text-muted-foreground">{index + 1}</td>
                <td colSpan={sheet.columns.length} className={cn("border-t border-border/40 bg-surface/70 px-2 py-1 font-semibold", rowSelect?.selected.has(row.id) && "bg-primary/25")}>
                  {row.label || (row.kind === "section" ? "Phase" : "Channel")}
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{spotted.has(row.id) ? "becomes a band" : "band"}</span>
                </td>
              </tr>
            ) : (
              <tr key={row.id} {...selectable(row.id)} className={cn(ignored.has(row.id) && "opacity-40", rowSelect && "cursor-pointer hover:bg-primary/10", picked(row.id))} title={ignored.has(row.id) ? "Left out of the assets" : undefined} data-testid={ignored.has(row.id) ? "preview-left-out" : "preview-row"}>
                <td className="border-t border-border/40 px-1 text-center text-[10px] text-muted-foreground">{index + 1}</td>
                {sheet.columns.map((c) => (
                  <td
                    key={c.id}
                    {...pickable(c.id)}
                    className={cn(
                      "max-w-44 truncate border-t border-border/40 px-2 py-1 transition-colors",
                      tint(c.id),
                      flagged?.columnId === c.id && flagged.rowIds.has(row.id) && "bg-amber-500/25 text-amber-800 underline decoration-amber-500 decoration-wavy dark:text-amber-200",
                    )}
                    data-flagged={flagged?.columnId === c.id && flagged.rowIds.has(row.id) ? "" : undefined}
                  >
                    {show(c, row.cells[c.id])}
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
      </div>
      {filled.length > shownRows.length && <p className="px-2 py-1 text-2xs text-muted-foreground">and {filled.length - shownRows.length} more rows</p>}
    </div>
  );
}

/** The columns a fresh sheet gets when used for a task (assetSheet's, in order). */
const FRESH_COLUMNS = ["Asset", "Type", "Quantity", "Spec", "PIC", "Due date", "Done"];

/** The warning for a column type a role cannot use and cells it cannot read; the sheet keeps them either way. */
export function mismatchText({ unreadable, filled, expected, wrongType }: RoleMismatch): string {
  const parts: string[] = [];
  if (wrongType) parts.push(`A ${TRACKER_COLUMN_TYPE_LABELS[wrongType]} column can’t hold ${expected}, so changes made on the task can’t go back to it.`);
  if (unreadable) {
    const cells = filled === 1 ? "The one filled cell isn’t" : `${unreadable === filled ? `All ${filled}` : `${unreadable} of ${filled}`} filled cells aren’t`;
    parts.push(`${cells} ${expected}. ${unreadable === 1 ? "That asset gets" : "Those assets get"} nothing from ${unreadable === 1 ? "it" : "them"}; the sheet keeps ${unreadable === 1 ? "it" : "them"}.`);
  }
  return parts.join(" ");
}

/**
 * One line of the parts table: the part's name, the sheet column it comes
 * from, and what an empty cell gets instead (with no column chosen, every
 * cell is empty, so that is what every row gets). `wide` spans both columns
 * (the chips of Spec and Links); anything in `children` (a warning, the
 * choices that count as done) goes on a line of its own under the row.
 */
function FieldRow({ label, hint, column, fallback, wide, children }: { label: string; hint?: string; column?: React.ReactNode; fallback?: React.ReactNode; wide?: React.ReactNode; children?: React.ReactNode }) {
  const extra = React.Children.toArray(children);
  return (
    <>
      <span className={cn("flex min-w-0 items-center gap-1 text-[13px] font-medium max-sm:col-span-2 max-sm:mt-1.5", wide && "self-start pt-1")} data-testid={`map-field-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {label}
        {hint && (
          <SimpleTooltip label={hint}>
            <Info className="size-3 shrink-0 text-muted-foreground" aria-label={hint} />
          </SimpleTooltip>
        )}
      </span>
      {column && <div className={cn("flex min-w-0", !fallback && "col-span-2")}>{column}</div>}
      {column && fallback && <div className="flex min-w-0">{fallback}</div>}
      {wide && <div className="col-span-2 min-w-0">{wide}</div>}
      {extra.length > 0 && <div className="col-span-2 col-start-2 min-w-0 space-y-1 max-sm:col-start-1">{extra}</div>}
    </>
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
const PICK_ON_SHEET = "__pick";

/** Any column of the sheet, each with its letter; and, with `onCreate`, a new one made for the part. */
function ColumnSelect({
  columns,
  value,
  onChange,
  onCreate,
  none,
  testId,
  onPickOnSheet,
}: {
  columns: TrackerColumn[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate?: () => Promise<void>;
  none: string;
  testId?: string;
  /** Offered as "Pick on the sheet…": the column chosen by clicking it on a preview of the sheet. */
  onPickOnSheet?: () => void;
}) {
  return (
    <Select
      value={value ?? NO_COLUMN}
      onValueChange={(next) => {
        if (next === NEW_COLUMN) void onCreate?.().catch(() => undefined);
        else if (next === PICK_ON_SHEET) onPickOnSheet?.();
        else onChange(next === NO_COLUMN ? null : next);
      }}
    >
      <SelectTrigger className="h-8 min-w-0 flex-1 rounded-md bg-background px-2 max-md:h-10" aria-label={none} data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {onPickOnSheet && (
          <>
            <SelectItem value={PICK_ON_SHEET} className="font-medium" data-testid={testId ? `${testId}-pick` : undefined}>
              <span className="flex items-center gap-2">
                <Table2 className="size-3.5 shrink-0" aria-hidden />
                Pick on the sheet…
              </span>
            </SelectItem>
            <SelectSeparator />
          </>
        )}
        <SelectItem value={NO_COLUMN} className="text-muted-foreground">
          {none}
        </SelectItem>
        <SelectSeparator />
        {columns.map((c, index) => (
          <SelectItem key={c.id} value={c.id}>
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
function ColumnChips({ columns, hidden, value, onChange }: { columns: TrackerColumn[]; hidden: ReadonlySet<string>; value: string[]; onChange: (ids: string[]) => void }) {
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
function SpecChips({ columns, hidden, value, onChange }: { columns: TrackerColumn[]; hidden: ReadonlySet<string>; value: string[]; onChange: (ids: string[]) => void }) {
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
            <SortableSpecChip key={id} id={id} index={indexOf.get(id) ?? null} name={columns[indexOf.get(id) ?? -1]?.name ?? ""} onRemove={() => onChange(chosen.filter((x) => x !== id))} />
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
          className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 text-xs text-muted-foreground hover:bg-accent"
        >
          <ColumnBadge index={index} />
          {c.name}
        </button>
      ))}
    </div>
  );
}

function SortableSpecChip({ id, index, name, onRemove }: { id: string; index: number | null; name: string; onRemove: () => void }) {
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
        {value.length ? <PeopleCellView value={value.join(",")} users={users} /> : <span className="text-muted-foreground">{placeholder}</span>}
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
