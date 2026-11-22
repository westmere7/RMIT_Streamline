"use client";

import { SimpleTooltip } from "@/components/ui/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpToLine, Check, ChevronDown, ChevronRight, ExternalLink, FileSpreadsheet, Link2, Loader2, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { queryKeys } from "@/lib/query/keys";
import { assetPeopleOf, normalizeAssetMapping, planLineMove, sheetLineColumns, specColumnIds, type Item, type ItemAsset, type ItemAssetPatch, type LineMovePlan, type SheetLineField, type TrackerSheet, type User } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useAssetMutations } from "@/features/items/asset-hooks";
import { useItemTrackerSheet, useSheetAssetMutations, useTracker } from "@/features/trackers/hooks";
import { PeopleValue, TaskAssetsDialog } from "@/features/trackers/tracker-asset-ui";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The part of a task's Assets tab that comes from a tracker sheet.
 *
 * A linked sheet's rows are the task's lines: listed here as they are, and
 * ticked off or changed here or in the sheet. A change made here is written to
 * the line's row (see TrackerService.editLine), so the sheet stays the truth.
 * Without a sheet, an editor can pick one, which opens the same asset settings
 * the tracker shows.
 */
export function ItemTrackerSheet({ item, lines, canEdit, filtered = false }: { item: Item; lines: ItemAsset[]; canEdit: boolean; filtered?: boolean }) {
  const linked = useItemTrackerSheet(item.id);
  const sheet = linked.data ?? null;
  const [settings, setSettings] = React.useState<TrackerSheet | null>(null);

  if (linked.isLoading) return null;
  // Under To-do, a sheet with none of the viewer's lines is left out rather than shown empty.
  if (filtered && lines.length === 0) return null;
  // No sheet and no lines: nothing to show here; Tracker, beside Block, picks one.
  // Lines shared in from a linked task's sheet still show, under their own sheet.
  if (!sheet && lines.length === 0) return null;
  return (
    <>
      <SheetSection item={item} sheet={sheet} lines={lines} canEdit={canEdit} onSettings={sheet ? () => setSettings(sheet) : null} />
      {settings && <TaskAssetsDialog sheet={settings} open onOpenChange={(open) => !open && setSettings(null)} />}
    </>
  );
}

/**
 * Keeping the task's assets in a tracker sheet instead: a button beside Block
 * on the Assets tab, picking the sheet and opening its asset settings. Nothing
 * once the task has one.
 */
export function UseTrackerSheetButton({ item, disabled, onLinked }: { item: Item; disabled?: boolean; /** After a sheet is linked: the tab offers the task's assets to move. */ onLinked?: () => void }) {
  const linked = useItemTrackerSheet(item.id);
  const [picking, setPicking] = React.useState(false);
  const [settings, setSettings] = React.useState<TrackerSheet | null>(null);
  if (linked.isLoading || linked.data) return null;
  return (
    <>
      <SimpleTooltip label="Keep this task's assets in a tracker sheet">
        <Button
          type="button"
          variant="outline"
          className="h-auto shrink-0 self-stretch rounded-xl px-2.5 shadow-xs"
          onClick={() => setPicking(true)}
          disabled={disabled}
          aria-label="Use a tracker sheet"
          data-testid="use-tracker-sheet"
        >
          <FileSpreadsheet />
        </Button>
      </SimpleTooltip>
      <PickSheetDialog item={item} open={picking} onOpenChange={setPicking} onPick={(s) => setSettings(s)} onLinked={onLinked} />
      {settings && <TaskAssetsDialog sheet={settings} presetItem={item} open onOpenChange={(open) => !open && setSettings(null)} afterLink={onLinked} />}
    </>
  );
}

/**
 * Beside "Added on this task", while the task has a sheet: moves the assets it
 * shows into it, chosen one by one: its own, and a linked task's (which then
 * become this task's, still shown on both). What happens is set out first
 * (columns added, values the sheet fills in, what cannot travel), and a column
 * that cannot hold what the chosen assets have stops it with nothing written.
 * `open` lets the Assets tab open it straight after a sheet is linked.
 */
