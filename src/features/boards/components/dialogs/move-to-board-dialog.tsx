"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, LoaderCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Board } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canEditBoard } from "@/lib/permissions/permissions";
import { cn, pluralize } from "@/lib/utils";
import { useBoardUiStore } from "@/stores/board-ui-store";

/** A refusal from the database, in words: moving needs the right to edit both boards. */
function moveError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/row-level security|permission denied|violates/i.test(message)) return "You can't edit that board, so the task can't move there.";
  return message || "Could not move the task";
}

/**
 * Moving a task to another board in the workspace. Only boards the reader can
 * edit are offered (the database checks the same, on both boards). Before
 * anything moves it says which columns come across, which values cannot land
 * there and why, and what happens to the brief, the subitems and the rest.
 */
export function MoveToBoardDialog() {
  const { board, model } = useBoardContext();
  const ws = useWorkspace();
  const services = useServices();
  const user = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const itemId = useBoardUiStore((s) => s.moveRequestItemId);
  const setMoveRequest = useBoardUiStore((s) => s.setMoveRequest);
  const openItemId = useBoardUiStore((s) => s.openItemId);
  const setOpenItemId = useBoardUiStore((s) => s.setOpenItemId);
  const item = itemId ? model.itemById.get(itemId) : undefined;
  const [query, setQuery] = React.useState("");
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [groupId, setGroupId] = React.useState<string | null>(null);

  const close = () => {
    setMoveRequest(null);
    setQuery("");
    setTargetId(null);
    setGroupId(null);
  };

  // Boards it can go to: in this workspace, open, not built in, not this one, and editable by the reader.
  const candidates = React.useMemo(
    () => ws.boards.filter((b) => b.id !== board.id && !b.archivedAt && !b.system && canEditBoard(ws.permissions, b)).sort((a, b) => a.name.localeCompare(b.name)),
    [ws.boards, ws.permissions, board.id],
  );
  const shown = candidates.filter((b) => !query.trim() || b.name.toLowerCase().includes(query.trim().toLowerCase()) || (ws.teamById(b.teamId)?.name ?? "").toLowerCase().includes(query.trim().toLowerCase()));
  const byTeam = React.useMemo(() => {
    const groups = new Map<string, { label: string; boards: Board[] }>();
    for (const b of shown) {
      const key = b.teamId ?? "";
      const label = ws.teamById(b.teamId)?.name ?? "No team";
      if (!groups.has(key)) groups.set(key, { label, boards: [] });
      groups.get(key)!.boards.push(b);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [shown, ws]);
  const target = targetId ? ws.boardById(targetId) : null;

  const preview = useQuery({
    queryKey: ["move-to-board", itemId, targetId],
    queryFn: () => services.itemMoves.preview(itemId!, targetId!),
    enabled: !!itemId && !!targetId,
  });
  const chosenGroup = groupId ?? preview.data?.groups[0]?.id ?? null;

  const move = useMutation({
    mutationFn: () => services.itemMoves.moveToBoard(itemId!, targetId!, user.id, { groupId: chosenGroup ?? undefined }),
    onSuccess: async ({ board: landed }) => {
      if (openItemId === itemId) setOpenItemId(null);
      await queryClient.invalidateQueries({ queryKey: ["board-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["item-links"] });
      // The task left one board for another: both sidebar counts move.
      void queryClient.invalidateQueries({ queryKey: ["board-item-count"] });
      toast.success(`Moved to ${landed.name}`, { action: { label: "Open", onClick: () => router.push(ws.boardPath(landed, { itemId: itemId! })) } });
      close();
    },
    onError: (error) => toast.error(moveError(error)),
  });

  if (!itemId) return null;
  const plan = preview.data;
  return (
    <Dialog open onOpenChange={(open) => !open && !move.isPending && close()}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto]" data-testid="move-to-board">
        <DialogHeader>
          <DialogTitle>Move “{item?.name ?? "task"}” to another board</DialogTitle>
          <DialogDescription>Its updates, deliverables, links and subitems go with it.</DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin -mx-1 min-h-0 space-y-4 overflow-y-auto px-1">
          {!target ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a board" className="pl-8" autoFocus data-testid="move-board-search" />
              </div>
              {candidates.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">There is no other board you can edit.</p>
              ) : shown.length === 0 ? (
                <p className="px-1 py-3 text-[13px] text-muted-foreground">No board matches “{query.trim()}”.</p>
              ) : (
                <div className="space-y-3" data-testid="move-board-list">
                  {byTeam.map((group) => (
                    <div key={group.label}>
                      <p className="mb-1 px-1 text-2xs font-medium text-muted-foreground">{group.label}</p>
                      <ul className="space-y-0.5">
                        {group.boards.map((b) => (
                          <li key={b.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setTargetId(b.id);
                                setGroupId(null);
                              }}
                              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] hover:bg-accent"
                              data-testid="move-board-option"
                            >
                              <DynamicIcon name={b.icon} className={cn("size-4 shrink-0", colorClasses(b.color).text)} />
                              <span className="min-w-0 flex-1 truncate">{b.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px]">
                <span className="truncate text-muted-foreground">{board.name}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <DynamicIcon name={target.icon} className={cn("size-4 shrink-0", colorClasses(target.color).text)} />
                <span className="min-w-0 flex-1 truncate font-medium">{target.name}</span>
                <Button variant="ghost" size="sm" className="h-7" onClick={() => setTargetId(null)} disabled={move.isPending}>
                  Change
                </Button>
              </div>

              {preview.isLoading ? (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Checking its columns…
                </p>
              ) : preview.error ? (
                <p className="text-[13px] text-destructive">{moveError(preview.error)}</p>
              ) : plan ? (
                <>
                  <div className="grid gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Group</p>
                    <Select value={chosenGroup ?? undefined} onValueChange={setGroupId}>
                      <SelectTrigger className="h-9" aria-label="Group" data-testid="move-board-group">
                        <SelectValue placeholder="Choose a group" />
                      </SelectTrigger>
                      <SelectContent>
                        {plan.groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 text-[13px]" data-testid="move-board-kept">
                    <p className="text-xs font-medium text-muted-foreground">Comes across</p>
                    {plan.kept.length === 0 ? (
                      <p className="text-muted-foreground">No column values: that board has none of this one&rsquo;s columns.</p>
                    ) : (
                      <p>{plan.kept.map((k) => (k.from.trim().toLowerCase() === k.to.trim().toLowerCase() ? k.to : `${k.from} → ${k.to}`)).join(", ")}</p>
                    )}
                    {plan.subitems > 0 && <p className="text-muted-foreground">With its {pluralize(plan.subitems, "subitem")}.</p>}
                    {plan.briefToDescription && <p className="text-muted-foreground">The brief goes into the description: that board has no Brief column.</p>}
                  </div>

                  {plan.lost.length > 0 && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-[13px]" data-testid="move-board-lost">
                      <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="size-3.5" /> Left behind ({plan.lost.length})
                      </p>
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {plan.lost.map((l, i) => (
                          <li key={`${l.itemId}-${l.columnName}-${i}`}>
                            {l.itemId !== itemId ? `${l.itemName} · ` : ""}
                            <span className="text-foreground">{l.columnName}</span>: {l.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={move.isPending}>
            Cancel
          </Button>
          <Button onClick={() => move.mutate()} disabled={!target || !plan || !chosenGroup || move.isPending} data-testid="move-board-confirm">
            {move.isPending && <LoaderCircle className="animate-spin" />} Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
