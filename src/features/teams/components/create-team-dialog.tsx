"use client";

import { AccessGrid, AccessPickers } from "@/features/boards/components/board-visibility-field";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ColorPicker } from "@/components/shared/color-picker";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { IconPicker } from "@/components/shared/icon-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COLOR_TOKENS, type ColorToken, type Team } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { BookingBoardSetting } from "@/features/booking/booking-board-setting";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { TeamMembersEditor } from "@/features/teams/components/team-members-editor";
import { canEditTeamAccess, teamAccessFor } from "@/lib/permissions/permissions";
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
  boardEdit: z.enum(["ADDED", "TEAM", "VIEWERS"]),
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
    defaultValues: { name: "", description: "", color: "blue", icon: "users", bookingBoardId: null, boardVisibility: "WORKSPACE", boardEdit: "ADDED" },
  });
  // The grid names the team as it is being typed.
  const nameValue = useWatch({ control: form.control, name: "name" }) ?? "";

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
              boardEdit: teamAccessFor(team).boardEdit ?? "ADDED",
            }
          : { name: "", description: "", color: "blue", icon: "users", bookingBoardId: null, boardVisibility: "WORKSPACE", boardEdit: "ADDED" },
      );
    }
  }, [open, team, form]);

  // Who sees and edits the team's boards is a workspace admin's call (policies/0028).
  const access = canEditTeamAccess(ws.permissions) && !team?.system;
  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const accessPatch = access ? { boardVisibility: values.boardVisibility, boardEdit: values.boardEdit } : {};
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
      return access && (values.boardVisibility !== "WORKSPACE" || values.boardEdit !== "ADDED") ? services.workspace.updateTeam(created.id, accessPatch) : created;
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
            {/* Its colour and icon, as one small picker beside the name: a team's look is a glance, not a panel. */}
            <div className="flex items-center gap-2">
              <TeamLookPicker control={form.control} />
              <Input id="team-name" autoFocus placeholder="e.g. Motion" {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
            </div>
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
          {access && <BoardAccessFields control={form.control} teamName={nameValue.trim()} />}
          {/* Who is on it, here as well as on the team's page; saved as each change is made. */}
          {team && (
            <div className="grid gap-1.5" data-testid="team-dialog-members">
              <TeamMembersEditor
                team={team}
                heading={(add, count) => (
                  <div className="flex items-center justify-between gap-2">
                    <Label>Members · {count}</Label>
                    {add}
                  </div>
                )}
              />
            </div>
          )}
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
 * Who can see the team's boards and who can edit them, for every board that
 * follows the team (a board can set its own instead), with the grid of what
 * that means. A team kept to itself is hidden from everyone else, with its
 * trackers and docs.
 */
function BoardAccessFields({ control, teamName }: { control: Control<FormValues>; teamName: string }) {
  return (
    <Controller
      control={control}
      name="boardVisibility"
      render={({ field: see }) => (
        <Controller
          control={control}
          name="boardEdit"
          render={({ field: edit }) => (
            <div className="grid gap-2.5" data-testid="team-board-access">
              <p className="text-[13px] font-medium">Its boards</p>
              <AccessPickers
                see={see.value}
                edit={edit.value}
                teamName={teamName || "this team"}
                allowPrivate={false}
                idPrefix="team-access"
                onChange={(next) => {
                  see.onChange(next.see === "TEAM" ? "TEAM" : "WORKSPACE");
                  edit.onChange(next.edit);
                }}
              />
              {see.value === "TEAM" && <p className="text-2xs text-muted-foreground">Hidden from everyone else, with its trackers and docs.</p>}
              <AccessGrid see={see.value} edit={edit.value} teamName={teamName || "This team's"} />
            </div>
          )}
        />
      )}
    />
  );
}

/** The team's colour and icon: shown as the icon on its colour, picked in a small popover. */
function TeamLookPicker({ control }: { control: Control<FormValues> }) {
  return (
    <Controller
      control={control}
      name="color"
      render={({ field: color }) => (
        <Controller
          control={control}
          name="icon"
          render={({ field: icon }) => (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Colour and icon"
                  title="Colour and icon"
                  className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-white transition-[box-shadow] hover:ring-2 hover:ring-ring/50 focus-visible:ring-2 focus-visible:ring-ring", colorClasses(color.value).solid)}
                  data-testid="team-look"
                >
                  <DynamicIcon name={icon.value} className="size-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 space-y-3 p-3">
                <ColorPicker value={color.value} onChange={color.onChange} />
                <div className="scrollbar-thin max-h-52 overflow-y-auto">
                  <IconPicker value={icon.value} onChange={icon.onChange} />
                </div>
              </PopoverContent>
            </Popover>
          )}
        />
      )}
    />
  );
}
