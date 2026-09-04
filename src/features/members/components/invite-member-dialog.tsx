"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WORKSPACE_ROLES } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";

const schema = z.object({
  email: z.email("Enter a valid email"),
  firstName: z.string().trim().min(1, "Required"),
  lastName: z.string().trim().min(1, "Required"),
  jobTitle: z.string().trim().optional(),
  role: z.enum(WORKSPACE_ROLES),
  teamIds: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

export function InviteMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", firstName: "", lastName: "", jobTitle: "", role: "MEMBER", teamIds: [] },
  });

  React.useEffect(() => {
    if (open) form.reset({ email: "", firstName: "", lastName: "", jobTitle: "", role: "MEMBER", teamIds: [] });
  }, [open, form]);

  const invite = useMutation({
    mutationFn: (values: FormValues) =>
      services.workspace.inviteMember({
        workspaceId: ws.workspace.id,
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        jobTitle: values.jobTitle || null,
        role: values.role,
        teamIds: values.teamIds,
      }),
    onSuccess: async ({ user }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
      onOpenChange(false);
      toast.success(`Invitation created for ${user.displayName}`, { description: "No email is sent in local mode." });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not invite member"),
  });

  const activeTeams = ws.teams.filter((t) => t.archivedAt === null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>Creates a simulated invitation. Nothing is emailed in local mode.</DialogDescription>
        </DialogHeader>
        <form id="invite-form" className="grid gap-4" onSubmit={form.handleSubmit((v) => invite.mutate(v))}>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" autoFocus placeholder="name@rmit.edu.au" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
            {form.formState.errors.email && <p className="text-2xs text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="invite-first">First name</Label>
              <Input id="invite-first" {...form.register("firstName")} aria-invalid={!!form.formState.errors.firstName} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-last">Last name</Label>
              <Input id="invite-last" {...form.register("lastName")} aria-invalid={!!form.formState.errors.lastName} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
            <Label>Teams</Label>
            <Controller
              control={form.control}
              name="teamIds"
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-1.5">
                  {activeTeams.map((team) => {
                    const checked = field.value.includes(team.id);
                    return (
                      <label key={team.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-[13px] transition-colors hover:bg-accent/60">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) =>
                            field.onChange(next ? [...field.value, team.id] : field.value.filter((id) => id !== team.id))
                          }
                        />
                        <span className="truncate">{team.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" disabled={invite.isPending}>
            {invite.isPending ? "Inviting…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
