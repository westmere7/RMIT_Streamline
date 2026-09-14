"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTicket, normaliseTicketPrefix, TICKET_PREFIX_MAX, ticketPrefixOf } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";

/**
 * What this workspace stamps on its tickets.
 *
 * The prefix is the only part of a ticket anybody chooses; the number after it
 * is the workspace's own count. Changing it is a decision about codes that are
 * already in other people's inboxes and spreadsheets, so the tickets already
 * handed out are left alone unless somebody says otherwise — and that is asked
 * as a question with the safe answer in front.
 */
export function TicketSettings({ manage }: { manage: boolean }) {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const current = ticketPrefixOf(ws.workspace.ticketPrefix);
  const [draft, setDraft] = React.useState(current);
  const [asking, setAsking] = React.useState(false);

  // Only needed to say how many would be rewritten, and only once the dialog is
  // on its way up: a workspace's whole ticket list is not worth reading to draw
  // a text box.
  const ticketed = useQuery({
    queryKey: queryKeys.ticketCount(ws.workspace.id),
    queryFn: () => services.tickets.countTicketed(ws.workspace.id),
    enabled: asking,
    staleTime: 30_000,
  });

  const next = normaliseTicketPrefix(draft);
  const changed = !!next && next !== current;

  const save = useMutation({
    mutationFn: (rewriteExisting: boolean) => services.tickets.setPrefix(ws.workspace.id, next!, { rewriteExisting }),
    onSuccess: async (result) => {
      setAsking(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(ws.slug) });
      void queryClient.invalidateQueries({ queryKey: ["board-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketCount(ws.workspace.id) });
      toast.success(result.rewritten > 0 ? `${result.rewritten} tickets are now ${result.prefix}_` : `New tickets will be ${result.prefix}_`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not change the prefix"),
  });

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="ws-ticket-prefix">Ticket prefix</Label>
      <div className="flex items-center gap-2">
        <Input
          id="ws-ticket-prefix"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          maxLength={TICKET_PREFIX_MAX}
          disabled={!manage}
          className="w-28 font-mono uppercase"
          data-testid="ticket-prefix-input"
        />
        <p className="text-[13px] text-muted-foreground">
          Next: <span className="font-mono tabular">{formatTicket(next ?? current, (ws.workspace.ticketCounter ?? 0) + 1)}</span>
        </p>
      </div>
      {manage && (
        <div>
          <Button type="button" size="sm" className="mt-1.5" disabled={!changed || save.isPending} onClick={() => setAsking(true)} data-testid="ticket-prefix-save">
            Change prefix
          </Button>
        </div>
      )}

      {/* Nothing may close this while the write is out: the buttons go, the
          escape key and the overlay are refused, and the one line left says
          what is happening. A prefix change is two writes deep in a database on
          the other side of the world, and a dialog that looked closable was
          read as a dialog that had hung. */}
      <Dialog open={asking} onOpenChange={(open) => !open && !save.isPending && setAsking(false)}>
        <DialogContent
          data-testid="ticket-prefix-dialog"
          hideClose={save.isPending}
          onEscapeKeyDown={(e) => save.isPending && e.preventDefault()}
          onPointerDownOutside={(e) => save.isPending && e.preventDefault()}
          onInteractOutside={(e) => save.isPending && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              Tickets become {next}_
            </DialogTitle>
            <DialogDescription data-testid="ticket-prefix-status">
              {save.isPending ? (
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  {save.variables ? `Rewriting ${ticketed.data ?? 0} ${ticketed.data === 1 ? "ticket" : "tickets"}…` : "Saving the prefix…"}
                </span>
              ) : ticketed.data === undefined ? (
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-3.5 animate-spin" /> Counting the tickets already handed out…
                </span>
              ) : ticketed.data === 0 ? (
                "Nothing has been ticketed yet, so there is nothing to rewrite."
              ) : (
                `${ticketed.data} ${ticketed.data === 1 ? "task is" : "tasks are"} already ${current}_, and that is what people were told. Rewriting keeps their numbers.`
              )}
            </DialogDescription>
          </DialogHeader>
          {!save.isPending && (
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" onClick={() => setAsking(false)} variant="outline">
                Cancel
              </Button>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!ticketed.data}
                  onClick={() => save.mutate(true)}
                  data-testid="ticket-prefix-rewrite"
                >
                  Rewrite {ticketed.data ?? 0}
                </Button>
                <Button type="button" onClick={() => save.mutate(false)} data-testid="ticket-prefix-keep">
                  Use for new tickets
                </Button>
              </span>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
