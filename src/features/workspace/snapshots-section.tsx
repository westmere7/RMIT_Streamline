"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Download, History, LoaderCircle, RotateCcw, ShieldAlert, Trash2, Upload } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { callApi } from "@/data/supabase/api-call";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { getSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** What the server says about one snapshot (src/server/snapshots.ts). */
interface SnapshotSummary {
  id: string;
  name: string;
  kind: "manual" | "before_restore" | "upload";
  createdAt: string;
  createdByName: string | null;
  appVersion: string | null;
  sizeBytes: number;
  rowCount: number;
  tableCount: number;
  restoredAt: string | null;
  restoredByName: string | null;
}

const snapshotsKey = (workspaceId: string) => ["snapshots", workspaceId] as const;

async function bearer(): Promise<string> {
  const { data } = await getSupabaseClient().auth.getSession();
  if (!data.session) throw new Error("Your session has expired. Sign in again.");
  return `Bearer ${data.session.access_token}`;
}

/** Reads the `{ error }` a route handler writes, for a request made without callApi. */
async function failure(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: string };
    return new Error(body.error ?? `Request failed (${response.status})`);
  } catch {
    return new Error(`Request failed (${response.status})`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Snapshots of everything the workspace holds, for admins.
 *
 * Taking one saves every table into one file kept in the database. Any of them
 * can be downloaded, and a file downloaded before can be uploaded back. A
 * restore asks for the admin's password and snapshots the present first, so it
 * can itself be undone from this list.
 */
export function SnapshotsSection() {
  const ws = useWorkspace();
  const workspaceId = ws.workspace.id;
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [restoring, setRestoring] = React.useState<SnapshotSummary | null>(null);
  const [deleting, setDeleting] = React.useState<SnapshotSummary | null>(null);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const list = useQuery({
    queryKey: snapshotsKey(workspaceId),
    queryFn: () => callApi<{ snapshots: SnapshotSummary[] }>(`/api/snapshots?workspaceId=${workspaceId}`, { method: "GET" }, { auth: "required" }).then((r) => r.snapshots),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: snapshotsKey(workspaceId) });

  const take = useMutation({
    mutationFn: () => callApi<{ snapshot: SnapshotSummary }>("/api/snapshots", { method: "POST", body: JSON.stringify({ workspaceId, name: name.trim() || undefined }) }, { auth: "required" }),
    onSuccess: async ({ snapshot }) => {
      setName("");
      await refresh();
      toast.success("Snapshot taken", { description: `${snapshot.rowCount.toLocaleString()} rows, ${formatBytes(snapshot.sizeBytes)}` });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not take a snapshot"),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch(`/api/snapshots/upload?workspaceId=${workspaceId}&name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { Authorization: await bearer(), "Content-Type": "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw await failure(response);
      return ((await response.json()) as { snapshot: SnapshotSummary }).snapshot;
    },
    onSuccess: async (snapshot) => {
      await refresh();
      toast.success("Snapshot uploaded", { description: `${snapshot.name} is ready to restore.` });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not upload that file"),
  });

  const download = async (snapshot: SnapshotSummary) => {
    setDownloading(snapshot.id);
    try {
      const response = await fetch(`/api/snapshots/${snapshot.id}/download?workspaceId=${workspaceId}`, { headers: { Authorization: await bearer() } });
      if (!response.ok) throw await failure(response);
      const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "streamline-snapshot.json.gz";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the snapshot");
    } finally {
      setDownloading(null);
    }
  };

  const snapshots = list.data ?? [];
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            take.mutate();
          }}
        >
          <div className="grid min-w-56 flex-1 gap-1.5">
            <Label htmlFor="snapshot-name">Name</Label>
            <Input id="snapshot-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Snapshot, with today's date" maxLength={120} data-testid="snapshot-name" />
          </div>
          <Button type="submit" disabled={take.isPending} data-testid="snapshot-take">
            {take.isPending ? <LoaderCircle className="animate-spin" /> : <Camera />} {take.isPending ? "Taking…" : "Take snapshot"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".gz,.json,application/gzip,application/json"
            hidden
            aria-label="Choose a snapshot file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" disabled={upload.isPending} onClick={() => fileInput.current?.click()} data-testid="snapshot-upload">
            {upload.isPending ? <LoaderCircle className="animate-spin" /> : <Upload />} Upload file
          </Button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs" data-testid="snapshot-list">
        {list.isLoading ? (
          <div className="h-32 animate-pulse" aria-hidden />
        ) : list.error ? (
          <p className="p-4 text-[13px] text-destructive">{list.error instanceof Error ? list.error.message : "Could not load the snapshots"}</p>
        ) : snapshots.length === 0 ? (
          <p className="p-6 text-center text-[13px] text-muted-foreground">No snapshots yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="flex items-center gap-3 px-4 py-3" data-testid="snapshot-row">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", snapshot.kind === "before_restore" ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-surface text-muted-foreground")} aria-hidden>
                  {snapshot.kind === "upload" ? <Upload className="size-4" /> : snapshot.kind === "before_restore" ? <History className="size-4" /> : <Camera className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                    <span className="truncate">{snapshot.name}</span>
                    {snapshot.kind === "before_restore" && <Badge variant="muted">Before a restore</Badge>}
                    {snapshot.kind === "upload" && <Badge variant="muted">Uploaded</Badge>}
                    {snapshot.restoredAt && (
                      <SimpleTooltip label={`Restored ${formatWhen(snapshot.restoredAt)}${snapshot.restoredByName ? ` by ${snapshot.restoredByName}` : ""}`}>
                        <Badge variant="primary">Restored</Badge>
                      </SimpleTooltip>
                    )}
                  </p>
                  <p className="text-2xs text-muted-foreground tabular">
                    {formatWhen(snapshot.createdAt)}
                    {snapshot.createdByName ? ` · ${snapshot.createdByName}` : ""} · {snapshot.rowCount.toLocaleString()} rows · {formatBytes(snapshot.sizeBytes)}
                  </p>
                </div>
                <SimpleTooltip label="Download">
                  <Button variant="ghost" size="icon-sm" aria-label={`Download ${snapshot.name}`} disabled={downloading === snapshot.id} onClick={() => void download(snapshot)} data-testid="snapshot-download">
                    {downloading === snapshot.id ? <LoaderCircle className="animate-spin" /> : <Download />}
                  </Button>
                </SimpleTooltip>
                <Button variant="outline" size="sm" onClick={() => setRestoring(snapshot)} data-testid="snapshot-restore">
                  <RotateCcw /> Restore
                </Button>
                <SimpleTooltip label="Delete">
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${snapshot.name}`} onClick={() => setDeleting(snapshot)} data-testid="snapshot-delete">
                    <Trash2 />
                  </Button>
                </SimpleTooltip>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RestoreDialog snapshot={restoring} onClose={() => setRestoring(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="The snapshot and its file are gone for good. Download it first to keep a copy."
        confirmLabel="Delete snapshot"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await callApi(`/api/snapshots/${deleting.id}?workspaceId=${workspaceId}`, { method: "DELETE" }, { auth: "required" });
            await refresh();
            toast.success("Snapshot deleted");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not delete the snapshot");
          }
        }}
      />
    </div>
  );
}

/**
 * The one step that changes everything, behind the admin's own password.
 * Once it is done the page reloads, so nothing on screen is left over from
 * before.
 */
function RestoreDialog({ snapshot, onClose }: { snapshot: SnapshotSummary | null; onClose: () => void }) {
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const [password, setPassword] = React.useState("");
  const restore = useMutation({
    mutationFn: () =>
      callApi<{ rowCount: number; skippedTables: string[] }>(`/api/snapshots/${snapshot!.id}/restore`, { method: "POST", body: JSON.stringify({ workspaceId: ws.workspace.id, password }) }, { auth: "required" }),
    onSuccess: (result) => {
      toast.success("Restored", { description: `${result.rowCount.toLocaleString()} rows put back. Reloading…` });
      queryClient.clear();
      setTimeout(() => window.location.reload(), 900);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not restore the snapshot"),
  });
  // The password never outlives the dialog.
  const close = () => {
    setPassword("");
    onClose();
  };

  return (
    <Dialog open={snapshot !== null} onOpenChange={(open) => !open && !restore.isPending && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" /> Restore “{snapshot?.name}”?
          </DialogTitle>
          <DialogDescription>
            Everything goes back to {snapshot ? formatWhen(snapshot.createdAt) : ""}, for everyone. The current state is saved as a snapshot first.
          </DialogDescription>
        </DialogHeader>
        <form
          id="snapshot-restore-form"
          className="grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) restore.mutate();
          }}
        >
          <Label htmlFor="snapshot-password">Your password</Label>
          <Input id="snapshot-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus disabled={restore.isPending} data-testid="snapshot-password" />
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close} disabled={restore.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="snapshot-restore-form" variant="destructive" disabled={!password || restore.isPending} data-testid="snapshot-restore-confirm">
            {restore.isPending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />} {restore.isPending ? "Restoring…" : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
