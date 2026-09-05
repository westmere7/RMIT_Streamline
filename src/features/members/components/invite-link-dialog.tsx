"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { User, WorkspaceInvitation } from "@/domain";
import { useMemberMutations } from "../hooks";
import { InviteLinkPanel } from "./invite-link-panel";

/**
 * The invitation link of a pending member, looked up again from the members
 * list. When no live link exists (expired, or the row predates this feature)
 * the dialog offers to generate one.
 */
export function InviteLinkDialog({
  user,
  invitation,
  open,
  onOpenChange,
}: {
  user: User;
  invitation: WorkspaceInvitation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { regenerate } = useMemberMutations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="invite-link-dialog">
        <DialogHeader>
          <DialogTitle>Invitation link for {user.displayName}</DialogTitle>
          <DialogDescription>{invitation ? "Pass this on however you like; nothing is emailed." : "There is no working link for this person right now."}</DialogDescription>
        </DialogHeader>
        {invitation ? (
          <InviteLinkPanel invitation={invitation} personName={user.displayName} />
        ) : (
          <p className="text-[13px] text-muted-foreground">Their previous link has expired or was cancelled. Generate a new one and send it to them.</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={regenerate.isPending} onClick={() => regenerate.mutate(user.id)} data-testid="regenerate-invite-link">
            {regenerate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {invitation ? "Generate new link" : "Generate link"}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
