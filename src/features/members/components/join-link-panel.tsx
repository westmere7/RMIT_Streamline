"use client";

import { useMutation } from "@tanstack/react-query";
import { Check, Copy, LoaderCircle, RefreshCw } from "lucide-react";
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
 * The workspace's join link, under "Add member" wherever people are invited.
 *
 * One address for the whole team: each person who opens it types their own name
 * and email and is added as a pending member with a personal link, the same as
 * adding them by hand. Off by default; a new link retires the old one.
 */
export function JoinLinkPanel({ compact = false }: { compact?: boolean }) {
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
    <div className={cn(compact ? "space-y-2.5" : "space-y-3")} data-testid="join-link-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">Join link</p>
          <p className="text-2xs text-muted-foreground">One link for everyone: each person enters their own details. Emails already here are turned away.</p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {set.isPending && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />}
          <Switch checked={!!key} onCheckedChange={(on) => set.mutate(on)} disabled={set.isPending} aria-label="Join link" data-testid={key ? "join-link-off" : "join-link-on"} />
        </span>
      </div>
      {key && (
        <div className="flex gap-2">
          <Input ref={inputRef} readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Join link address" data-testid="join-link" className="h-8 font-mono text-xs" />
          <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className="shrink-0" data-testid="join-link-copy">
            {copied ? <Check className="text-green-600" /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => set.mutate(true)} disabled={set.isPending} className="shrink-0" title="Make a new link; the old one stops working" data-testid="join-link-new">
            <RefreshCw /> New
          </Button>
        </div>
      )}
    </div>
  );
}
