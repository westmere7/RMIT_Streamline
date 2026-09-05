"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkspaceInvitation } from "@/domain";
import { formatDateTime } from "@/lib/dates/dates";
import { copyToClipboard, invitationUrl } from "../hooks";

/**
 * The invitation link, ready to copy. Shown right after a member is added and
 * again from the members list, because nothing is emailed: the admin has to get
 * this into the person's hands themselves.
 */
export function InviteLinkPanel({ invitation, personName }: { invitation: WorkspaceInvitation; personName: string }) {
  const url = invitationUrl(invitation);
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const copy = async () => {
    if (await copyToClipboard(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      inputRef.current?.select();
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">
        Send this link to <span className="font-medium text-foreground">{personName}</span> by email, Teams or chat. Opening it lets them set a password and finish their profile; until then they show as pending and cannot sign in.
      </p>
      <div className="flex gap-2">
        <Input ref={inputRef} readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" data-testid="invite-link" className="font-mono text-xs" />
        <Button type="button" variant="outline" onClick={() => void copy()} data-testid="copy-invite-link" className="shrink-0">
          {copied ? <Check className="text-green-600" /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-2xs text-muted-foreground">
        Works once, for this person only. Expires {formatDateTime(invitation.expiresAt)}. You can generate a new link from the members list at any time; the old one stops working.
      </p>
    </div>
  );
}
