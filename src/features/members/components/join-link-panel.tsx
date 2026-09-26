"use client";

import { useMutation } from "@tanstack/react-query";
import { Check, Copy, LoaderCircle, RefreshCw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import { copyToClipboard } from "../hooks";

/**
 * The workspace's join link, beside "Add a person" wherever people are invited.
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

  if (!key) {
    return (
      <div className="space-y-3" data-testid="join-link-panel">
        <p className="text-[13px] text-muted-foreground">One link for everyone. Each person enters their own name and email, then sets a password as anyone invited does.</p>
        <Button onClick={() => set.mutate(true)} disabled={set.isPending} data-testid="join-link-on">
          {set.isPending ? <LoaderCircle className="animate-spin" /> : null} Turn on the join link
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="join-link-panel">
      <p className="text-[13px] text-muted-foreground">Anyone with this link can add themselves as a pending member. An email already in the workspace is turned away.</p>
      <div className="flex gap-2">
        <Input ref={inputRef} readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Join link" data-testid="join-link" className="font-mono text-xs" />
        <Button type="button" variant="outline" onClick={() => void copy()} className="shrink-0" data-testid="join-link-copy">
          {copied ? <Check className="text-green-600" /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => set.mutate(true)} disabled={set.isPending} data-testid="join-link-new">
          <RefreshCw /> New link
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => set.mutate(false)} disabled={set.isPending} data-testid="join-link-off">
          Turn off
        </Button>
      </div>
    </div>
  );
}
