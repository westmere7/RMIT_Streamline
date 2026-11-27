"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Clock3, Copy, Link2, LoaderCircle, Lock, Undo2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { BookingSendBack, Item } from "@/domain";
import { SEND_BACK_NOTE_MAX, isExpiredSendBack, sendBackPath, sendBackRefusal } from "@/domain";
import { useBoardContext, useCanEditUnlocked } from "@/features/boards/board-context";
import { useOpenSendBack, useSendBackMutations } from "@/features/booking/send-back-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { queryKeys } from "@/lib/query/keys";
import type { Services } from "@/services";

/** The requester's link, whole, for copying. */
function linkOf(workspaceSlug: string, sendBack: BookingSendBack): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${sendBackPath(workspaceSlug, sendBack.token)}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link copied");
  } catch {
    toast.error("Could not copy. Select the link and copy it yourself.");
  }
}

/**
 * Whether this task may be sent back now (booked through the form, a task not
 * a subitem, not archived, nobody started), and who asked, for the words.
 */
export function useSendBackOffer(item: Item): { offered: boolean; requester: string } {
  const { model } = useBoardContext();
  const ws = useWorkspace();
  const statusColumn = model.statusColumn;
  const statusValue = statusColumn ? model.getValue(item.id, statusColumn.id) : undefined;
  const labelId = statusValue?.type === "STATUS" ? statusValue.labelId : statusColumn?.settings.kind === "status" ? statusColumn.settings.defaultLabelId : null;
  const offered = !!item.bookedVia && item.parentItemId === null && sendBackRefusal(item, statusColumn ?? null, labelId) === null;
  const column = model.columns.find((c) => c.type === "REQUESTER");
  const value = column ? model.getValue(item.id, column.id) : undefined;
  const id = value && "userIds" in value ? value.userIds[0] : undefined;
  return { offered, requester: (id && ws.userById(id)?.displayName) || "the requester" };
}

/** Refreshes the board behind a send-back or a recall, which change its status and lock. */
function useRefreshBoard() {
  const { board } = useBoardContext();
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    publishDataChange({ kinds: ["items", "board"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(board.id) });
  }, [board.id, queryClient]);
}

