"use client";

import { Check } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { User } from "@/domain";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { useAddToWorkspace } from "../hooks";

type Role = "ADMIN" | "MEMBER" | "GUEST";
const ROLES: Array<{ value: Role; label: string }> = [
  { value: "MEMBER", label: "Member" },
  { value: "ADMIN", label: "Admin" },
  { value: "GUEST", label: "Guest" },
];

/**
 * Somebody from the pool, given a seat in this workspace. They already have an
 * account, so there is no link to pass on: they are in at once, and the
 * workspace appears in their menu. Keyed by the person where it is used, so
 * each one starts from Member and no teams.
 */
export function AddToWorkspaceDialog({ user, onOpenChange }: { user: User | null; onOpenChange: (open: boolean) => void }) {
  const ws = useWorkspace();
  const add = useAddToWorkspace();
  const [role, setRole] = React.useState<Role>("MEMBER");
  const [teamIds, setTeamIds] = React.useState<string[]>([]);
  const teams = ws.teams.filter((t) => t.archivedAt === null);

  const submit = () => {
    if (!user) return;
    add.mutate(
      { userId: user.id, role, teamIds },
      {
        onSuccess: () => {
          toast.success(`${user.displayName} added to ${ws.workspace.name}`);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="add-to-workspace-dialog">
        <DialogHeader>
          <DialogTitle>Add to {ws.workspace.name}</DialogTitle>
          <DialogDescription>They already have an account, so they are in at once.</DialogDescription>
        </DialogHeader>
        {user && (
          <div className="grid gap-4">
            <div className="flex items-center gap-2.5">
              <UserAvatar user={user} size="md" tooltip={false} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-medium">{user.displayName}</span>
                <span className="block truncate text-2xs text-muted-foreground">{user.email}</span>
              </span>
            </div>
            <div className="grid gap-1.5">
              <Label>Workspace role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                <SelectTrigger aria-label="Workspace role" data-testid="add-to-workspace-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {teams.length > 0 && (
              <div className="grid gap-1.5">
                <Label id="add-to-workspace-teams">Teams</Label>
                <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="add-to-workspace-teams">
                  {teams.map((team) => {
                    const checked = teamIds.includes(team.id);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={team.name}
                        onClick={() => setTeamIds((now) => (checked ? now.filter((id) => id !== team.id) : [...now, team.id]))}
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                          checked ? cn("border-transparent font-medium", colorClasses(team.color).soft) : "border-border/70 bg-surface-strong/40 text-muted-foreground hover:border-border hover:text-foreground",
                        )}
                      >
                        {checked && <Check className="size-3.5" />}
                        {team.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={add.isPending} data-testid="add-to-workspace-submit">
            {add.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
