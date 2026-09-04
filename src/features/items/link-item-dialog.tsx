"use client";

import { ArrowLeftRight, Check, CornerDownRight, Link2 } from "lucide-react";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { LabelPill } from "@/components/shared/label-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { ColorToken, Item } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { COLUMN_TYPE_ICONS } from "@/features/boards/components/column-type-icons";
import { useLinkCandidates, useLinkMapping, useLinkMutations } from "@/features/items/link-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { colorClasses } from "@/lib/colors";
import { canEditBoard } from "@/lib/permissions/permissions";
import { cn, groupBy } from "@/lib/utils";
import type { LinkCandidate, LinkOptions } from "@/services";

export interface LinkItemDialogProps {
  item: Item;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Search every board in the space for the item to link with, preview which
 * columns will stay in sync, and choose whose values seed the pair.
 */
export function LinkItemDialog({ item, open, onOpenChange }: LinkItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The content unmounts when the dialog closes, so search and selection reset for free. */}
      <DialogContent size="xl" className="gap-0 p-0" data-testid="link-item-dialog">
        <LinkItemDialogBody item={item} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function LinkItemDialogBody({ item, onClose }: { item: Item; onClose: () => void }) {
  const { board } = useBoardContext();
  const ws = useWorkspace();
  const [query, setQuery] = React.useState("");
  const debounced = useDebouncedValue(query.trim(), 150);
  const [selected, setSelected] = React.useState<LinkCandidate | null>(null);
  const [seedFrom, setSeedFrom] = React.useState<LinkOptions["seedFrom"]>("item");
  const candidates = useLinkCandidates(item.id, debounced, true);
  const mapping = useLinkMapping(board.id, selected?.board.id ?? null);
  const { link } = useLinkMutations(item.id);

  // Sync writes to both boards, so only boards the user can edit are offered.
  const editable = (candidates.data ?? []).filter((c) => canEditBoard(ws.permissions, c.board));
  const byBoard = groupBy(editable, (c) => c.board.id);

  const submit = () => {
    if (!selected) return;
    link.mutate({ targetId: selected.item.id, options: { seedFrom } }, { onSuccess: onClose });
  };

  return (
    <>
      <DialogHeader className="px-5 pt-5 pb-3">
        <DialogTitle className="flex items-center gap-2">
          <Link2 className="size-4 text-muted-foreground" /> Link to another item
        </DialogTitle>
        <DialogDescription>
          Pick an item on another board in {ws.workspace.name}. Both items then stay in sync — name, description and every column the two boards share. Subitems are left alone.
        </DialogDescription>
      </DialogHeader>

      <div className="grid min-h-0 border-t md:grid-cols-[minmax(0,1fr)_300px]">
        <Command shouldFilter={false} className="rounded-none border-r-0 md:border-r">
          <CommandInput placeholder="Search items across boards…" value={query} onValueChange={setQuery} autoFocus data-testid="link-search" />
          <CommandList className="max-h-[360px]">
            {candidates.isLoading && (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            )}
            {!candidates.isLoading && editable.length === 0 && (
              <CommandEmpty>{debounced ? `No items match “${debounced}” on boards you can edit.` : "No items on other boards you can edit."}</CommandEmpty>
            )}
            {[...byBoard.entries()].map(([boardId, hits]) => {
              const b = hits[0]!.board;
              const team = ws.teamById(b.teamId);
              return (
                <CommandGroup
                  key={boardId}
                  heading={
                    <span className="flex items-center gap-1.5 normal-case tracking-normal">
                      <DynamicIcon name={b.icon} className={cn("size-3.5", colorClasses(b.color).text)} />
                      <span className="text-foreground">{b.name}</span>
                      {team && <span className="text-muted-foreground">· {team.name}</span>}
                    </span>
                  }
                >
                  {hits.map((hit) => {
                    const isSelected = selected?.item.id === hit.item.id;
                    return (
                      <CommandItem
                        key={hit.item.id}
                        value={hit.item.id}
                        disabled={hit.linked}
                        onSelect={() => setSelected(hit)}
                        data-testid="link-candidate"
                        className={cn("items-start py-1.5", isSelected && "bg-accent")}
                      >
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                          {isSelected ? <Check className="size-4" /> : hit.parent ? <CornerDownRight className="size-3.5 text-muted-foreground/70" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{hit.item.name}</span>
                          <span className="block truncate text-2xs text-muted-foreground">
                            {hit.group?.name}
                            {hit.parent ? ` · Subitem of ${hit.parent.name}` : ""}
                          </span>
                        </span>
                        {hit.linked ? <Badge variant="muted">Linked</Badge> : <LabelPill label={hit.status} size="sm" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>

        <aside className="flex min-h-0 flex-col gap-4 border-t p-4 md:border-t-0">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-[13px] text-muted-foreground">
              <ArrowLeftRight className="size-5 text-muted-foreground/60" />
              Select an item to see what will stay in sync.
            </div>
          ) : (
            <>
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Linking</p>
                <PairRow name={item.name} boardName={board.name} color={board.color} icon={board.icon} />
                <div className="my-1 flex justify-center text-muted-foreground/60">
                  <ArrowLeftRight className="size-3.5" />
                </div>
                <PairRow name={selected.item.name} boardName={selected.board.name} color={selected.board.color} icon={selected.board.icon} />
              </div>

              <div className="min-h-0 flex-1">
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">What stays in sync</p>
                {mapping.isLoading || !mapping.data ? (
                  <Skeleton className="h-20" />
                ) : (
                  <ul className="space-y-1 text-[13px]" data-testid="sync-preview">
                    <li className="flex items-center gap-2 text-foreground">
                      <Check className="size-3.5 text-green-600" /> Name and description
                    </li>
                    {mapping.data.mapped.map(({ source, target }) => {
                      const Icon = COLUMN_TYPE_ICONS[source.type];
                      const sameName = source.name.trim().toLowerCase() === target.name.trim().toLowerCase();
                      return (
                        <li key={source.id} className="flex items-center gap-2">
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{sameName ? source.name : `${source.name} → ${target.name}`}</span>
                        </li>
                      );
                    })}
                    {[
                      ...mapping.data.unmapped.map((c) => ({
                        column: c,
                        where: board.name,
                      })),
                      ...mapping.data.targetOnly.map((c) => ({
                        column: c,
                        where: selected.board.name,
                      })),
                    ].map(({ column, where }) => {
                      const Icon = COLUMN_TYPE_ICONS[column.type];
                      return (
                        <li key={column.id} className="flex items-center gap-2 text-muted-foreground/70">
                          <Icon className="size-3.5 shrink-0" />
                          <span className="truncate">
                            {column.name} <span className="text-2xs">· only on {where}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <fieldset>
                <legend className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Start with values from</legend>
                <div className="space-y-1 text-[13px]">
                  <SeedOption checked={seedFrom === "item"} onChange={() => setSeedFrom("item")} label="This item" hint={item.name} />
                  <SeedOption checked={seedFrom === "target"} onChange={() => setSeedFrom("target")} label="Selected item" hint={selected.item.name} />
                </div>
                <p className="mt-1.5 text-2xs text-muted-foreground">Only fields the chosen side has filled in are copied; nothing is cleared.</p>
              </fieldset>
            </>
          )}
        </aside>
      </div>

      <DialogFooter className="border-t px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!selected || link.isPending} data-testid="link-submit">
          <Link2 /> {link.isPending ? "Linking…" : "Link items"}
        </Button>
      </DialogFooter>
    </>
  );
}

function PairRow({ name, boardName, color, icon }: { name: string; boardName: string; color: ColorToken; icon: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded text-white", colorClasses(color).solid)}>
        <DynamicIcon name={icon} className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="block truncate text-2xs text-muted-foreground">{boardName}</span>
      </span>
    </div>
  );
}

function SeedOption({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 hover:bg-accent", checked && "border-ring bg-accent/60")}>
      <input type="radio" name="seed-from" checked={checked} onChange={onChange} className="accent-primary" />
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block truncate text-2xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