/** Recall: the link stops working and the task is the team's again. */
export function useRecallSendBack(item: Item) {
  const { cancel } = useSendBackMutations(item.id);
  const refresh = useRefreshBoard();
  const recall = () =>
    cancel.mutate(undefined, {
      onSuccess: () => {
        toast.success("Send back recalled");
        refresh();
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not recall it"),
    });
  return { recall, pending: cancel.isPending };
}

/**
 * Recall from somewhere that keeps no hooks of its own per task (a row's menu):
 * the same call and refreshes as the panel's button.
 */
export async function recallSendBack(services: Services, queryClient: QueryClient, item: Item, actorId: string): Promise<void> {
  try {
    await services.bookingSendBacks.cancel(item.id, actorId);
    toast.success("Send back recalled");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not recall it");
  } finally {
    publishDataChange({ kinds: ["items", "board"] });
    for (const queryKey of [["send-back", item.id], ["send-backs"], ["comments"], ["activity"], ["internal-portal"], queryKeys.boardSnapshot(item.boardId)]) void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * Asking for what's missing, then the link to pass on: from the task's panel
 * or from its "…" menu. The app sends no email, so the link is the hand-off.
 */
export function SendBackDialog({ item, open, onOpenChange }: { item: Item; open: boolean; onOpenChange: (open: boolean) => void }) {
  const ws = useWorkspace();
  const { requester } = useSendBackOffer(item);
  const { send } = useSendBackMutations(item.id);
  const refresh = useRefreshBoard();
  const [note, setNote] = React.useState("");
  const [sent, setSent] = React.useState<BookingSendBack | null>(null);

  const submit = () => {
    send.mutate(note, {
      onSuccess: (result) => {
        setSent(result);
        setNote("");
        refresh();
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send it back"),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSent(null);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="send-back-dialog">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Link ready</DialogTitle>
              <DialogDescription>Send this to {requester}. The task waits until they answer.</DialogDescription>
            </DialogHeader>
            <LinkRow url={linkOf(ws.slug, sent)} />
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send back to {requester}</DialogTitle>
              <DialogDescription>They get a link to their form, filled in, to add what&apos;s missing.</DialogDescription>
            </DialogHeader>
            <Textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, SEND_BACK_NOTE_MAX))}
              placeholder="What's missing?"
              rows={4}
              aria-label="What's missing"
              data-testid="send-back-note"
            />
            {/* What sending back does to the task, before it is done. */}
            <ul className="space-y-1.5 text-xs leading-snug text-muted-foreground [&_svg]:mt-px [&_svg]:size-3.5 [&_svg]:shrink-0" data-testid="send-back-warning">
              <li className="flex gap-2">
                <Lock className="text-amber-500" /> The task is locked until they answer or you recall it. Updates can still be posted.
              </li>
              <li className="flex gap-2">
                <Clock3 className="text-amber-500" /> Status becomes Waiting, then goes back to the board&apos;s first status.
              </li>
              <li className="flex gap-2">
                <Link2 /> Their answer rewrites what they change. The link works once, for 14 days.
              </li>
            </ul>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={submit} disabled={!note.trim() || send.isPending} data-testid="send-back-submit">
                {send.isPending ? <LoaderCircle className="animate-spin" /> : <Undo2 />} Send back
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sending a booked task back to its requester, on the task's panel.
 *
 * Offered on a task booked through the form that nobody has started. While it
 * waits, the panel says so with the note and the link, and the task is locked
 * (ItemEditScope) until the requester answers or the team recalls it.
 */
export function SendBackSection({ item }: { item: Item }) {
  const canAct = useCanEditUnlocked();
  const ws = useWorkspace();
  const booked = !!item.bookedVia && item.parentItemId === null;
  const open = useOpenSendBack(item.id, canAct && booked);
  const { offered, requester } = useSendBackOffer(item);
  const { recall, pending } = useRecallSendBack(item);
  const [asking, setAsking] = React.useState(false);

  if (!canAct || !booked || open.isLoading) return null;
  const waiting = open.data ?? null;
  if (!waiting && !offered) return null;

  // In the same place in both states: "Link ready" is shown just as the task
  // starts waiting, and a dialog that moved in the tree would start over.
  const dialog = <SendBackDialog key="send-back-dialog" item={item} open={asking} onOpenChange={setAsking} />;

  if (!waiting) {
    return (
      <>
        <Button type="button" variant="outline" size="sm" className="w-full justify-center" onClick={() => setAsking(true)} data-testid="send-back-open">
          <Undo2 /> Send back
        </Button>
        {dialog}
      </>
    );
  }

  const expired = isExpiredSendBack(waiting);
  return (
    <>
    <section className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-[13px] shadow-xs dark:border-amber-400/30 dark:bg-amber-500/10" data-testid="send-back-waiting">
      <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
        <Undo2 className="size-3.5" aria-hidden /> Sent back to {requester}
        <RelativeTime iso={waiting.sentAt} className="font-normal text-amber-800/70 dark:text-amber-200/60" />
      </p>
      <p className="mt-1.5 whitespace-pre-line text-amber-950/90 dark:text-amber-100/90" data-testid="send-back-note-shown">
        {waiting.note}
      </p>
      {expired ? (
        <p className="mt-2 text-amber-900/80 dark:text-amber-200/70">The link has expired. Recall the send back, then send it back again for a new link.</p>
      ) : (
        <div className="mt-2.5">
          <LinkRow url={linkOf(ws.slug, waiting)} />
        </div>
      )}
      <div className="mt-2.5 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={recall} disabled={pending} data-testid="send-back-cancel">
          {pending && <LoaderCircle className="animate-spin" />} Recall send back
        </Button>
      </div>
    </section>
    {dialog}
    </>
  );
}

function LinkRow({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-2xs" aria-label="Link for the requester" data-testid="send-back-link" />
      <Button type="button" size="sm" variant="outline" onClick={() => void copy(url)} data-testid="send-back-copy">
        <Copy /> Copy
      </Button>
    </div>
  );
}
