"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ColorPicker } from "@/components/shared/color-picker";
import { IconPicker } from "@/components/shared/icon-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { COLOR_TOKENS, type ColorToken, type Team } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { BookingBoardSetting } from "@/features/booking/booking-board-setting";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canEditTeamAccess } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";

const schema = z.object({
  name: z.string().trim().min(1, "Give the team a name").max(60, "Keep the name under 60 characters"),
  description: z.string().trim().max(200, "Keep the description under 200 characters").optional(),
  color: z.enum(COLOR_TOKENS as readonly [ColorToken, ...ColorToken[]]),
  icon: z.string(),
  /** Board this team's bookings land on; null means Task Allocation. */
  bookingBoardId: z.string().nullable(),
  /** Who sees the team's boards; the team itself is hidden with them. */
  boardVisibility: z.enum(["WORKSPACE", "TEAM"]),
  /** Its members edit its boards without being added to each. */
  membersCanEdit: z.boolean(),
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
  const router = useRouter();
  const editing = !!team;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", color: "blue", icon: "users", bookingBoardId: null, boardVisibility: "WORKSPACE", membersCanEdit: false },
  });

  React.useEffect(() => {
    if (open) {
      form.reset(
        team
          ? {
              name: team.name,
              description: team.description ?? "",
              color: team.color,
              icon: team.icon,
              bookingBoardId: team.bookingBoardId ?? null,
              boardVisibility: team.boardVisibility ?? "WORKSPACE",
              membersCanEdit: team.membersCanEdit ?? false,
            }
          : { name: "", description: "", color: "blue", icon: "users", bookingBoardId: null, boardVisibility: "WORKSPACE", membersCanEdit: false },
      );
    }
  }, [open, team, form]);

  // Who sees and edits the team's boards is a workspace admin's call (policies/0028).
  const access = canEditTeamAccess(ws.permissions) && !team?.system;
  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const accessPatch = access ? { boardVisibility: values.boardVisibility, membersCanEdit: values.membersCanEdit } : {};
      if (team) {
        return services.workspace.updateTeam(team.id, {
          name: values.name,
          description: values.description || null,
          color: values.color,
          icon: values.icon,
          ...(team.system ? {} : { bookingBoardId: values.bookingBoardId }),
          ...accessPatch,
        });
      }
      const created = await services.workspace.createTeam(
        { workspaceId: ws.workspace.id, name: values.name, description: values.description || null, color: values.color, icon: values.icon },
        user.id,
      );
      // Made open, as every team starts, then set: the creator is on it by then.
      return access && (values.boardVisibility !== "WORKSPACE" || values.membersCanEdit) ? services.workspace.updateTeam(created.id, accessPatch) : created;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
      onOpenChange(false);
      toast.success(editing ? "Team updated" : `Team “${saved.name}” created`);
      // Creating a board or a tracker opens it; a new team should behave the same
      // way rather than leaving you on the page you started from.
      if (!editing) router.push(routes.team(ws.slug, saved.id));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save team"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit team" : "Create team"}</DialogTitle>
          <DialogDescription>{team?.system ? "A built-in team: rename or restyle it as you like. It cannot be archived." : "Teams group boards and people. You will be added as the team lead."}</DialogDescription>
        </DialogHeader>
        <form id="team-form" className="grid gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <div className="grid gap-1.5">
            <Label htmlFor="team-name">Team name</Label>
            <Input id="team-name" autoFocus placeholder="e.g. Motion" {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
            {form.formState.errors.name && <p className="text-2xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              rows={2}
              placeholder="What does this team look after?"
              {...form.register("description")}
              aria-invalid={!!form.formState.errors.description}
            />
            {form.formState.errors.description && <p className="text-2xs text-destructive">{form.formState.errors.description.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label>Colour</Label>
            <Controller control={form.control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
          </div>
          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <Controller control={form.control} name="icon" render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} className="grid-cols-11" />} />
          </div>
          {access && <BoardAccessFields control={form.control} />}
          {team && !team.system && (
            <Controller control={form.control} name="bookingBoardId" render={({ field }) => <BookingBoardSetting team={team} value={field.value} onChange={field.onChange} />} />
          )}
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

/**
 * Who sees the team's boards, and whether its own people edit them, for every
 * board of the team but a private one. A team kept to itself is hidden from
 * everyone else, with its trackers and docs.
 */
function BoardAccessFields({ control }: { control: Control<FormValues> }) {
  return (
    <div className="grid gap-3 rounded-lg border border-border/70 p-3" data-testid="team-board-access">
      <div className="grid gap-1.5">
        <Label htmlFor="team-board-visibility">Who sees its boards</Label>
        <Controller
          control={control}
          name="boardVisibility"
          render={({ field }) => (
            <>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="team-board-visibility" aria-label="Who sees its boards" data-testid="team-board-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WORKSPACE">Everyone in the workspace</SelectItem>
                  <SelectItem value="TEAM">Only this team</SelectItem>
                </SelectContent>
              </Select>
              {field.value === "TEAM" && <p className="text-2xs text-muted-foreground">Hidden from everyone else, with its trackers and docs.</p>}
            </>
          )}
        />
      </div>
      <Controller
        control={control}
        name="membersCanEdit"
        render={({ field }) => (
          <label className="flex items-center justify-between gap-3 text-[13px]">
            <span>Members can edit its boards</span>
            <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Members can edit its boards" data-testid="team-members-can-edit" />
          </label>
        )}
      />
    </div>
  );
}
