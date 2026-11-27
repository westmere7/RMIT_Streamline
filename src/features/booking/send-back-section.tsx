"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Copy, LoaderCircle, Undo2 } from "lucide-react";
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
 * Sending a booked task back to its requester, on the task's panel.
 *
 * Offered on a task booked through the form that nobody has started. While it
 * waits, the panel says so with the note and the link, and the task is locked
 * (ItemEditScope) until the requester answers or the team takes it back.
 */
export function SendBackSection({ item }: { item: Item }) {
  const { model, board } = useBoardContext();
  const canAct = useCanEditUnlocked();
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const booked = !!item.bookedVia && item.parentItemId === null;
  const open = useOpenSendBack(item.id, canAct && booked);
  const { send, cancel } = useSendBackMutations(item.id);
  const [asking, setAsking] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [sent, setSent] = React.useState<BookingSendBack | null>(null);

  if (!canAct || !booked) return null;
  const waiting = open.data ?? null;
  const statusColumn = model.statusColumn;
  const statusValue = statusColumn ? model.getValue(item.id, statusColumn.id) : undefined;
  const refusal = sendBackRefusal(item, statusColumn ?? null, statusValue?.type === "STATUS" ? statusValue.labelId : statusColumn?.settings.kind === "status" ? statusColumn.settings.defaultLabelId : null);
  if (!waiting && refusal) return null;
  if (open.isLoading) return null;

  const refreshBoard = () => {
    publishDataChange({ kinds: ["items", "board"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(board.id) });
  };

  const submit = () => {
    send.mutate(note, {
      onSuccess: (result) => {
        setSent(result);
        setNote("");
        refreshBoard();
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send it back"),
    });
  };

  const takeBack = () => {
    cancel.mutate(undefined, {
      onSuccess: () => {
        toast.success("Send back recalled");
        refreshBoard();
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not recall it"),
    });
  };

  const requesterOf = (): string => {
    const column = model.columns.find((c) => c.type === "REQUESTER");
    const value = column ? model.getValue(item.id, column.id) : undefined;
    const id = value && "userIds" in value ? value.userIds[0] : undefined;
    return (id && ws.userById(id)?.displayName) || "the requester";
  };

  const dialog = (
    <Dialog
      open={asking}
      onOpenChange={(next) => {
        setAsking(next);
        if (!next) setSent(null);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="send-back-dialog">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Link ready</DialogTitle>
              <DialogDescription>Send this to {requesterOf()}. The task waits until they answer.</DialogDescription>
            </DialogHeader>
            <LinkRow url={linkOf(ws.slug, sent)} />
            <DialogFooter>
              <Button type="button" onClick={() => setAsking(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send back to {requesterOf()}</DialogTitle>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAsking(false)}>
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

  if (!waiting) {
    return (
      <>
        <Button type="button" variant="outline" size="sm" className="w-full justify-center" onClick={() => setAsking(true)} data-testid="send-back-open">
          <Undo2 /> Send back for more information
        </Button>
        {dialog}
      </>
    );
  }

  const expired = isExpiredSendBack(waiting);
  return (
    <section className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-[13px] shadow-xs dark:border-amber-400/30 dark:bg-amber-500/10" data-testid="send-back-waiting">
      <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
        <Undo2 className="size-3.5" aria-hidden /> Sent back to {requesterOf()}
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
        <Button type="button" variant="outline" size="sm" onClick={takeBack} disabled={cancel.isPending} data-testid="send-back-cancel">
          {cancel.isPending && <LoaderCircle className="animate-spin" />} Recall send back
        </Button>
      </div>
      {/* Still mounted once it waits: "Link ready" is shown just as the task starts waiting. */}
      {dialog}
    </section>
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