export function MoveIntoSheetButton({ item, lines, open: openProp, onOpenChange }: { item: Item; lines: ItemAsset[]; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const linked = useItemTrackerSheet(item.id);
  const sheet = linked.data ?? null;
  const [openState, setOpenState] = React.useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setOpenState(next));
  const movable = React.useMemo(() => lines.filter((l) => !l.trackerSheetId), [lines]);
  if (!sheet || !sheet.assetMapping || movable.length === 0) return null;
  return (
    <>
      <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setOpen(true)} data-testid="move-into-sheet">
        <ArrowUpToLine /> Move into sheet
      </Button>
      {open && <MoveIntoSheetDialog item={item} sheet={sheet} lines={movable} onClose={() => setOpen(false)} />}
    </>
  );
}

function MoveIntoSheetDialog({ item, sheet, lines, onClose }: { item: Item; sheet: TrackerSheet; lines: ItemAsset[]; onClose: () => void }) {
  const ws = useWorkspace();
  const services = useServices();
  const tracker = useTracker(sheet.trackerId);
  const { moveIn } = useSheetAssetMutations();
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(() => new Set(lines.map((l) => l.id)));
  const chosen = React.useMemo(() => lines.filter((l) => picked.has(l.id)), [lines, picked]);
  // Where each linked task's line comes from: its board (linked tasks share a name, so the board is what tells them apart).
  const otherIds = React.useMemo(() => [...new Set(lines.map((l) => l.itemId).filter((id) => id !== item.id))], [lines, item.id]);
  const others = useQuery({
    queryKey: ["move-into-sheet-from", ...otherIds],
    queryFn: async () => new Map((await Promise.all(otherIds.map((id) => services.items.getItem(id).catch(() => null)))).filter((x): x is Item => !!x).map((x) => [x.id, ws.boardById(x.boardId)?.name ?? x.name])),
    enabled: otherIds.length > 0,
    staleTime: 30_000,
  });
  const plan = React.useMemo(() => {
    const mapping = normalizeAssetMapping(sheet.assetMapping, sheet.columns);
    return mapping ? planLineMove(sheet, mapping, chosen, assetPeopleOf(ws.users)) : null;
  }, [sheet, chosen, ws.users]);
  const notes = plan && chosen.length ? movePlanNotes(plan, ws.users) : [];
  const fromLinked = chosen.filter((l) => l.itemId !== item.id).length;
  const blocked = !plan || plan.blockers.length > 0;
  const n = chosen.length;
  const all = picked.size === lines.length;
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Dialog open onOpenChange={(o) => !o && !moveIn.isPending && onClose()}>
      <DialogContent size="md" data-testid="move-into-sheet-dialog">
        <DialogHeader>
          <DialogTitle>Move assets into the sheet</DialogTitle>
          <DialogDescription>
            The ones you tick become rows of {tracker.data?.name ?? "the tracker"} › {sheet.name}, edited there.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <label className="flex items-center gap-2 px-1 text-2xs font-medium text-muted-foreground">
            <Checkbox checked={all ? true : picked.size ? "indeterminate" : false} onCheckedChange={() => setPicked(all ? new Set() : new Set(lines.map((l) => l.id)))} aria-label="Tick every asset" data-testid="move-into-sheet-all" />
            {picked.size} of {lines.length} ticked
          </label>
          <ul className="scrollbar-thin max-h-[40dvh] space-y-0.5 overflow-y-auto rounded-lg border border-border/60 p-1" data-testid="move-into-sheet-lines">
            {lines.map((line) => (
              <li key={line.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent" data-testid="move-into-sheet-line">
                  <Checkbox checked={picked.has(line.id)} onCheckedChange={() => toggle(line.id)} aria-label={line.name} />
                  <span className={cn("min-w-0 flex-1 truncate", line.completedAt && "text-muted-foreground line-through")}>{line.name}</span>
                  {line.itemId !== item.id && (
                    <span className="max-w-[45%] shrink-0 truncate rounded bg-surface-strong/70 px-1.5 py-px text-2xs text-muted-foreground" title="From the linked task on this board: it becomes this task's, and still shows on both">
                      From {others.data?.get(line.itemId) ?? "the linked task"}
                    </span>
                  )}
                  {line.assetType && <span className="shrink-0 text-2xs text-muted-foreground">{line.assetType}</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <ul className="space-y-1.5 text-[13px]" data-testid="move-into-sheet-plan">
          {n > 0 &&
            (plan?.blockers ?? ["Choose the column that names each asset first."]).map((text) => (
              <li key={text} className="flex gap-2 text-destructive" data-testid="move-into-sheet-blocker">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {text}
              </li>
            ))}
          {notes.map((note) => (
            <li key={note.text} className={cn("flex gap-2", note.warn ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")} data-testid={note.warn ? "move-into-sheet-warning" : "move-into-sheet-note"}>
              {note.warn ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />} {note.text}
            </li>
          ))}
          {fromLinked > 0 && (
            <li className="flex gap-2 text-muted-foreground" data-testid="move-into-sheet-linked-note">
              <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {fromLinked === 1 ? "The one from a linked task becomes" : `${fromLinked} from a linked task become`} this task&rsquo;s, still shown on both.
            </li>
          )}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={moveIn.isPending}>
            {n === 0 ? "Close" : "Cancel"}
          </Button>
          <Button
            type="button"
            disabled={n === 0 || blocked || moveIn.isPending}
            onClick={() => moveIn.mutate({ sheetId: sheet.id, trackerId: sheet.trackerId, lineIds: chosen.map((l) => l.id) }, { onSuccess: onClose })}
            data-testid="move-into-sheet-confirm"
          >
            {moveIn.isPending && <Loader2 className="animate-spin" />} Move {n}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The plan in a line each: plain notes, and amber ones for what will not stay exactly as it is. */
function movePlanNotes(plan: LineMovePlan, users: readonly User[]): Array<{ text: string; warn: boolean }> {
  const out: Array<{ text: string; warn: boolean }> = [];
  out.push({ text: "Each keeps its dates.", warn: false });
  if (plan.newColumns.length) out.push({ text: `Adds ${plan.newColumns.length === 1 ? "a column" : "columns"}: ${plan.newColumns.join(", ")}.`, warn: false });
  const label = { type: "type", quantity: "quantity", pic: "PIC", due: "due date" } as const;
  for (const fill of plan.fills) {
    const value = Array.isArray(fill.value)
      ? fill.value.map((id) => users.find((u) => u.id === id)?.displayName ?? "someone").join(", ")
      : fill.part === "due"
        ? formatShortDate(String(fill.value))
        : String(fill.value);
    out.push({ text: `${fill.count} with no ${label[fill.part]} will read as ${value}, as the sheet's rows do.`, warn: true });
  }
  if (plan.renamedLinks) out.push({ text: `${plan.renamedLinks} ${plan.renamedLinks === 1 ? "link takes" : "links take"} its column's name.`, warn: true });
  if (plan.unnamedPeople) out.push({ text: `${plan.unnamedPeople.count} ${plan.unnamedPeople.count === 1 ? "person" : "people"} can't be written into “${plan.unnamedPeople.column}” and will be dropped.`, warn: true });
  if (plan.blockLinks.length) out.push({ text: `Links on ${plan.blockLinks.join(", ")} won't show in the sheet.`, warn: true });
  return out;
}

function SheetSection({ item, sheet, lines, canEdit, onSettings }: { item: Item; sheet: TrackerSheet | null; lines: ItemAsset[]; canEdit: boolean; onSettings: (() => void) | null }) {
  const ws = useWorkspace();
  const tracker = useTracker(sheet?.trackerId ?? null);
  const mutations = useAssetMutations(item);
  // What a line can have changed here: the parts a column of the sheet gives.
  const editable = React.useMemo(() => (sheet && canEdit ? sheetLineColumns(sheet.assetMapping) : {}), [sheet, canEdit]);
  // Spec or links from several columns are shown as they read, and changed in the sheet.
  const specColumn = sheet?.assetMapping && specColumnIds(sheet.assetMapping).length === 1 ? (sheet.columns.find((c) => c.id === editable.notes) ?? null) : null;
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = useSheetCollapsed(sheet?.id ?? `shared-${item.id}`);
  const done = lines.filter((l) => l.completedAt).length;
  const units = lines.reduce((sum, l) => sum + (l.quantity ?? 1), 0);
  const groups: Array<{ name: string | null; lines: ItemAsset[] }> = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.name === (line.blockName ?? null)) last.lines.push(line);
    else groups.push({ name: line.blockName ?? null, lines: [line] });
  }
  const href = sheet ? routes.tracker(ws.slug, sheet.trackerId, sheet.id) : null;
  return (
    // Tinted and marked as a sheet, so its lines are not mistaken for the ones added on the task below.
    <section className="mb-4 overflow-hidden rounded-lg border border-emerald-600/30 bg-emerald-600/[0.03] dark:border-emerald-400/25 dark:bg-emerald-400/[0.04]" data-testid="tracker-sheet-section">
      <header className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 border-emerald-600/20 bg-emerald-600/[0.06] px-3 py-2 text-[13px] dark:border-emerald-400/20 dark:bg-emerald-400/[0.07]", !collapsed && "border-b")}>
        <Button
          size="icon-xs"
          variant="ghost"
          className="-ml-1"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show the sheet's assets" : "Hide the sheet's assets"}
          onClick={() => setCollapsed(!collapsed)}
          data-testid="tracker-sheet-collapse"
        >
          <ChevronDown className={cn("transition-transform", collapsed && "-rotate-90")} />
        </Button>
        <FileSpreadsheet className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
        <span className="shrink-0 rounded bg-emerald-600/15 px-1.5 py-px text-2xs font-semibold text-emerald-800 uppercase dark:bg-emerald-400/15 dark:text-emerald-300">Sheet</span>
        <span className="min-w-0 truncate font-medium">{sheet ? `${tracker.data?.name ?? "Tracker"} › ${sheet.name}` : "From a linked task's tracker sheet"}</span>
        <span className="text-muted-foreground tabular">
          · {done}/{lines.length} done · {units} {units === 1 ? "unit" : "units"}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {href && (
            <Button size="sm" variant="ghost" className="h-7" asChild>
              <Link href={href} data-testid="open-tracker-sheet">
                <ExternalLink /> Open sheet
              </Link>
            </Button>
          )}
          {canEdit && onSettings && (
            <Button size="icon-sm" variant="ghost" aria-label="Asset settings" onClick={onSettings} data-testid="tracker-sheet-settings">
              <Settings2 />
            </Button>
          )}
        </span>
      </header>
      {collapsed ? null : lines.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-muted-foreground">No rows in the sheet read as assets yet.</p>
      ) : (
        // Laid out as the task's own list is: a number in the margin, a card a line.
        <ul className="space-y-1.5 px-1.5 py-2" data-testid="tracker-sheet-lines">
          {groups.map((group, g) => (
            <React.Fragment key={`${group.name}-${g}`}>
              {group.name && <li className={cn("pr-1 pb-0.5 pl-[1.5rem] text-2xs font-semibold tracking-wide text-muted-foreground uppercase", g > 0 && "pt-1.5")}>{group.name}</li>}
              {group.lines.map((line) => (
                <SheetLine
                  key={line.id}
                  number={lines.indexOf(line) + 1}
                  line={line}
                  canEdit={canEdit}
                  editable={editable}
                  specColumnName={specColumn?.name ?? null}
                  open={openId === line.id}
                  onOpen={(open) => setOpenId(open ? line.id : null)}
                  onToggle={() => mutations.update.mutate({ id: line.id, patch: { completedAt: line.completedAt ? null : new Date().toISOString() } })}
                  onSave={(patch) => {
                    mutations.update.mutate({ id: line.id, patch });
                    setOpenId(null);
                  }}
                />
              ))}
            </React.Fragment>
          ))}
        </ul>
      )}
      {!collapsed && Object.keys(editable).length === 0 && <p className="border-t px-3 py-1.5 text-2xs text-muted-foreground">Change these in the sheet. Ticking one here ticks its row there.</p>}
    </section>
  );
}

/** Whether this viewer folded a sheet's section away, remembered in the browser per sheet. */
function useSheetCollapsed(key: string): [boolean, (collapsed: boolean) => void] {
  const storageKey = `streamline:sheet-collapsed:${key}`;
  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setCollapsed(next);
    try {
      if (next) window.localStorage.setItem(storageKey, "1");
      else window.localStorage.removeItem(storageKey);
    } catch {
      // Storage off: it stays folded until the panel closes.
    }
  };
  return [collapsed, set];
}

function SheetLine({
  number,
  line,
  canEdit,
  editable,
  specColumnName,
  open,
  onOpen,
  onToggle,
  onSave,
}: {
  number: number;
  line: ItemAsset;
  canEdit: boolean;
  editable: Partial<Record<SheetLineField, string>>;
  specColumnName: string | null;
  open: boolean;
  onOpen: (open: boolean) => void;
  onToggle: () => void;
  onSave: (patch: ItemAssetPatch) => void;
}) {
  const ws = useWorkspace();
  const people = line.assigneeIds.map((id) => ws.users.find((u) => u.id === id) ?? null);
  const finished = !!line.completedAt;
  // Opens to change what a column gives, or to read a spec and links the row is too narrow for.
  const opens = Object.keys(editable).some((field) => field !== "completedAt") || !!line.notes || line.links.length > 0;
  const overdue = !finished && isOverdue(line.dueDate);
  const count = line.quantity ?? 1;
  const meta = (
    <>
      {count > 1 && <span className="rounded bg-muted/70 px-1 py-px text-[10px] font-medium tabular text-muted-foreground">×{count}</span>}
      {line.assetType && <span className="max-w-32 truncate">{line.assetType}</span>}
      {people.length > 0 && (
        <span className="flex -space-x-1">
          {people.slice(0, 3).map((user, i) => (
            <UserAvatar key={line.assigneeIds[i]} user={user} size="xs" className="size-4.5 text-[8px] ring-1" />
          ))}
        </span>
      )}
      {line.dueDate && <span className={cn("tabular", overdue && "font-medium text-red-600 dark:text-red-400")}>{formatShortDate(line.dueDate)}</span>}
    </>
  );
  const hasMeta = count > 1 || !!line.assetType || people.length > 0 || !!line.dueDate;
  return (
    <li className="flex items-stretch gap-1.5" data-testid="tracker-sheet-line">
      <span className="w-4 shrink-0 pt-3 pr-0.5 text-right text-2xs font-medium tabular text-muted-foreground/60 @max-[28rem]/assets:hidden" aria-hidden>
        {number}
      </span>
      <div className={cn("min-w-0 flex-1 rounded-xl border border-border/70 bg-card shadow-xs", finished && "bg-card/60", open && "border-border ring-1 ring-border/60")}>
        <div className="flex items-center gap-2 px-2.5 py-2 text-[13px]">
          <button
            type="button"
            role="checkbox"
            aria-checked={finished}
            aria-label={finished ? `Open ${line.name} again` : `Mark ${line.name} done`}
            disabled={!canEdit}
            onClick={onToggle}
            className={cn("flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors", finished ? "border-emerald-500 bg-emerald-500 text-white" : "border-border/80", canEdit ? "" : "cursor-default opacity-70")}
          >
            {finished && <Check className="size-3" strokeWidth={3} />}
          </button>
          {opens ? (
            <button type="button" onClick={() => onOpen(!open)} aria-expanded={open} className="min-w-0 flex-1 truncate text-left font-medium" data-testid="tracker-sheet-line-open">
              <span className={cn(finished && "text-muted-foreground line-through")}>{line.name}</span>
            </button>
          ) : (
            <span className={cn("min-w-0 flex-1 truncate font-medium", finished && "text-muted-foreground line-through")}>{line.name}</span>
          )}
          {!open && hasMeta && <span className="flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground @max-[28rem]/assets:hidden">{meta}</span>}
          {opens && (
            <button type="button" onClick={() => onOpen(!open)} aria-label={open ? `Close ${line.name}` : `Open ${line.name}`} className="shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground">
              <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
            </button>
          )}
        </div>
        {/* Narrow: the details on a line of their own under the name. */}
        {!open && hasMeta && <div className="hidden flex-wrap items-center gap-x-2 gap-y-1 pr-2.5 pb-2 pl-[2.125rem] text-2xs text-muted-foreground @max-[28rem]/assets:flex">{meta}</div>}
        {open && <SheetLineEditor line={line} editable={editable} specColumnName={specColumnName} onCancel={() => onOpen(false)} onSave={onSave} />}
      </div>
    </li>
  );
}

/**
 * A sheet's line opened on the task: everything it has, the parts one column
 * gives as a draft until Update, which writes them into the line's row. Spec
 * and links put together from several columns are shown as they read.
 */
function SheetLineEditor({
  line,
  editable,
  specColumnName,
  onCancel,
  onSave,
}: {
  line: ItemAsset;
  editable: Partial<Record<SheetLineField, string>>;
  specColumnName: string | null;
  onCancel: () => void;
  onSave: (patch: ItemAssetPatch) => void;
}) {
  const ws = useWorkspace();
  const assetTypes = useWorkspaceList(ws.workspace.id, "ASSET_TYPES");
  const [name, setName] = React.useState(line.name);
  const [assetType, setAssetType] = React.useState(line.assetType ?? "");
  const [quantity, setQuantity] = React.useState(line.quantity === null ? "" : String(line.quantity));
  const [assigneeIds, setAssigneeIds] = React.useState(line.assigneeIds);
  const [dueDate, setDueDate] = React.useState(line.dueDate ?? "");
  // One spec column: its value alone, without the "Name: " the line reads with.
  const specPrefix = specColumnName ? `${specColumnName}: ` : "";
  const specValue = line.notes && specPrefix && line.notes.startsWith(specPrefix) ? line.notes.slice(specPrefix.length) : (line.notes ?? "");
  const [spec, setSpec] = React.useState(specValue);
  const [link, setLink] = React.useState(line.links[0]?.url ?? "");
  const types = [...new Set([...assetTypes.map((t) => t.name), ...(line.assetType ? [line.assetType] : [])])];

  const patch: ItemAssetPatch = {};
  if (editable.name && name.trim() && name.trim() !== line.name) patch.name = name.trim();
  if (editable.assetType && (assetType || null) !== line.assetType) patch.assetType = assetType || null;
  const qty = quantity.trim() === "" ? null : Math.max(0, Math.round(Number(quantity)));
  if (editable.quantity && (qty === null || Number.isFinite(qty)) && qty !== line.quantity) patch.quantity = qty;
  if (editable.assigneeIds && assigneeIds.join(",") !== line.assigneeIds.join(",")) patch.assigneeIds = assigneeIds;
  if (editable.dueDate && (dueDate || null) !== line.dueDate) patch.dueDate = dueDate || null;
  if (editable.notes && spec.trim() !== specValue.trim()) patch.notes = spec.trim() || null;
  if (editable.links && link.trim() !== (line.links[0]?.url ?? "")) patch.links = link.trim() ? [{ id: `col-${editable.links}`, label: line.links[0]?.label ?? "Link", url: link.trim(), icon: "link" }] : [];
  const changed = Object.keys(patch).length > 0;
  const changeable = Object.keys(editable).some((key) => key !== "completedAt");

  const field = (label: string, control: React.ReactNode) => (
    <label className="grid grid-cols-[5.5rem_1fr] items-center gap-2 max-sm:grid-cols-1">
      <span className="text-2xs font-medium text-muted-foreground">{label}</span>
      {control}
    </label>
  );
  return (
    <div
      className="space-y-2 border-t px-3 py-2.5"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && changed && (e.target as HTMLElement).tagName === "INPUT") onSave(patch);
      }}
      data-testid="tracker-sheet-line-editor"
    >
      {editable.name && field("Name", <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" autoFocus data-testid="sheet-line-name" />)}
      {editable.assetType &&
        field(
          "Type",
          <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className="h-8 min-w-0 rounded-md border bg-background px-2 text-[13px]" data-testid="sheet-line-type">
            <option value="">None</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>,
        )}
      {editable.quantity && field("Quantity", <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-8 w-28" data-testid="sheet-line-quantity" />)}
      {editable.assigneeIds &&
        field("PIC", <PeopleValue users={ws.activeUsers} value={assigneeIds} onChange={setAssigneeIds} placeholder="Nobody" label="PIC" testId="sheet-line-pic" />)}
      {editable.dueDate && field("Due date", <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 w-44" data-testid="sheet-line-due" />)}
      {!editable.name && field("Name", <span className="text-[13px]">{line.name}</span>)}
      {!editable.assetType && line.assetType && field("Type", <span className="text-[13px]">{line.assetType}</span>)}
      {!editable.quantity && line.quantity !== null && field("Quantity", <span className="text-[13px] tabular">{line.quantity}</span>)}
      {!editable.dueDate && line.dueDate && field("Due date", <span className="text-[13px] tabular">{formatShortDate(line.dueDate)}</span>)}
      {editable.notes
        ? field(specColumnName ?? "Spec", <Input value={spec} onChange={(e) => setSpec(e.target.value)} className="h-8" data-testid="sheet-line-spec" />)
        : line.notes && field("Spec", <span className="text-[13px] whitespace-pre-line" data-testid="sheet-line-spec-text">{line.notes}</span>)}
      {editable.links
        ? field(line.links[0]?.label ?? "Link", <Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className="h-8" data-testid="sheet-line-link" />)
        : line.links.length > 0 &&
          field(
            "Links",
            <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[13px]">
              {line.links.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline">
                  <Link2 className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{l.label}</span>
                </a>
              ))}
            </span>,
          )}
      <div className="flex justify-end gap-2 pt-0.5">
        {changeable ? (
          <>
            <Button size="sm" variant="ghost" className="h-7" onClick={onCancel}>
              Discard
            </Button>
            <Button size="sm" className="h-7" disabled={!changed} onClick={() => onSave(patch)} data-testid="sheet-line-update">
              Update
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-7" onClick={onCancel}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}

/** Every sheet in the workspace that holds no task's assets yet, by tracker; or a new tracker made for this task. */
function PickSheetDialog({ item, open, onOpenChange, onPick, onLinked }: { item: Item; open: boolean; onOpenChange: (open: boolean) => void; onPick: (sheet: TrackerSheet) => void; onLinked?: () => void }) {
  const services = useServices();
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const assetTypes = useWorkspaceList(ws.workspace.id, "ASSET_TYPES");
  const [creating, setCreating] = React.useState(false);
  // The new tracker's name: the task's to start with, the person's to change. Null while the box is closed.
  const [newName, setNewName] = React.useState<string | null>(null);
  // A tracker on the task's board's team, with one sheet laid out for assets.
  const createTracker = async () => {
    const name = (newName ?? "").trim();
    if (!name) return;
    setCreating(true);
    try {
      // Made and linked in one go, so a new tracker is never left holding no task. The task's
      // assets are then offered one by one (onLinked opens Move into sheet).
      await services.trackers.createForItem(
        { workspaceId: ws.workspace.id, teamId: ws.boardById(item.boardId)?.teamId ?? null, itemId: item.id, name, assetTypes: assetTypes.map((t) => t.name), moveAssets: false },
        ws.currentUser.id,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trackers"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.itemAssets(item.id) }),
        queryClient.invalidateQueries({ queryKey: ["item-tracker-sheet", item.id] }),
      ]);
      toast.success(`“${name}” now holds this task's assets`);
      setNewName(null);
      onOpenChange(false);
      onLinked?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not make the tracker");
    } finally {
      setCreating(false);
    }
  };
  const newButton =
    newName === null ? (
      <Button type="button" variant="outline" size="sm" onClick={() => setNewName(item.name.trim() || "Assets")} className="self-start" data-testid="pick-sheet-new-tracker">
        <Plus /> New tracker for this task
      </Button>
    ) : (
      <form
        className="grid w-full gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void createTracker();
        }}
        data-testid="pick-sheet-new-tracker-form"
      >
        <div className="flex w-full items-center gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New tracker name" placeholder="Tracker name" maxLength={120} autoFocus className="h-8 min-w-0 flex-1" data-testid="pick-sheet-new-tracker-name" />
          <Button type="button" variant="ghost" size="sm" onClick={() => setNewName(null)} disabled={creating}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={creating || !newName.trim()} data-testid="pick-sheet-new-tracker-create">
            {creating ? <Loader2 className="animate-spin" /> : <Plus />} Create
          </Button>
        </div>
      </form>
    );
  const data = useQuery({
    queryKey: ["tracker-sheet-picker", ws.workspace.id],
    queryFn: async () => {
      const trackers = await services.trackers.list(ws.workspace.id);
      const all = await Promise.all(trackers.map(async (tracker) => ({ tracker, sheets: await services.trackers.listSheets(tracker.id) })));
      // Only sheets this task can take: one holding another task's assets is no choice, so it is not offered.
      return { any: all.length > 0, free: all.map(({ tracker, sheets }) => ({ tracker, sheets: sheets.filter((sheet) => !sheet.itemId) })).filter(({ sheets }) => sheets.length > 0) };
    },
    enabled: open,
    staleTime: 5_000,
  });
  // The task's own team's trackers by default; off, every tracker in the workspace. A task on a board with no team has nothing to narrow to.
  const teamId = ws.boardById(item.boardId)?.teamId ?? null;
  const teamName = teamId ? (ws.teams.find((t) => t.id === teamId)?.name ?? null) : null;
  const [teamOnly, setTeamOnly] = React.useState(true);
  const narrowed = !!teamId && teamOnly;
  const free = (data.data?.free ?? []).filter(({ tracker }) => !narrowed || tracker.teamId === teamId);
  const emptyText = narrowed && (data.data?.free ?? []).length > 0 ? `No free sheets in ${teamName ?? "this team"}'s trackers.` : data.data?.any ? "Every sheet already holds a task's assets." : "No trackers in this workspace yet.";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setNewName(null);
        onOpenChange(next);
      }}
    >
      <DialogContent size="md" data-testid="pick-sheet-dialog">
        <DialogHeader>
          <DialogTitle>Use a tracker sheet</DialogTitle>
          <DialogDescription>The sheet&rsquo;s rows become this task&rsquo;s assets. A sheet holds one task&rsquo;s assets at a time.</DialogDescription>
        </DialogHeader>
        {teamId && (
          <label className="flex items-center justify-between gap-3 text-[13px]" data-testid="pick-sheet-team-only">
            <span>
              Team trackers only{teamName && <span className="text-muted-foreground"> · {teamName}</span>}
            </span>
            <Switch checked={teamOnly} onCheckedChange={setTeamOnly} aria-label="Team trackers only" data-testid="pick-sheet-team-only-switch" />
          </label>
        )}
        {data.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : free.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4" data-testid="pick-sheet-none">
            <p className="text-center text-[13px] text-muted-foreground">{emptyText}</p>
            <div className="flex w-full justify-center">{newButton}</div>
          </div>
        ) : (
          <ul className="max-h-[50dvh] space-y-3 overflow-y-auto">
            {free.map(({ tracker, sheets }) => (
              <li key={tracker.id}>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <FileSpreadsheet className="size-3.5" aria-hidden /> {tracker.name}
                </p>
                <ul className="space-y-0.5">
                  {sheets.map((sheet) => (
                    <li key={sheet.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setNewName(null);
                          onOpenChange(false);
                          onPick(sheet);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                        data-testid="pick-sheet"
                      >
                        <span className="min-w-0 flex-1 truncate">{sheet.name}</span>
                        <span className="shrink-0 text-2xs text-muted-foreground">{sheet.rows.filter((r) => r.kind === "data").length} rows</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {free.length > 0 && newButton}
      </DialogContent>
    </Dialog>
  );
}
