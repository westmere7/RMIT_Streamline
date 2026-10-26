"use client";

import { Search, UserPlus } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { User } from "@/domain";
import type { PoolWorkspace } from "@/features/members/hooks";

/** Somebody from the pool who has no seat in this workspace. */
export type Outsider = { user: User; department: string | null; workspaces: PoolWorkspace[] };

/**
 * Everybody in the app without a seat here, to pick one and give them a seat.
 * Members lists only the workspace's own people; this is where the rest are.
 */
export function OtherWorkspacesDialog({ people, open, onOpenChange, onAdd }: { people: Outsider[]; open: boolean; onOpenChange: (open: boolean) => void; onAdd: (user: User) => void }) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const listed = q ? people.filter(({ user, department }) => [user.displayName, user.email, user.jobTitle ?? "", department ?? ""].some((v) => v.toLowerCase().includes(q))) : people;

  return (
    <Dialog open={open} onOpenChange={(next) => (onOpenChange(next), next || setQuery(""))}>
      <DialogContent className="sm:max-w-lg" data-testid="other-workspaces-dialog">
        <DialogHeader>
          <DialogTitle>Add from other workspaces</DialogTitle>
          <DialogDescription>They already have an account, so they are in at once.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, title or department" className="w-full pl-7" aria-label="Search people in other workspaces" />
        </div>
        <ul className="scrollbar-thin -mx-1 max-h-[60vh] overflow-y-auto px-1">
          {listed.length === 0 ? (
            <li className="py-6 text-center text-[13px] text-muted-foreground">No one matches</li>
          ) : (
            listed.map(({ user, department, workspaces }) => (
              <li key={user.id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/40" data-testid="member-outsider-row">
                <UserAvatar user={user} size="md" tooltip={false} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px] font-medium">{user.displayName}</span>
                  <span className="block truncate text-2xs text-muted-foreground">{[user.jobTitle ?? user.email, department].filter(Boolean).join(" · ")}</span>
                  {workspaces.length > 0 && <span className="block truncate text-2xs text-muted-foreground">In {workspaces.map((w) => w.name).join(", ")}</span>}
                </span>
                <Button variant="outline" size="sm" onClick={() => onAdd(user)} aria-label={`Add ${user.displayName}`} data-testid="member-add-to-workspace">
                  <UserPlus /> Add
                </Button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
