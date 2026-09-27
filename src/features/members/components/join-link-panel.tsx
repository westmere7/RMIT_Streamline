"use client";

import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Link2, LoaderCircle, RefreshCw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "../hooks";

/**
 * The workspace's join link, at the top of "Add member" wherever people are invited.
 *
 * One address for the whole team: each person who opens it types their own name
 * and email and is added as a pending member with a personal link, the same as
 * adding them by hand. Off by default; a new link retires the old one.
 */
export function JoinLinkPanel() {
  const ws = useWorkspace();
  const services = useServices();
  const key = ws.workspace.joinKey ?? null;
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const url = key ? (typeof window === "undefined" ? routes.selfJoin(key) : new URL(routes.selfJoin(key), window.location.origin).toString()) : "";

  const set = useMutation({
    mutationFn: (on: boolean) => services.workspace.setJoinLink(ws.workspace.id, on),
    onSuccess: async (_workspace, on) => {
      await ws.refresh();
      toast.success(on ? (key ? "New join link made. The old one no longer works." : "Join link is on") : "Join link is off");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not change the join link"),
  });

  const copy = async () => {
    if (await copyToClipboard(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      inputRef.current?.select();
    }
  };

  return (
    <section className={cn("space-y-3 rounded-xl border p-3.5 transition-colors", key ? "border-accent-soft-foreground/40 bg-accent-soft/60" : "border-border/70 bg-surface-strong/30")} data-testid="join-link-panel">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", key ? "bg-accent-soft text-accent-soft-foreground" : "bg-surface-strong text-muted-foreground")}>
          <Link2 className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Join link</p>
          <p className="text-xs text-muted-foreground">One link for everyone to sign themselves up.</p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {set.isPending && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />}
          <Switch checked={!!key} onCheckedChange={(on) => set.mutate(on)} disabled={set.isPending} aria-label="Join link" data-testid={key ? "join-link-off" : "join-link-on"} />
        </span>
      </div>
      {key && (
        <div className="flex gap-2">
          <Input ref={inputRef} readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Join link address" data-testid="join-link" className="h-9 bg-background/70 font-mono text-xs max-md:h-11" />
          <Button type="button" onClick={() => void copy()} className="shrink-0 bg-ring text-white hover:bg-ring/90" data-testid="join-link-copy">
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => set.mutate(true)} disabled={set.isPending} className="shrink-0" title="New link; the old one stops working" aria-label="New link" data-testid="join-link-new">
            <RefreshCw />
          </Button>
        </div>
      )}
    </section>
  );
}
