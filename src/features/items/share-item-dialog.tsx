"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Item } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { ShareControls, shareUrl } from "@/features/boards/components/dialogs/share-board-dialog";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import type { ShareSettings } from "@/services";

/** Whether this task has a link, for the badge on its panel. */
export function useItemShareStatus(itemId: string) {
  const services = useServices();
  return useQuery({ queryKey: queryKeys.itemShare(itemId), queryFn: () => services.itemShares.get(itemId), staleTime: 60_000 });
}

/** The task's link and the mutations that shape it. */
export function useItemShare(itemId: string) {
  const user = useCurrentUser();
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.itemShare(itemId);

  const share = useItemShareStatus(itemId);
  const settled = { onSettled: () => queryClient.invalidateQueries({ queryKey: key }) };
  const failed = (fallback: string) => (error: unknown) => toast.error(error instanceof Error ? error.message : fallback);

  const save = useMutation({
    mutationFn: (settings: ShareSettings) => services.itemShares.save(itemId, user.id, settings),
    onSuccess: (next) => queryClient.setQueryData(key, next),
    onError: failed("Could not change the link"),
    ...settled,
  });
  const regenerate = useMutation({
    mutationFn: () => services.itemShares.regenerate(itemId, user.id),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      toast.success("New link ready. The old one no longer opens this task.");
    },
    onError: failed("Could not create a new link"),
    ...settled,
  });
  const stop = useMutation({
    mutationFn: () => services.itemShares.remove(itemId),
    onSuccess: () => {
      queryClient.setQueryData(key, null);
      toast.success("Sharing stopped");
    },
    onError: failed("Could not stop sharing"),
    ...settled,
  });

  return { share, save, regenerate, stop };
}

/**
 * Sharing one task by link.
 *
 * The smaller thing to hand over: a printer, an agency or a colleague on another
 * team gets this brief, its deliverables and its updates, and nothing else from
 * the board. The same controls as a board's link, because it is the same door —
 * on or off, who may open it, an expiry, a password.
 */
export function ShareItemDialog({ item, open, onOpenChange }: { item: Item; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent size="md" data-testid="share-item-dialog">
          <DialogHeader>
            <DialogTitle>Share {item.name}</DialogTitle>
            <DialogDescription>A link that opens this task alone, read-only. The rest of the board stays where it is.</DialogDescription>
          </DialogHeader>
          <ItemSharePanel item={item} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function ItemSharePanel({ item }: { item: Item }) {
  const { share, save, regenerate, stop } = useItemShare(item.id);
  const current = share.data ?? null;
  const busy = save.isPending || regenerate.isPending || stop.isPending;

  if (share.isPending) {
    return (
      <div className="flex h-28 items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
      </div>
    );
  }
  if (!current) {
    return (
      <div className="space-y-3 py-1">
        <p className="text-[13px] text-muted-foreground">Not shared. A link makes this task readable by whoever you choose to let in.</p>
        <Button onClick={() => save.mutate({ enabled: true })} disabled={busy} data-testid="item-share-create">
          {save.isPending ? <LoaderCircle className="animate-spin" /> : null} Create a share link
        </Button>
      </div>
    );
  }
  return (
    <ShareControls
      share={current}
      what="task"
      url={shareUrl(routes.itemShare(current.token))}
      busy={busy}
      onSave={(settings) => save.mutate(settings)}
      onRegenerate={() => regenerate.mutate()}
      onStop={() => stop.mutate()}
    />
  );
}
