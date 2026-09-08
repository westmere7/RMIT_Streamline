"use client";

import { Copy, ExternalLink, KeyRound, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { DashboardShare } from "@/domain";
import { useDashboardShare } from "@/features/dashboard/hooks";
import { copyToClipboard } from "@/features/members/hooks";
import { todayISO } from "@/lib/dates/dates";
import { routes } from "@/lib/routes";
import type { DashboardShareSettings } from "@/services";

/**
 * Sharing the dashboard with people who have no account: a full-screen,
 * read-only page of the same charts, refreshed on its own. The link shows
 * figures only — no briefs, no contact details, no requester names.
 */
export function ShareDashboardDialog({ workspaceId, workspaceName, open, onOpenChange }: { workspaceId: string; workspaceName: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent size="md" data-testid="dashboard-share-dialog">
          <DialogHeader>
            <DialogTitle>Share the {workspaceName} dashboard</DialogTitle>
            <DialogDescription>Anyone with the link sees the live figures, full screen, without signing in.</DialogDescription>
          </DialogHeader>
          <DashboardSharePanel workspaceId={workspaceId} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function DashboardSharePanel({ workspaceId }: { workspaceId: string }) {
  const { share, save, regenerate, stop } = useDashboardShare(workspaceId);
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
        <p className="text-[13px] text-muted-foreground">Not shared yet.</p>
        <Button onClick={() => save.mutate({ enabled: true })} disabled={busy} data-testid="dashboard-share-create">
          {save.isPending ? <LoaderCircle className="animate-spin" /> : null} Create a share link
        </Button>
      </div>
    );
  }
  return <ShareControls share={current} busy={busy} onSave={(s) => save.mutate(s)} onRegenerate={() => regenerate.mutate()} onStop={() => stop.mutate()} />;
}

function ShareControls({ share, busy, onSave, onRegenerate, onStop }: { share: DashboardShare; busy: boolean; onSave: (settings: DashboardShareSettings) => void; onRegenerate: () => void; onStop: () => void }) {
  const [password, setPassword] = React.useState("");
  const [confirmingNew, setConfirmingNew] = React.useState(false);
  const url = `${typeof window === "undefined" ? "" : window.location.origin}${routes.dashboardShare(share.token)}`;
  const expired = !!share.expiresAt && share.expiresAt < todayISO();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input aria-label="Share link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" data-testid="dashboard-share-link" />
        <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => void copyToClipboard(url)} data-testid="dashboard-share-copy">
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
        <Switch checked={share.enabled} disabled={busy} onCheckedChange={(enabled) => onSave({ enabled })} aria-label="Link is on" data-testid="dashboard-share-enabled" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dashboard-share-expires">Stops working after</Label>
          <div className="flex gap-2">
            <Input id="dashboard-share-expires" type="date" value={share.expiresAt ?? ""} min={todayISO()} disabled={busy} onChange={(e) => onSave({ expiresAt: e.currentTarget.value || null })} />
            {share.expiresAt && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onSave({ expiresAt: null })}>
                Clear
              </Button>
            )}
          </div>
          {expired && <p className="text-2xs text-destructive">Expired.</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="dashboard-share-password">Password</Label>
          {share.passwordHash ? (
            <div className="flex items-center gap-2">
              <span className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-surface/40 px-3 text-[13px] text-muted-foreground">
                <KeyRound className="size-3.5" /> Protected
              </span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onSave({ password: null })}>
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input id="dashboard-share-password" type="password" autoComplete="new-password" placeholder="Optional" value={password} disabled={busy} onChange={(e) => setPassword(e.currentTarget.value)} />
              <Button
                variant="outline"
                size="sm"
                disabled={busy || password.trim().length < 4}
                onClick={() => {
                  onSave({ password: password.trim() });
                  setPassword("");
                }}
              >
                Set
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy} onClick={onStop} data-testid="dashboard-share-stop">
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
            >
              Yes
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingNew(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmingNew(true)}>
            <RefreshCw /> New link
          </Button>
        )}
      </div>
    </div>
  );
}
