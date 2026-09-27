"use client";

import { Layers, ListChecks } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Item, ItemAsset, TagOption } from "@/domain";
import { groupAssetBlocks, recapAssets } from "@/domain";
import { AssetComposer } from "@/features/assets/asset-composer";
import { copyOfAssetLine, useAssetMutations } from "@/features/items/asset-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { formatShortDate, todayISO } from "@/lib/dates/dates";

/** A run of the viewer's lines: one block's, or lines on their own between blocks. */
type Section = { key: string; block: { name: string } | null; lines: ItemAsset[] };

/**
 * Beside Block in the Assets tab, when any line on this task is on the person
 * looking: those lines in a dialog, each with every detail it has, ticked off
 * or edited with the same row controls as the tab.
 *
 * Blocks are shown as headings rather than block cards, because a block card
 * edits the whole block and this view holds only the viewer's part of it.
 */
export function MyAssetsButton({ item, rows, assetTypes, canEdit }: { item: Item; rows: readonly ItemAsset[]; assetTypes: readonly TagOption[]; canEdit: boolean }) {
  const ws = useWorkspace();
  const [open, setOpen] = React.useState(false);
  const meId = ws.currentUser.id;
  const mine = React.useMemo(() => rows.filter((row) => row.assigneeIds.includes(meId)), [rows, meId]);
  const todo = mine.filter((row) => !row.completedAt).length;

  // Nothing on this task is theirs: no button. Kept while the dialog is open,
  // so taking the last line off yourself there does not snap it shut.
  if (mine.length === 0 && !open) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-auto shrink-0 self-stretch rounded-xl px-3 shadow-xs"
        title="The items on you in this task"
        data-testid="asset-mine"
      >
        <ListChecks /> To-do
        {todo > 0 && <span className="rounded-full bg-accent-soft px-1.5 text-2xs font-semibold text-accent-soft-foreground tabular" data-testid="asset-mine-count">{todo}</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" data-testid="my-assets-dialog">
          {open && <MyAssetsBody item={item} rows={rows} mine={mine} assetTypes={assetTypes} canEdit={canEdit} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MyAssetsBody({ item, rows, mine, assetTypes, canEdit }: { item: Item; rows: readonly ItemAsset[]; mine: readonly ItemAsset[]; assetTypes: readonly TagOption[]; canEdit: boolean }) {
  const ws = useWorkspace();
  const mutations = useAssetMutations(item);
  const recap = recapAssets(mine, todayISO());
  const todo = recap.lines - recap.done;

  // Numbered as the whole list numbers them, so "3" here is "3" in the tab.
  const { numbers, sections } = React.useMemo(() => {
    const mineIds = new Set(mine.map((row) => row.id));
    const numbers = new Map<string, number>();
    const sections: Section[] = [];
    for (const entry of groupAssetBlocks(rows)) {
      const lines = entry.kind === "line" ? [entry.line] : entry.lines;
      for (const line of lines) numbers.set(line.id, numbers.size + 1);
      const own = lines.filter((line) => mineIds.has(line.id));
      if (own.length === 0) continue;
      const last = sections.at(-1);
      if (entry.kind === "block") sections.push({ key: entry.blockId, block: { name: entry.name }, lines: own });
      else if (last && !last.block) last.lines.push(...own);
      else sections.push({ key: own[0]!.id, block: null, lines: own });
    }
    return { numbers, sections };
  }, [rows, mine]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>To-do</DialogTitle>
        <DialogDescription className="truncate">{item.name}</DialogDescription>
      </DialogHeader>

      {recap.lines > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground tabular" data-testid="my-assets-summary">
          {todo === 0 ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">All done</span>
          ) : (
            <>
              <span className="font-medium text-foreground">{todo} to do</span>
              {recap.overdue > 0 && <span className="font-medium text-red-600 dark:text-red-400"> · {recap.overdue} overdue</span>}
              {recap.nextDue && <span> · next due {formatShortDate(recap.nextDue)}</span>}
            </>
          )}
        </p>
      )}

      {sections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 px-4 py-6 text-center text-[13px] text-muted-foreground" data-testid="my-assets-empty">
          Nothing here is on you.
        </p>
      ) : (
        <div className="space-y-4" data-testid="my-assets-list">
          {sections.map((section) => (
            <section key={section.key} className="space-y-1.5">
              {section.block && (
                <h3 className="flex items-center gap-1.5 px-1 text-xs font-semibold">
                  <Layers className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="truncate">{section.block.name}</span>
                  <span className="font-normal text-muted-foreground tabular">
                    {section.lines.filter((line) => line.completedAt).length}/{section.lines.length}
                  </span>
                </h3>
              )}
              <AssetComposer
                rows={section.lines}
                // Everything on these lines is the viewer's already, and a block
                // line takes its people from the block, so no people picker.
                fields={{ blocks: false, people: false }}
                assetTypes={assetTypes}
                users={ws.users}
                canEdit={canEdit}
                addable={false}
                numbers={numbers}
                detailed
                onAdd={() => undefined}
                onPatch={(id, patch) => mutations.update.mutate({ id, patch })}
                onDuplicate={(row) => mutations.add.mutate(copyOfAssetLine(row))}
                onRemove={(id) => mutations.remove.mutate(id)}
              />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
