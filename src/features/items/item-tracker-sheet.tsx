"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, FileSpreadsheet, Loader2, Package, Settings2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Item, ItemAsset, TrackerSheet } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useAssetMutations } from "@/features/items/asset-hooks";
import { useItemTrackerSheet, useTracker } from "@/features/trackers/hooks";
import { TaskAssetsDialog } from "@/features/trackers/tracker-asset-ui";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { formatShortDate } from "@/lib/dates/dates";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The part of a task's Assets tab that comes from a tracker sheet.
 *
 * A linked sheet's rows are the task's lines: listed here as they are, ticked
 * off here or in the sheet, and changed in the sheet. Without a sheet, an
 * editor can pick one, which opens the same asset settings the tracker shows.
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
    <section className="mb-4 rounded-lg border" data-testid="tracker-sheet-section">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-surface/60 px-3 py-2 text-[13px]">
        <Package className="size-4 shrink-0 text-primary" aria-hidden />
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
      {lines.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-muted-foreground">No rows in the sheet read as assets yet.</p>
      ) : (
        <ul className="divide-y" data-testid="tracker-sheet-lines">
          {groups.map((group, g) => (
            <React.Fragment key={`${group.name}-${g}`}>
              {group.name && <li className="bg-surface/40 px-3 py-1 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{group.name}</li>}
              {group.lines.map((line) => (
                <SheetLine key={line.id} line={line} canEdit={canEdit} onToggle={() => mutations.update.mutate({ id: line.id, patch: { completedAt: line.completedAt ? null : new Date().toISOString() } })} />
              ))}
            </React.Fragment>
          ))}
        </ul>
      )}
      <p className="border-t px-3 py-1.5 text-2xs text-muted-foreground">Change these in the sheet. Ticking one here ticks its row there.</p>
    </section>
  );
}

function SheetLine({ line, canEdit, onToggle }: { line: ItemAsset; canEdit: boolean; onToggle: () => void }) {
  const ws = useWorkspace();
  const people = line.assigneeIds.map((id) => ws.users.find((u) => u.id === id) ?? null);
  const finished = !!line.completedAt;
  return (
    <li className="flex items-center gap-2.5 px-3 py-1.5 text-[13px]" data-testid="tracker-sheet-line">
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
      <span className={cn("min-w-0 flex-1 truncate", finished && "text-muted-foreground line-through")}>{line.name}</span>
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
    </li>
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
