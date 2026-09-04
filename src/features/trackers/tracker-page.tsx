"use client";

import { ArrowLeft, Check, Copy, FileDown, FileSpreadsheet, FileUp, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineEdit } from "@/components/shared/inline-edit";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { TrackerSheet } from "@/domain";
import { exportTrackerToFile, useTracker, useTrackerMutations, useTrackerSheets } from "@/features/trackers/hooks";
import { SheetEditorProvider, useSheetEditorContext } from "@/features/trackers/sheet-editor-context";
import { TrackerGrid } from "@/features/trackers/tracker-grid";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canEditTrackers } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function TrackerPage() {
  const params = useParams<{ trackerId: string }>();
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tracker = useTracker(params.trackerId);
  const sheets = useTrackerSheets(params.trackerId);
  const mutations = useTrackerMutations();
  const canEdit = canEditTrackers(ws.permissions);
  const [renaming, setRenaming] = React.useState(false);
  const [editingDescription, setEditingDescription] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const sheetParam = searchParams.get("sheet");
  const activeSheet: TrackerSheet | undefined = sheets.data?.find((s) => s.id === sheetParam) ?? sheets.data?.[0];
  const selectSheet = (id: string) => router.replace(`${pathname}?sheet=${id}`, { scroll: false });

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
    <SheetEditorProvider key={activeSheet?.id ?? "none"} sheet={activeSheet} canEdit={canEdit}>
      <div className="flex h-full min-h-0 flex-col" data-testid="tracker-page">
        <header className="border-b px-6 pt-4 pb-3">
          <div className="flex items-start gap-3.5">
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
                  inputClassName="h-8 w-96 text-xl font-semibold"
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

            <div className="flex shrink-0 items-center gap-1.5">
              <EditorControls canEdit={canEdit} />
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
              <Button variant="outline" size="sm" onClick={() => void exportNow()} disabled={exporting} data-testid="export-tracker">
                {exporting ? <Loader2 className="animate-spin" /> : <FileDown />} Export .xlsx
              </Button>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Tracker options">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => setRenaming(true)}>
                      <Pencil /> Rename tracker
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

        <SheetTabs sheets={sheets.data ?? []} activeId={activeSheet?.id ?? null} trackerId={t.id} canEdit={canEdit} onSelect={selectSheet} />

        <ActiveGrid canEdit={canEdit} />

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete “${t.name}”?`}
          description="This permanently deletes the tracker and every sheet in it. Export it first if you want a copy."
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

/** Excel-style sheet tabs: click to switch, double-click to rename, right-click for more. */
function SheetTabs({ sheets, activeId, trackerId, canEdit, onSelect }: { sheets: TrackerSheet[]; activeId: string | null; trackerId: string; canEdit: boolean; onSelect: (id: string) => void }) {
  const mutations = useTrackerMutations();
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<TrackerSheet | null>(null);

  const add = (layout: "campaign" | "blank" | "copy") => {
    const name = `Sheet ${sheets.length + 1}`;
    mutations.addSheet.mutate({ trackerId, name, layout, copyOf: activeId ?? undefined }, { onSuccess: (sheet) => onSelect(sheet.id) });
  };

  return (
    <div role="tablist" aria-label="Sheets" className="flex items-end gap-0.5 border-b px-6" data-testid="sheet-tabs">
      {sheets.map((sheet) => {
        const active = sheet.id === activeId;
        const tab = (
          <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(sheet.id)}
            onDoubleClick={() => canEdit && setRenamingId(sheet.id)}
            className={cn(
              "relative -mb-px flex h-10 max-w-56 items-center gap-1.5 border-b-2 px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {renamingId === sheet.id ? (
              <InlineEdit
                value={sheet.name}
                editing
                onEditingChange={(editing) => !editing && setRenamingId(null)}
                onSubmit={(name) => mutations.renameSheet.mutate({ sheetId: sheet.id, name })}
                ariaLabel="Sheet name"
                inputClassName="h-7 w-40 text-[13px]"
              />
            ) : (
              <span className="truncate">{sheet.name}</span>
            )}
          </button>
        );
        if (!canEdit) return <React.Fragment key={sheet.id}>{tab}</React.Fragment>;
        return (
          <ContextMenu key={sheet.id}>
            <ContextMenuTrigger asChild>{tab}</ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuItem onSelect={() => setRenamingId(sheet.id)}>
                <Pencil /> Rename sheet
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => mutations.addSheet.mutate({ trackerId, name: `${sheet.name} (copy)`, layout: "copy", copyOf: sheet.id }, { onSuccess: (s) => onSelect(s.id) })}>
                <Copy /> Duplicate layout
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
              className="mb-1 ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
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
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="Every row on this sheet is permanently removed."
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
