"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useUiStore } from "@/stores/ui-store";

/**
 * Says whose view of the workspace is on screen while an admin is reading it as
 * a colleague, and gets them out of it again.
 *
 * The preview is exactly that: boards, teams and the things a person is allowed
 * to do follow the colleague's access, but the page is still fetched with the
 * admin's own, and anything saved is saved as the admin. So it answers "what
 * does this person see" rather than "what would the database let them read".
 */
export function ViewingAsBanner() {
  const ws = useWorkspace();
  const setViewAsUserId = useUiStore((s) => s.setViewAsUserId);
  if (!ws.viewingAs) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-[13px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" role="status" data-testid="viewing-as-banner">
      <span className="flex items-center gap-2 font-medium">
        <Eye className="size-4" />
        <UserAvatar user={ws.viewingAs} size="xs" tooltip={false} />
        Viewing as {ws.viewingAs.displayName}
      </span>
      <span className="min-w-0 text-amber-800/80 dark:text-amber-200/70">You see what they can see. You are still signed in as yourself, and anything you change is saved as you.</span>
      <Button type="button" size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => setViewAsUserId(null)} data-testid="viewing-as-exit">
        Back to your view
      </Button>
    </div>
  );
}
