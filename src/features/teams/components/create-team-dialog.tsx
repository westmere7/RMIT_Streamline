"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ColorPicker } from "@/components/shared/color-picker";
import { IconPicker } from "@/components/shared/icon-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COLOR_TOKENS, type ColorToken, type Team } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";

const schema = z.object({
  name: z.string().trim().min(1, "Give the team a name").max(60),
  description: z.string().trim().max(200).optional(),
  color: z.enum(COLOR_TOKENS as readonly [ColorToken, ...ColorToken[]]),
  icon: z.string(),
});

type FormValues = z.infer<typeof schema>;

export interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog edits this team instead of creating one. */
  team?: Team | null;
}

export function CreateTeamDialog({ open, onOpenChange, team }: CreateTeamDialogProps) {
  const ws = useWorkspace();
  const user = useCurrentUser();
  const services = useServices();
  const queryClient = useQueryClient();
  const editing = !!team;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", color: "blue", icon: "users" },
  });

  React.useEffect(() => {
    if (open) {
      form.reset(
        team
          ? { name: team.name, description: team.description ?? "", color: team.color, icon: team.icon }
          : { name: "", description: "", color: "blue", icon: "users" },
      );
    }
  }, [open, team, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      team
        ? services.workspace.updateTeam(team.id, { name: values.name, description: values.description || null, color: values.color, icon: values.icon })
        : services.workspace.createTeam(
            { workspaceId: ws.workspace.id, name: values.name, description: values.description || null, color: values.color, icon: values.icon },
            user.id,
          ),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
      onOpenChange(false);
      toast.success(editing ? "Team updated" : `Team “${saved.name}” created`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save team"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit team" : "Create team"}</DialogTitle>
          <DialogDescription>Teams group boards and people. You will be added as the team lead.</DialogDescription>
        </DialogHeader>
        <form id="team-form" className="grid gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <div className="grid gap-1.5">
            <Label htmlFor="team-name">Team name</Label>
            <Input id="team-name" autoFocus placeholder="e.g. Motion" {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
            {form.formState.errors.name && <p className="text-2xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="team-description">Description</Label>
            <Textarea id="team-description" rows={2} placeholder="What does this team look after?" {...form.register("description")} />
          </div>
          <div className="grid gap-1.5">
            <Label>Colour</Label>
            <Controller control={form.control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
          </div>
          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <Controller control={form.control} name="icon" render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} className="grid-cols-11" />} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="team-form" disabled={save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Create Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
