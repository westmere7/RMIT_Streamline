"use client";

import { ArrowLeft, ArrowLeftToLine, ArrowRightToLine, Check, ChevronDown, Copy, CopyPlus, FileDown, FileSpreadsheet, FileUp, Loader2, MoreHorizontal, Package, Pencil, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineEdit } from "@/components/shared/inline-edit";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { TrackerSheet } from "@/domain";
import { exportSheetToCsv, exportTrackerToFile, useTracker, useTrackerMutations, useTrackerRealtime, useTrackerSheets } from "@/features/trackers/hooks";
import { SheetEditorProvider, useSheetEditorContext } from "@/features/trackers/sheet-editor-context";
import { MenuSheet } from "@/components/layout/menu-sheet";
import { TrackerGrid } from "@/features/trackers/tracker-grid";
import { LinkedSheetBar, TaskAssetsDialog, useLinkedTask, useTrackerPeopleDirectory } from "@/features/trackers/tracker-asset-ui";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { canEditTrackers } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function TrackerPage() {
  const params = useParams<{ trackerId: string }>();
  const ws = useWorkspace();
  useTrackerPeopleDirectory();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useTrackerRealtime(params.trackerId);
  const tracker = useTracker(params.trackerId);
  const sheets = useTrackerSheets(params.trackerId);
  const mutations = useTrackerMutations();
  const canEdit = canEditTrackers(ws.permissions);
  const [renaming, setRenaming] = React.useState(false);
  const [editingDescription, setEditingDescription] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [assetsOpen, setAssetsOpen] = React.useState(false);

  const sheetParam = searchParams.get("sheet");
  const activeSheet: TrackerSheet | undefined = sheets.data?.find((s) => s.id === sheetParam) ?? sheets.data?.[0];
  const selectSheet = (id: string) => router.replace(`${pathname}?sheet=${id}`, { scroll: false });
  // A sheet that holds a task's assets is that task's: editing it takes the right to edit the task.
  const linkedTask = useLinkedTask(activeSheet);
  const canEditSheet = canEdit && (!activeSheet?.itemId || (!linkedTask.loading && (linkedTask.canEditTask || !linkedTask.item)));

  if (tracker.isLoading || sheets.isLoading) {
    return (
      <div className="space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!tracker.data) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Tracker not found"
        description="It may have been deleted."
        action={
          <Button variant="outline" asChild>
            <Link href={routes.trackers(ws.slug)}>Back to trackers</Link>
          </Button>
        }
      />
    );
  }
  const t = tracker.data;
  const team = ws.teamById(t.teamId);

  const exportNow = async () => {
    setExporting(true);
    try {
      await exportTrackerToFile(t, sheets.data ?? []);
    } finally {
      setExporting(false);
    }
  };

  return (
    <SheetEditorProvider key={activeSheet?.id ?? "none"} sheet={activeSheet} canEdit={canEditSheet}>
      <div className="flex h-full min-h-0 flex-col" data-testid="tracker-page">
        <header className="border-b px-6 pt-4 pb-3 max-md:px-4">
          <div className="flex items-start gap-3.5 max-md:flex-wrap">
            <SimpleTooltip label="Back to trackers">
              <Button variant="ghost" size="icon-sm" asChild className="mt-0.5 text-muted-foreground">
                <Link href={routes.trackers(ws.slug)} aria-label="Back to trackers">
                  <ArrowLeft />
                </Link>
              </Button>
            </SimpleTooltip>
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-navy text-white">
              <FileSpreadsheet className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="min-w-0 text-xl font-semibold tracking-tight">
                <InlineEdit
                  value={t.name}
                  editing={renaming}
                  onEditingChange={setRenaming}
                  onSubmit={(name) => mutations.update.mutate({ trackerId: t.id, patch: { name } })}
                  disabled={!canEdit}
                  ariaLabel="Tracker name"
                  className={cn("rounded px-1 -mx-1", canEdit && "hover:bg-accent")}
                  inputClassName="h-8 w-96 max-w-full text-xl font-semibold"
                />
              </h1>
              <p className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                {team && (
                  <>
                    <Link href={routes.team(ws.slug, team.id)} className="shrink-0 whitespace-nowrap hover:text-foreground hover:underline">
                      {team.name}
                    </Link>
                    <span aria-hidden>·</span>
                  </>
                )}
                <InlineEdit
                  value={t.description ?? ""}
                  editing={editingDescription}
                  onEditingChange={setEditingDescription}
                  onSubmit={(description) => mutations.update.mutate({ trackerId: t.id, patch: { description } })}
                  disabled={!canEdit}
                  placeholder="Add a description"
                  ariaLabel="Tracker description"
                  className={cn("min-w-0 rounded px-1 -mx-1", canEdit && "hover:bg-accent", !t.description && "italic text-muted-foreground/70")}
                  inputClassName="h-7 w-[480px] max-w-full"
                >
                  {t.description || (canEdit ? "Add a description" : "")}
                </InlineEdit>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 max-md:w-full max-md:justify-end">
              <EditorControls canEdit={canEdit} />
              {canEdit && activeSheet && (
                <Button variant="outline" size="sm" onClick={() => setAssetsOpen(true)} disabled={!!activeSheet.itemId && !canEditSheet} data-testid="task-assets-button">
                  <Package /> {activeSheet.itemId ? "Task assets" : "Use for a task"}
                </Button>
              )}
              {canEdit && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xlsm"
                    hidden
                    aria-label="Import sheets from a workbook"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) mutations.importSheets.mutate({ trackerId: t.id, file });
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={mutations.importSheets.isPending}>
                    <FileUp /> Import
                  </Button>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={exporting} data-testid="export-tracker">
                    {exporting ? <Loader2 className="animate-spin" /> : <FileDown />} Export <ChevronDown className="size-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Export</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => void exportNow()} data-testid="export-xlsx">
                    <FileSpreadsheet /> Excel workbook (.xlsx), all sheets
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!activeSheet} onSelect={() => activeSheet && void exportSheetToCsv(t, activeSheet)} data-testid="export-csv">
                    <FileDown /> CSV, this sheet only
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <p className="px-2 py-1.5 text-2xs text-muted-foreground">The workbook keeps dropdowns, colours, frozen columns, filters and a totals row with live formulas.</p>
                </DropdownMenuContent>
              </DropdownMenu>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Tracker options">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <DropdownMenuItem onSelect={() => setRenaming(true)}>
                      <Pencil /> Rename tracker
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setEditingDescription(true)}>
                      <Pencil /> Edit description
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Users /> Move to team
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-52">
                        {ws.teams
                          .filter((team) => team.archivedAt === null)
                          .map((team) => (
                            <DropdownMenuItem key={team.id} onSelect={() => team.id !== t.teamId && mutations.update.mutate({ trackerId: t.id, patch: { teamId: team.id } })}>
                              <span className="flex-1 truncate">{team.name}</span>
                              {team.id === t.teamId && <Check className="size-3.5" />}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem
                      onSelect={() =>
                        mutations.duplicate.mutate(t.id, {
                          onSuccess: ({ tracker: copy }) => router.push(routes.tracker(ws.slug, copy.id)),
                        })
                      }
                    >
                      <CopyPlus /> Duplicate tracker
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                      <Trash2 /> Delete tracker
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </header>

        <SheetTabs sheets={sheets.data ?? []} activeId={activeSheet?.id ?? null} trackerId={t.id} canEdit={canEdit} onSelect={selectSheet} onTaskAssets={() => setAssetsOpen(true)} />

        {activeSheet?.itemId && <LinkedSheetBar sheet={activeSheet} onSettings={canEditSheet ? () => setAssetsOpen(true) : null} />}

        <ActiveGrid canEdit={canEditSheet} />

        {activeSheet && <ActiveTaskAssetsDialog open={assetsOpen} onOpenChange={setAssetsOpen} />}

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete “${t.name}”?`}
          description={
            (sheets.data ?? []).some((s) => s.itemId)
              ? "This permanently deletes the tracker and every sheet in it, and the assets its sheets give their tasks. Export it first if you want a copy."
              : "This permanently deletes the tracker and every sheet in it. Export it first if you want a copy."
          }
          confirmLabel="Delete tracker"
          destructive
          onConfirm={async () => {
            await mutations.remove.mutateAsync(t.id);
            router.push(routes.trackers(ws.slug));
          }}
        />
      </div>
    </SheetEditorProvider>
  );
}

/** Save state plus undo/redo, read from the sheet editor that wraps the page. */
function EditorControls({ canEdit }: { canEdit: boolean }) {
  const editor = useSheetEditorContext();
  return (
    <>
      <SaveIndicator state={editor.saving} />
      {canEdit && <span aria-hidden className="mx-1 h-6 w-px bg-border" />}
    </>
  );
}

/** The Task assets dialog for the sheet on screen, read from the editor so it sees unsaved columns too. */
function ActiveTaskAssetsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const editor = useSheetEditorContext();
  if (!editor.sheet) return null;
  return <TaskAssetsDialog sheet={editor.sheet} open={open} onOpenChange={onOpenChange} />;
}

function ActiveGrid({ canEdit }: { canEdit: boolean }) {
  const editor = useSheetEditorContext();
  if (!editor.sheet) return <EmptyState icon={FileSpreadsheet} title="No sheets" description="Add a sheet to start tracking." />;
  return <TrackerGrid sheet={editor.sheet} canEdit={canEdit} commit={editor.commit} onUndo={editor.undo} onRedo={editor.redo} />;
}

function SaveIndicator({ state }: { state: "idle" | "pending" | "saving" | "error" }) {
  if (state === "idle") return null;
  return (
    <span className={cn("flex items-center gap-1 text-2xs", state === "error" ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
      {state === "saving" || state === "pending" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
      {state === "pending" ? "Unsaved changes" : state === "saving" ? "Saving…" : "Could not save"}
    </span>
  );
}

/**
 * The active sheet's own actions, for a phone.
 *
 * On a desktop these live on a double-click (rename) and a right-click (the
 * rest). Neither exists on a touch screen, so below md the same three actions
 * get a button and a sheet. Rendered only there; the desktop tab strip is
 * unchanged.
 */
function MobileSheetActions({ sheet, canDelete, onRename, onDuplicate, onDelete }: { sheet: TrackerSheet; canDelete: boolean; onRename: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  if (!isMobile) return null;
  return (
    <>
      <button
        type="button"
        aria-label={`Actions for ${sheet.name}`}
        onClick={() => setOpen(true)}
        className="mb-1 ml-auto flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-accent/70"
        data-testid="mobile-sheet-actions"
      >
        <MoreHorizontal className="size-4" />
      </button>
      <MenuSheet
        open={open}
        onOpenChange={setOpen}
        title={sheet.name}
        actions={[
          { type: "item", label: "Rename sheet", onSelect: onRename },
          { type: "item", label: "Duplicate sheet", onSelect: onDuplicate },
          { type: "separator" },
          { type: "item", label: "Delete sheet", destructive: true, disabled: !canDelete, onSelect: onDelete },
        ]}
      />
    </>
  );
}

/**
 * Excel-style sheet tabs: click to switch, double-click to rename, drag to
 * reorder, right-click for the rest. A sheet holding a task's assets carries a
 * small box beside its name.
 */
function SheetTabs({ sheets, activeId, trackerId, canEdit, onSelect, onTaskAssets }: { sheets: TrackerSheet[]; activeId: string | null; trackerId: string; canEdit: boolean; onSelect: (id: string) => void; onTaskAssets: () => void }) {
  const mutations = useTrackerMutations();
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<TrackerSheet | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dropAt, setDropAt] = React.useState<number | null>(null);
  const activeSheet = sheets.find((sheet) => sheet.id === activeId) ?? null;

  const add = (layout: "campaign" | "blank" | "copy") => {
    const name = `Sheet ${sheets.length + 1}`;
    mutations.addSheet.mutate({ trackerId, name, layout, copyOf: activeId ?? undefined }, { onSuccess: (sheet) => onSelect(sheet.id) });
  };
  const duplicate = (sheet: TrackerSheet, layout: "copy" | "duplicate") =>
    mutations.addSheet.mutate({ trackerId, name: layout === "duplicate" ? `${sheet.name} (copy)` : `${sheet.name} (layout)`, layout, copyOf: sheet.id }, { onSuccess: (s) => onSelect(s.id) });
  const drop = (index: number) => {
    if (!dragId) return;
    const ids = sheets.map((s) => s.id).filter((id) => id !== dragId);
    const from = sheets.findIndex((s) => s.id === dragId);
    ids.splice(index > from ? index - 1 : index, 0, dragId);
    if (ids.join() !== sheets.map((s) => s.id).join()) mutations.reorderSheets.mutate({ trackerId, orderedIds: ids });
    setDragId(null);
    setDropAt(null);
  };

  return (
    <div role="tablist" aria-label="Sheets" className="scrollbar-none flex items-end gap-0.5 overflow-x-auto overscroll-x-contain border-b px-6 max-md:px-3" data-testid="sheet-tabs">
      {sheets.map((sheet, index) => {
        const active = sheet.id === activeId;
        const className = cn(
          "relative -mb-px flex h-10 max-w-56 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring max-md:h-12",
          active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          dropAt === index && dragId && "before:absolute before:inset-y-2 before:-left-px before:w-0.5 before:rounded before:bg-primary",
          dragId === sheet.id && "opacity-50",
        );
        // While renaming, the field stands in for the tab: an input inside a
        // button would hand its keys and clicks to the button.
        if (renamingId === sheet.id) {
          return (
            <div key={sheet.id} className={className}>
              <InlineEdit
                value={sheet.name}
                editing
                onEditingChange={(editing) => !editing && setRenamingId(null)}
                onSubmit={(name) => mutations.renameSheet.mutate({ sheetId: sheet.id, name })}
                ariaLabel="Sheet name"
                inputClassName="h-7 w-40 text-[13px]"
              />
            </div>
          );
        }
        const tab = (
          <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(sheet.id)}
            onDoubleClick={() => canEdit && setRenamingId(sheet.id)}
            draggable={canEdit && sheets.length > 1}
            onDragStart={(e) => {
              setDragId(sheet.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", sheet.name);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              const box = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientX < box.left + box.width / 2 ? index : index + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dropAt !== null) drop(dropAt);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropAt(null);
            }}
            className={className}
            data-testid="sheet-tab"
          >
            {sheet.itemId && <Package className="size-3.5 shrink-0 text-primary" aria-label="Holds a task's assets" />}
            <span className="truncate">{sheet.name}</span>
          </button>
        );
        if (!canEdit) return <React.Fragment key={sheet.id}>{tab}</React.Fragment>;
        return (
          <ContextMenu key={sheet.id}>
            <ContextMenuTrigger asChild>{tab}</ContextMenuTrigger>
            <ContextMenuContent className="w-52" onCloseAutoFocus={(e) => e.preventDefault()}>
              <ContextMenuItem onSelect={() => setRenamingId(sheet.id)}>
                <Pencil /> Rename sheet
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => duplicate(sheet, "duplicate")}>
                <CopyPlus /> Duplicate sheet
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => duplicate(sheet, "copy")}>
                <Copy /> Duplicate layout only
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem disabled={index === 0} onSelect={() => mutations.moveSheet.mutate({ sheetId: sheet.id, delta: -1 })}>
                <ArrowLeftToLine /> Move left
              </ContextMenuItem>
              <ContextMenuItem disabled={index === sheets.length - 1} onSelect={() => mutations.moveSheet.mutate({ sheetId: sheet.id, delta: 1 })}>
                <ArrowRightToLine /> Move right
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  onSelect(sheet.id);
                  onTaskAssets();
                }}
              >
                <Package /> {sheet.itemId ? "Task assets…" : "Use for a task…"}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" disabled={sheets.length <= 1} onSelect={() => setDeleting(sheet)}>
                <Trash2 /> Delete sheet
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Add sheet"
              className="mb-1 ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground max-md:size-11"
              data-testid="add-sheet"
            >
              <Plus className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Add sheet</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => add("campaign")}>Campaign asset layout</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => add("copy")} disabled={!activeId}>
              Same columns as this sheet
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => add("blank")}>Blank grid</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canEdit && activeSheet && (
        <MobileSheetActions
          sheet={activeSheet}
          canDelete={sheets.length > 1}
          onRename={() => setRenamingId(activeSheet.id)}
          onDuplicate={() => duplicate(activeSheet, "duplicate")}
          onDelete={() => setDeleting(activeSheet)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description={deleting?.itemId ? "Every row on this sheet is permanently removed, and the task it holds the assets of loses them." : "Every row on this sheet is permanently removed."}
        confirmLabel="Delete sheet"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await mutations.deleteSheet.mutateAsync(deleting.id);
          const remaining = sheets.filter((s) => s.id !== deleting.id);
          if (deleting.id === activeId && remaining[0]) onSelect(remaining[0].id);
        }}
      />
    </div>
  );
}
