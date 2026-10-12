"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ExternalLink, FileSpreadsheet, Link2, Loader2, Settings2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { sheetLineColumns, specColumnIds, type Item, type ItemAsset, type ItemAssetPatch, type SheetLineField, type TrackerSheet } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useAssetMutations } from "@/features/items/asset-hooks";
import { useItemTrackerSheet, useTracker } from "@/features/trackers/hooks";
import { PeopleValue, TaskAssetsDialog } from "@/features/trackers/tracker-asset-ui";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { formatShortDate } from "@/lib/dates/dates";
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
export function ItemTrackerSheet({ item, lines, canEdit }: { item: Item; lines: ItemAsset[]; canEdit: boolean }) {
  const linked = useItemTrackerSheet(item.id);
  const sheet = linked.data ?? null;
  const [picking, setPicking] = React.useState(false);
  const [settings, setSettings] = React.useState<TrackerSheet | null>(null);

  if (linked.isLoading) return null;
  // Lines shared in from a linked task's sheet still show, under their own sheet.
  if (!sheet && lines.length === 0) {
    if (!canEdit) return null;
    return (
      <>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[13px] text-muted-foreground" data-testid="tracker-sheet-empty">
          <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">Keep this task&rsquo;s assets in a tracker sheet instead.</span>
          <Button size="sm" variant="outline" onClick={() => setPicking(true)} data-testid="use-tracker-sheet">
            Use a tracker sheet
          </Button>
        </div>
        <PickSheetDialog open={picking} onOpenChange={setPicking} onPick={(s) => setSettings(s)} />
        {settings && <TaskAssetsDialog sheet={settings} presetItem={item} open onOpenChange={(open) => !open && setSettings(null)} />}
      </>
    );
  }
  return (
    <>
      <SheetSection item={item} sheet={sheet} lines={lines} canEdit={canEdit} onSettings={sheet ? () => setSettings(sheet) : null} />
      {settings && <TaskAssetsDialog sheet={settings} open onOpenChange={(open) => !open && setSettings(null)} />}
    </>
  );
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
        <ul className="divide-y" data-testid="tracker-sheet-lines">
          {groups.map((group, g) => (
            <React.Fragment key={`${group.name}-${g}`}>
              {group.name && <li className="bg-surface/40 px-3 py-1 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{group.name}</li>}
              {group.lines.map((line) => (
                <SheetLine
                  key={line.id}
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
      {!collapsed && <p className="border-t px-3 py-1.5 text-2xs text-muted-foreground">{Object.keys(editable).length > 0 ? "Changes here are made in the sheet too." : "Change these in the sheet. Ticking one here ticks its row there."}</p>}
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
  line,
  canEdit,
  editable,
  specColumnName,
  open,
  onOpen,
  onToggle,
  onSave,
}: {
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
  return (
    <li data-testid="tracker-sheet-line">
    <div className={cn("flex items-center gap-2.5 px-3 py-1.5 text-[13px]", open && "bg-surface/60")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={finished}
        aria-label={finished ? `Open ${line.name} again` : `Mark ${line.name} done`}
        disabled={!canEdit}
        onClick={onToggle}
        className={cn("flex size-4 shrink-0 items-center justify-center rounded-[4px] border", finished ? "border-green-600 bg-green-600 text-white" : "border-input", canEdit && "hover:border-ring")}
      >
        {finished && <Check className="size-3" strokeWidth={3} />}
      </button>
      {opens ? (
        <button type="button" onClick={() => onOpen(!open)} aria-expanded={open} className={cn("min-w-0 flex-1 truncate text-left hover:underline", finished && "text-muted-foreground line-through")} data-testid="tracker-sheet-line-open">
          {line.name}
        </button>
      ) : (
        <span className={cn("min-w-0 flex-1 truncate", finished && "text-muted-foreground line-through")}>{line.name}</span>
      )}
      {line.assetType && <span className="hidden shrink-0 rounded-full bg-surface px-2 py-0.5 text-2xs sm:inline">{line.assetType}</span>}
      {line.quantity !== null && <span className="shrink-0 text-2xs text-muted-foreground tabular">×{line.quantity}</span>}
      {people.length > 0 && (
        <span className="flex shrink-0 -space-x-1.5">
          {people.slice(0, 3).map((user, i) => (
            <UserAvatar key={line.assigneeIds[i]} user={user} size="xs" className="ring-2 ring-background" />
          ))}
        </span>
      )}
      {line.dueDate && <span className="shrink-0 text-2xs text-muted-foreground tabular">{formatShortDate(line.dueDate)}</span>}
    </div>
    {open && <SheetLineEditor line={line} editable={editable} specColumnName={specColumnName} onCancel={() => onOpen(false)} onSave={onSave} />}
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
      className="space-y-2 border-t bg-surface/30 px-3 py-2.5"
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
        field("PIC", <PeopleValue users={ws.activeUsers} value={assigneeIds} onChange={setAssigneeIds} placeholder="PIC" label="PIC" testId="sheet-line-pic" />)}
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

/** Every sheet in the workspace that holds no task's assets yet, by tracker. */
function PickSheetDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (sheet: TrackerSheet) => void }) {
  const services = useServices();
  const ws = useWorkspace();
  const data = useQuery({
    queryKey: ["tracker-sheet-picker", ws.workspace.id],
    queryFn: async () => {
      const trackers = await services.trackers.list(ws.workspace.id);
      return Promise.all(trackers.map(async (tracker) => ({ tracker, sheets: await services.trackers.listSheets(tracker.id) })));
    },
    enabled: open,
    staleTime: 5_000,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" data-testid="pick-sheet-dialog">
        <DialogHeader>
          <DialogTitle>Use a tracker sheet</DialogTitle>
          <DialogDescription>The sheet&rsquo;s rows become this task&rsquo;s assets. A sheet holds one task&rsquo;s assets at a time.</DialogDescription>
        </DialogHeader>
        {data.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (data.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">No trackers in this workspace yet.</p>
        ) : (
          <ul className="max-h-[50dvh] space-y-3 overflow-y-auto">
            {(data.data ?? []).map(({ tracker, sheets }) => (
              <li key={tracker.id}>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <FileSpreadsheet className="size-3.5" aria-hidden /> {tracker.name}
                </p>
                <ul className="space-y-0.5">
                  {sheets.map((sheet) => (
                    <li key={sheet.id}>
                      <button
                        type="button"
                        disabled={!!sheet.itemId}
                        onClick={() => {
                          onOpenChange(false);
                          onPick(sheet);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] enabled:hover:bg-accent disabled:opacity-50"
                        data-testid="pick-sheet"
                      >
                        <span className="min-w-0 flex-1 truncate">{sheet.name}</span>
                        <span className="shrink-0 text-2xs text-muted-foreground">{sheet.itemId ? "Holds another task's assets" : `${sheet.rows.filter((r) => r.kind === "data").length} rows`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
