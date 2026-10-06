"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Link2, Loader2, Package, Search, Unlink, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  isMappingUsable,
  personIds,
  personValue,
  setTrackerPeople,
  sheetAssetLines,
  suggestAssetMapping,
  trackerPersonName,
  type Item,
  type TrackerAssetMapping,
  type TrackerColumn,
  type TrackerColumnType,
  type TrackerSheet,
  type User,
} from "@/domain";
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
 */
export function PeopleEditor({ value, users, onCommit, onCancel }: { value: string; users: User[]; onCommit: (value: string | null) => void; onCancel: () => void }) {
  const [chosen, setChosen] = React.useState<string[]>(() => personIds(value));
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

export type AssetRole = "name" | "type" | "quantity" | "pic" | "due" | "done" | "spec" | "link";

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

/** Columns of the right kinds for a part, by name. */
function columnsFor(columns: TrackerColumn[], types: TrackerColumnType[] | null): TrackerColumn[] {
  return types ? columns.filter((c) => types.includes(c.type)) : columns;
}

/**
 * Makes a sheet a task's deliverables, or changes how it is read. The task is
 * picked once; the columns are guessed from their names and every guess can
 * be changed, or replaced by one value for every row ("everything here is
 * Jane's"). A line count underneath says what the task will get.
 */
export function TaskAssetsDialog({ sheet, open, onOpenChange, presetItem }: { sheet: TrackerSheet; open: boolean; onOpenChange: (open: boolean) => void; presetItem?: Item | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90dvh] overflow-y-auto" data-testid="task-assets-dialog">
        {open && <TaskAssetsForm sheet={sheet} presetItem={presetItem ?? null} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TaskAssetsForm({ sheet, presetItem, onClose }: { sheet: TrackerSheet; presetItem: Item | null; onClose: () => void }) {
  const ws = useWorkspace();
  const assetTypes = useWorkspaceList(ws.workspace.id, "ASSET_TYPES");
  const linked = useLinkedTask(sheet);
  const mutations = useSheetAssetMutations();
  const [mapping, setMapping] = React.useState<TrackerAssetMapping>(() => sheet.assetMapping ?? suggestAssetMapping(sheet));
  const [chosen, setChosen] = React.useState<Item | null>(presetItem);
  const [query, setQuery] = React.useState("");
  const hits = useTaskSearch(query, !sheet.itemId && !presetItem);
  const task = sheet.itemId ? linked.item : chosen;
  const lines = React.useMemo(() => (isMappingUsable(mapping) ? sheetAssetLines(sheet, mapping) : []), [sheet, mapping]);
  const units = lines.reduce((sum, l) => sum + (l.quantity ?? 1), 0);
  const people = new Set(lines.flatMap((l) => l.assigneeIds)).size;
  const pending = mutations.link.isPending || mutations.setMapping.isPending || mutations.unlink.isPending;
  // A column plays one part: choosing it for one takes it out of Spec and Links.
  const set = (patch: Partial<TrackerAssetMapping>) =>
    setMapping((m) => {
      const next = { ...m, ...patch };
      const taken = new Set([next.name, next.type.columnId, next.quantity.columnId, next.pic.columnId, next.due.columnId, next.done.columnId].filter(Boolean));
      return { ...next, spec: next.spec.filter((id) => !taken.has(id)), links: next.links.filter((id) => !taken.has(id)) };
    });
  const taken = new Set([mapping.name, mapping.type.columnId, mapping.quantity.columnId, mapping.pic.columnId, mapping.due.columnId, mapping.done.columnId].filter(Boolean));

  const save = async () => {
    if (sheet.itemId) await mutations.setMapping.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, mapping });
    else if (chosen) await mutations.link.mutateAsync({ sheetId: sheet.id, trackerId: sheet.trackerId, itemId: chosen.id, mapping });
    onClose();
  };

  const listCol = mapping.done.columnId ? sheet.columns.find((c) => c.id === mapping.done.columnId) : null;

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

      <section className="space-y-2.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Columns</h3>
        <MapRow label="Asset name">
          <ColumnSelect columns={columnsFor(sheet.columns, ["text", "longText", "list"])} value={mapping.name} onChange={(name) => set({ name })} none="Choose a column" testId="map-name" />
        </MapRow>
        <MapRow label="Type">
          <ColumnSelect columns={columnsFor(sheet.columns, ["list", "text"])} value={mapping.type.columnId} onChange={(columnId) => set({ type: { ...mapping.type, columnId } })} none="No column" testId="map-type" />
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
          <ColumnSelect columns={columnsFor(sheet.columns, ["number"])} value={mapping.quantity.columnId} onChange={(columnId) => set({ quantity: { ...mapping.quantity, columnId } })} none="No column" testId="map-quantity" />
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
        <MapRow label="PIC">
          <ColumnSelect columns={columnsFor(sheet.columns, ["person", "text"])} value={mapping.pic.columnId} onChange={(columnId) => set({ pic: { ...mapping.pic, columnId } })} none="No column" testId="map-pic" />
          <PeopleValue users={ws.activeUsers} value={mapping.pic.value ?? []} onChange={(value) => set({ pic: { ...mapping.pic, value: value.length ? value : null } })} placeholder={mapping.pic.columnId ? "Empty cells" : "Every row"} />
        </MapRow>
        <MapRow label="Due date">
          <ColumnSelect columns={columnsFor(sheet.columns, ["date"])} value={mapping.due.columnId} onChange={(columnId) => set({ due: { ...mapping.due, columnId } })} none="No column" testId="map-due" />
          <Input type="date" value={mapping.due.value ?? ""} onChange={(e) => set({ due: { ...mapping.due, value: e.target.value || null } })} aria-label="Due date for every row" className="h-8 min-w-0 flex-1" />
        </MapRow>
        <MapRow label="Done">
          <ColumnSelect
            columns={columnsFor(sheet.columns, ["checkbox", "list"])}
            value={mapping.done.columnId}
            onChange={(columnId) => {
              const column = sheet.columns.find((c) => c.id === columnId);
              const values = column?.type === "list" ? (column.options ?? []).filter((o) => /^(done|complete|completed|delivered|approved|final|live|published)$/i.test(o)) : [];
              set({ done: { columnId, values } });
            }}
            none="Nothing counts as done"
            testId="map-done"
          />
        </MapRow>
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
          <ColumnChips columns={sheet.columns.filter((c) => c.type !== "checkbox" && c.type !== "person" && c.type !== "url" && !taken.has(c.id))} value={mapping.spec} onChange={(spec) => set({ spec })} />
        </MapRow>
        <MapRow label="Links">
          <ColumnChips columns={columnsFor(sheet.columns, ["url"]).filter((c) => !taken.has(c.id))} value={mapping.links} onChange={(links) => set({ links })} empty="No link columns" />
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

function MapRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 max-sm:grid-cols-1">
      <span className="text-[13px] font-medium">{label}</span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}

function ColumnSelect({ columns, value, onChange, none, testId }: { columns: TrackerColumn[]; value: string | null; onChange: (id: string | null) => void; none: string; testId?: string }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-[13px]" aria-label={none} data-testid={testId}>
      <option value="">{none}</option>
      {columns.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function ColumnChips({ columns, value, onChange, empty = "No columns" }: { columns: TrackerColumn[]; value: string[]; onChange: (ids: string[]) => void; empty?: string }) {
  if (columns.length === 0) return <span className="text-[13px] text-muted-foreground">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {columns.map((c) => {
        const on = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((id) => id !== c.id) : [...value, c.id])}
            className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent")}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

/** People for every row (or every empty cell). */
function PeopleValue({ users, value, onChange, placeholder }: { users: User[]; value: string[]; onChange: (ids: string[]) => void; placeholder: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setOpen(true)} className="flex h-8 w-full items-center gap-1.5 rounded-md border bg-background px-2 text-left text-[13px]" aria-label="PIC for every row" data-testid="map-pic-value">
        {value.length ? <PeopleCellView value={value.join(",")} users={users} /> : <span className="text-muted-foreground">{placeholder}: nobody</span>}
      </button>
      {open && (
        <PeopleEditor
          value={value.join(",")}
          users={users}
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
