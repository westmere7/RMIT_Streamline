"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WORKSPACE_ROLES } from "@/domain";
import type { InviteResult } from "@/data/repositories";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { useMemberMutations } from "../hooks";
import { InviteLinkPanel } from "./invite-link-panel";
import { JoinLinkPanel } from "./join-link-panel";

const schema = z.object({
  email: z.email("Enter a valid email"),
  firstName: z.string().trim().min(1, "Required"),
  lastName: z.string().trim().min(1, "Required"),
  jobTitle: z.string().trim().optional(),
  role: z.enum(WORKSPACE_ROLES),
  teamIds: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { email: "", firstName: "", lastName: "", jobTitle: "", role: "MEMBER", teamIds: [] };

/**
 * Adds people to the workspace, both ways on one screen: one person's details,
 * then their invitation link to pass on (a pending member from the moment that
 * succeeds), and under it the team's join link, where each person enters their
 * own details and is added the same way.
 */
export function InviteMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="invite-dialog">
        {/* Mounted only while open, so the form and the result start fresh each time. */}
        {open && <InviteMemberBody onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function InviteMemberBody({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const { invite } = useMemberMutations();
  const [result, setResult] = React.useState<InviteResult | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const submit = (values: FormValues) =>
    invite.mutate(
      {
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        jobTitle: values.jobTitle || null,
        role: values.role,
        teamIds: values.teamIds,
      },
      { onSuccess: setResult },
    );

  const activeTeams = ws.teams.filter((t) => t.archivedAt === null);

  if (result) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{result.user.displayName} has been added</DialogTitle>
          <DialogDescription>They are listed as pending until they open their invitation link.</DialogDescription>
        </DialogHeader>
        <InviteLinkPanel invitation={result.invitation} personName={result.user.displayName} />
        <DialogFooter>
          <Button onClick={onClose} data-testid="invite-done">
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add member</DialogTitle>
        <DialogDescription>No email is sent. You get a link to pass on, and they set their own password.</DialogDescription>
      </DialogHeader>
      <form id="invite-form" className="grid gap-3.5" onSubmit={form.handleSubmit(submit)}>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" type="email" autoFocus placeholder="name@rmit.edu.au" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
          {form.formState.errors.email && <p className="text-2xs text-destructive">{form.formState.errors.email.message}</p>}
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-first">First name</Label>
            <Input id="invite-first" {...form.register("firstName")} aria-invalid={!!form.formState.errors.firstName} />
            {form.formState.errors.firstName && <p className="text-2xs text-destructive">{form.formState.errors.firstName.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-last">Last name</Label>
            <Input id="invite-last" {...form.register("lastName")} aria-invalid={!!form.formState.errors.lastName} />
            {form.formState.errors.lastName && <p className="text-2xs text-destructive">{form.formState.errors.lastName.message}</p>}
          </div>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-title">Job title</Label>
            <Input id="invite-title" placeholder="Optional" {...form.register("jobTitle")} />
          </div>
          <div className="grid gap-1.5">
            <Label>Workspace role</Label>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Workspace role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKSPACE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.charAt(0) + role.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label id="invite-teams-label">Teams</Label>
          <Controller
            control={form.control}
            name="teamIds"
            render={({ field }) => (
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="invite-teams-label" data-testid="invite-teams">
                {activeTeams.map((team) => {
                  const checked = field.value.includes(team.id);
                  return (
                    <button
                      key={team.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={team.name}
                      onClick={() => field.onChange(checked ? field.value.filter((id) => id !== team.id) : [...field.value, team.id])}
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
            )}
          />
        </div>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="invite-form" disabled={invite.isPending} data-testid="invite-submit">
          {invite.isPending ? "Adding…" : "Add and get link"}
        </Button>
      </DialogFooter>
      {/* The other way in: one link for the whole team. */}
      <div className="border-t border-border/70 pt-4">
        <JoinLinkPanel compact />
      </div>
    </>
  );
}
