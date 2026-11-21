"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { LookPicker } from "@/components/shared/look-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COLOR_TOKENS, type ColorToken, type Team } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { TeamSettingsDialog, type TeamSettingsSection } from "@/features/teams/components/team-settings-dialog";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";

const schema = z.object({
  name: z.string().trim().min(1, "Give the team a name").max(60, "Keep the name under 60 characters"),
  description: z.string().trim().max(200, "Keep the description under 200 characters").optional(),
  color: z.enum(COLOR_TOKENS as readonly [ColorToken, ...ColorToken[]]),
  icon: z.string(),
});

type FormValues = z.infer<typeof schema>;

const BLANK: FormValues = { name: "", description: "", color: "blue", icon: "users" };

export interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given, this opens the team's settings instead (General, Access, Members, Bookings). */
  team?: Team | null;
}

/**
 * Making a team: its name, look and description, nothing more. Who can see and
 * edit its boards, its people and where its bookings land are in its settings,
 * which is what this opens instead when handed a team.
 */
export function CreateTeamDialog({ open, onOpenChange, team, section }: CreateTeamDialogProps & { section?: TeamSettingsSection }) {
  if (team) return <TeamSettingsDialog key={`${team.id}:${section ?? "general"}`} team={team} open={open} onOpenChange={onOpenChange} section={section} />;
  return <CreateTeamForm open={open} onOpenChange={onOpenChange} />;
}

function CreateTeamForm({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ws = useWorkspace();
  const user = useCurrentUser();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: BLANK });
  React.useEffect(() => {
    if (open) form.reset(BLANK);
  }, [open, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      services.workspace.createTeam({ workspaceId: ws.workspace.id, name: values.name, description: values.description || null, color: values.color, icon: values.icon }, user.id),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
      onOpenChange(false);
      toast.success(`Team “${saved.name}” created`);
      // Creating a board or a tracker opens it; a new team should behave the same
      // way rather than leaving you on the page you started from.
      router.push(routes.team(ws.slug, saved.id));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create the team"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>Teams group boards and people. You will be added as the team lead.</DialogDescription>
        </DialogHeader>
        <form id="team-form" className="grid gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <div className="grid gap-1.5">
            <Label htmlFor="team-name">Team name</Label>
            <div className="flex items-center gap-2">
              <Controller
                control={form.control}
                name="color"
                render={({ field: color }) => (
                  <Controller
                    control={form.control}
                    name="icon"
                    render={({ field: icon }) => <LookPicker color={color.value} icon={icon.value} onColor={color.onChange} onIcon={icon.onChange} testId="team-look" />}
                  />
                )}
              />
              <Input id="team-name" autoFocus placeholder="e.g. Motion" {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
            </div>
            {form.formState.errors.name && <p className="text-2xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="team-description">Description</Label>
            <Textarea id="team-description" rows={2} placeholder="What does this team look after?" {...form.register("description")} aria-invalid={!!form.formState.errors.description} />
            {form.formState.errors.description && <p className="text-2xs text-destructive">{form.formState.errors.description.message}</p>}
          </div>
          <p className="text-2xs text-muted-foreground">Access, members and bookings are in its settings once it is made.</p>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="team-form" disabled={save.isPending}>
            {save.isPending ? "Creating…" : "Create Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
