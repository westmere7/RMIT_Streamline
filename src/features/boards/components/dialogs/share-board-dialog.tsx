"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, KeyRound, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Board, BoardShare } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { copyToClipboard } from "@/features/members/hooks";
import { todayISO } from "@/lib/dates/dates";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import type { ShareSettings } from "@/services";

/**
 * Whether this board has a link, for the badge in its header. A plain read: a
 * header has no business holding the mutations that change the link, and one
 * that did would re-render on every mutation anywhere in the app.
 */
export function useBoardShareStatus(boardId: string) {
  const services = useServices();
  return useQuery({ queryKey: queryKeys.boardShare(boardId), queryFn: () => services.shares.get(boardId), staleTime: 60_000 });
}

/** The board's link and the mutations that shape it. */
export function useBoardShare(boardId: string) {
  const user = useCurrentUser();
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.boardShare(boardId);

  const share = useBoardShareStatus(boardId);

  const settled = { onSettled: () => queryClient.invalidateQueries({ queryKey: key }) };
  const failed = (fallback: string) => (error: unknown) => toast.error(error instanceof Error ? error.message : fallback);

  const save = useMutation({
    mutationFn: (settings: ShareSettings) => services.shares.save(boardId, user.id, settings),
    onSuccess: (next) => queryClient.setQueryData(key, next),
    onError: failed("Could not change the link"),
    ...settled,
  });
  const regenerate = useMutation({
    mutationFn: () => services.shares.regenerate(boardId, user.id),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      toast.success("New link ready. The old one no longer opens this board.");
    },
    onError: failed("Could not create a new link"),
    ...settled,
  });
  const stop = useMutation({
    mutationFn: () => services.shares.remove(boardId),
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
 * Sharing a board with people who have no account.
 *
 * The link shows this board and nothing else, and cannot change anything.
 * Turning it off keeps its address for later; "New link" replaces the address,
 * which is how to shut out a copy that has travelled too far.
 *
 * The same panel appears in the board menu and in board settings, so wherever
 * someone looks for it, they get the one link and the same controls.
 */
export function ShareBoardDialog({ board, open, onOpenChange }: { board: Board; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent size="md" data-testid="share-dialog">
          <DialogHeader>
            <DialogTitle>Share {board.name}</DialogTitle>
            <DialogDescription>Anyone with the link can read this board. Nothing else, and nothing they can change.</DialogDescription>
          </DialogHeader>
          <BoardSharePanel board={board} />
        </DialogContent>
      )}
    </Dialog>
  );
}

/** The link and its settings, with no frame of its own. */
export function BoardSharePanel({ board }: { board: Board }) {
  const { share, save, regenerate, stop } = useBoardShare(board.id);
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
        <p className="text-[13px] text-muted-foreground">Not shared. A link makes this board readable by anyone who has it.</p>
        <Button onClick={() => save.mutate({ enabled: true })} disabled={busy} data-testid="share-create">
          {save.isPending ? <LoaderCircle className="animate-spin" /> : null} Create a share link
        </Button>
      </div>
    );
  }
  return <ShareControls share={current} busy={busy} onSave={(settings) => save.mutate(settings)} onRegenerate={() => regenerate.mutate()} onStop={() => stop.mutate()} />;
}

function ShareControls({
  share,
  busy,
  onSave,
  onRegenerate,
  onStop,
}: {
  share: BoardShare;
  busy: boolean;
  onSave: (settings: ShareSettings) => void;
  onRegenerate: () => void;
  onStop: () => void;
}) {
  const [password, setPassword] = React.useState("");
  const [confirmingNew, setConfirmingNew] = React.useState(false);
  // This only ever mounts in the browser, where the address bar is what a
  // visitor would paste.
  const url = `${typeof window === "undefined" ? "" : window.location.origin}${routes.share(share.token)}`;
  const expired = !!share.expiresAt && share.expiresAt < todayISO();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input aria-label="Share link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" data-testid="share-link" />
        <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => void copyToClipboard(url)} data-testid="share-copy">
          <Copy />
        </Button>
        <Button variant="outline" size="icon" aria-label="Open link" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink />
          </a>
        </Button>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/60 bg-surface/40 px-3.5 py-3 text-[13px] font-medium">
        Link is on
        <Switch checked={share.enabled} disabled={busy} onCheckedChange={(enabled) => onSave({ enabled })} aria-label="Link is on" data-testid="share-enabled" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="share-expires">Stops working after</Label>
          <div className="flex gap-2">
            <Input
              id="share-expires"
              type="date"
              value={share.expiresAt ?? ""}
              min={todayISO()}
              disabled={busy}
              onChange={(e) => onSave({ expiresAt: e.currentTarget.value || null })}
              data-testid="share-expires"
            />
            {share.expiresAt && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onSave({ expiresAt: null })} data-testid="share-expires-clear">
                Clear
              </Button>
            )}
          </div>
          {expired && <p className="text-2xs text-destructive">Expired.</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="share-password">Password</Label>
          {share.passwordHash ? (
            <div className="flex items-center gap-2">
              <span className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-surface/40 px-3 text-[13px] text-muted-foreground">
                <KeyRound className="size-3.5" /> Protected
              </span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onSave({ password: null })} data-testid="share-password-remove">
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                id="share-password"
                type="password"
                autoComplete="new-password"
                placeholder="Optional"
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.currentTarget.value)}
                data-testid="share-password"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={busy || password.trim().length < 4}
                onClick={() => {
                  onSave({ password: password.trim() });
                  setPassword("");
                }}
                data-testid="share-password-set"
              >
                Set
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy} onClick={onStop} data-testid="share-stop">
          <Trash2 /> Stop sharing
        </Button>
        {confirmingNew ? (
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Retire this link?
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                setConfirmingNew(false);
                onRegenerate();
              }}
              data-testid="share-regenerate-confirm"
            >
              Yes
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingNew(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmingNew(true)} data-testid="share-regenerate">
            <RefreshCw /> New link
          </Button>
        )}
      </div>
    </div>
  );
}
