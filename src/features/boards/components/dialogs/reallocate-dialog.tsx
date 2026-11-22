"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { formatShortDate } from "@/lib/dates/dates";
import { pluralize } from "@/lib/utils";
import { useBoardUiStore } from "@/stores/board-ui-store";

const NEW_GROUP = "__new__";

/**
 * Sends a task back to Task Allocation, reset as if just booked. It says first
 * what goes (people, status, updates, the log, subitems, links, follows, ticks)
 * and what stays (the booking time, the deliverables, what Task Allocation has
 * columns for), and asks for a group there that is not Booked by Form, or a
 * name for a new one when there is none.
 */
export function ReallocateDialog() {
  const { model } = useBoardContext();
  const ws = useWorkspace();
  const services = useServices();
  const user = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const itemId = useBoardUiStore((s) => s.reallocateRequestItemId);
  const setRequest = useBoardUiStore((s) => s.setReallocateRequest);
  const openItemId = useBoardUiStore((s) => s.openItemId);
  const setOpenItemId = useBoardUiStore((s) => s.setOpenItemId);
  const item = itemId ? model.itemById.get(itemId) : undefined;
  const [choice, setChoice] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("Re-allocated");

  const preview = useQuery({
    queryKey: ["reallocate-preview", itemId],
    queryFn: () => services.reallocation.preview(itemId!),
    enabled: !!itemId,
  });
  const plan = preview.data;
  // No group but Booked by Form: a new one is the only way.
  const chosen = choice ?? (plan ? (plan.groups[0]?.id ?? NEW_GROUP) : null);
  const naming = chosen === NEW_GROUP;

  const close = () => {
    setRequest(null);
    setChoice(null);
    setNewName("Re-allocated");
  };

  const run = useMutation({
    mutationFn: () => services.reallocation.reallocate(itemId!, user.id, naming ? { newGroupName: newName.trim() } : { groupId: chosen! }),
    onSuccess: async ({ board }) => {
      if (openItemId === itemId) setOpenItemId(null);
      await queryClient.invalidateQueries({ queryKey: ["board-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["item-links"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      // Off a team's board and back on Task Allocation: both sidebar counts move.
      void queryClient.invalidateQueries({ queryKey: ["board-item-count"] });
      toast.success(`Back on ${board.name}`, { action: { label: "Open", onClick: () => router.push(ws.boardPath(board, { itemId: itemId! })) } });
      close();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not re-allocate the task"),
  });

  if (!itemId) return null;
  const goes = plan
    ? [
        "People in charge and the status",
        plan.updates > 0 ? pluralize(plan.updates, "update") : null,
        plan.activity > 0 ? "Its activity, except the booking" : null,
        plan.subitems > 0 ? pluralize(plan.subitems, "subitem") : null,
        plan.links > 0 ? `Links to ${pluralize(plan.links, "task")} (they keep their own)` : null,
        plan.followers > 0 ? pluralize(plan.followers, "follower") : null,
        plan.assetsReset > 0 ? `People and ticks on ${pluralize(plan.assetsReset, "deliverable")}` : null,
        plan.sheet ? `The link to the sheet “${plan.sheet}” (its assets stay)` : null,
      ].filter((line): line is string => !!line)
    : [];

  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && close()}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto]" data-testid="reallocate-dialog">
        <DialogHeader>
          <DialogTitle>Re-allocate “{item?.name ?? "task"}”?</DialogTitle>
          <DialogDescription>It goes back to {plan?.board.name ?? "Task Allocation"} to be allocated again, as if just booked.</DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin -mx-1 min-h-0 space-y-4 overflow-y-auto px-1 text-[13px]">
          {preview.isLoading ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Checking the task…
            </p>
          ) : preview.error ? (
            <p className="text-destructive">{preview.error instanceof Error ? preview.error.message : "Could not check the task"}</p>
          ) : plan ? (
            <>
              <div className="grid gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">Group on {plan.board.name}</p>
                {plan.groups.length > 0 && (
                  <Select value={chosen ?? undefined} onValueChange={setChoice}>
                    <SelectTrigger className="h-9" aria-label="Group" data-testid="reallocate-group">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {plan.groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value={NEW_GROUP}>New group…</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {naming && (
                  <>
                    {plan.groups.length === 0 && <p className="text-muted-foreground">There is no group besides Booked by Form. Name a new one.</p>}
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} aria-label="New group name" placeholder="Group name" data-testid="reallocate-new-group" />
                  </>
                )}
              </div>

              <div className="space-y-1" data-testid="reallocate-goes">
                <p className="text-xs font-medium text-muted-foreground">Removed</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {goes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1" data-testid="reallocate-stays">
                <p className="text-xs font-medium text-muted-foreground">Kept</p>
                <p>
                  Booked {formatShortDate(plan.bookedAt.slice(0, 10))}, its ticket, description and deliverables
                  {plan.kept.length > 0 ? `, and ${plan.kept.join(", ")}` : ""}.
                </p>
              </div>

              {plan.lost.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2.5" data-testid="reallocate-lost">
                  <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5" /> No column for these on {plan.board.name} ({plan.lost.length})
                  </p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {plan.lost.map((l, i) => (
                      <li key={`${l.columnId}-${i}`}>
                        <span className="text-foreground">{l.columnName}</span>: {l.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={run.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => run.mutate()} disabled={!plan || !chosen || (naming && !newName.trim()) || run.isPending} data-testid="reallocate-confirm">
            {run.isPending && <LoaderCircle className="animate-spin" />} Re-allocate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
