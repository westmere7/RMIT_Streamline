"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, TriangleAlert } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { BlockingScreen } from "@/components/shared/blocking-screen";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/data/supabase/api-call";
import { formatTicket } from "@/domain";
import { useWorkspace } from "@/features/workspace/workspace-context";

const GOES = ["Every board, with its groups and columns", "Every task and subitem, and what is in them", "Deliverables, updates, comments and links", "Board shares and automations", "Every tracker and its sheets", "The activity and notifications about them"];
const STAYS = ["Settings, lists and departments", "Teams, members and roles", "The booking form and portals", "Messages and snapshots", "Task Allocation, emptied"];

/**
 * Settings → Danger zone: what cannot be done by accident. Admins and owners
 * only (the page and the server both check), and always behind the admin's
 * own password.
 */
export function DangerZoneSection() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-destructive/40 bg-card p-5 shadow-xs" data-testid="danger-wipe-boards">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive" aria-hidden>
            <TriangleAlert className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold">Wipe all board data</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">For a clean start. A snapshot is taken first, so it can be undone from Snapshots.</p>
          </div>
          <Button variant="destructive" onClick={() => setOpen(true)} data-testid="danger-wipe-open">
            <Trash2 /> Wipe board data
          </Button>
        </div>
        <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
          <List title="Goes" items={GOES} />
          <List title="Stays" items={STAYS} />
        </div>
      </section>
      <WipeDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item} className="text-[13px]">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WipeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const [password, setPassword] = React.useState("");
  const [resetTickets, setResetTickets] = React.useState(false);
  const [done, setDone] = React.useState<{ boards: number; tasks: number; trackers: number; ticketsReset: boolean } | null>(null);
  const firstTicket = formatTicket(ws.workspace.ticketPrefix, 1);
  const wipe = useMutation({
    mutationFn: () =>
      callApi<{ boards: number; tasks: number; trackers: number; ticketsReset: boolean }>("/api/snapshots/wipe-boards", { method: "POST", body: JSON.stringify({ workspaceId: ws.workspace.id, password, resetTickets }) }, { auth: "required" }),
    onSuccess: (result) => {
      setPassword("");
      setDone(result);
      queryClient.clear();
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not wipe the board data"),
  });
  // The password never outlives the dialog.
  const close = () => {
    setPassword("");
    setResetTickets(false);
    onClose();
  };
  const busy = wipe.isPending || done !== null;

  return (
    <>
      <Dialog open={open && !busy} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-destructive" /> Wipe all board data?
            </DialogTitle>
            <DialogDescription>Every board, task and tracker goes, for everyone. Settings, lists and people stay.</DialogDescription>
          </DialogHeader>
          <form
            id="danger-wipe-form"
            className="grid gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (password) wipe.mutate();
            }}
          >
            <Label htmlFor="danger-wipe-password">Your password</Label>
            <Input id="danger-wipe-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus data-testid="danger-wipe-password" />
            <label className="mt-2 flex items-center gap-2 text-[13px]">
              <Checkbox checked={resetTickets} onCheckedChange={(checked) => setResetTickets(checked === true)} data-testid="danger-wipe-reset-tickets" />
              Start tickets again from <span className="font-mono">{firstTicket}</span>
            </label>
          </form>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form="danger-wipe-form" variant="destructive" disabled={!password} data-testid="danger-wipe-confirm">
              <Trash2 /> Wipe board data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {busy && (
        <BlockingScreen
          title="Wiping board data"
          detail="Saving a snapshot, then removing every board and task. Keep this tab open."
          done={done ? { title: "Board data wiped", detail: `${done.boards} boards, ${done.tasks.toLocaleString()} tasks and ${done.trackers} trackers removed.${done.ticketsReset ? ` Tickets start again from ${firstTicket}.` : ""} Reloading…` } : null}
        />
      )}
    </>
  );
}
