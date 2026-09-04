"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ColorPicker } from "@/components/shared/color-picker";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { IconPicker } from "@/components/shared/icon-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLOR_TOKENS, type ColorToken } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { BOARD_TEMPLATE_IDS, BOARD_TEMPLATE_LIST } from "@/features/boards/templates";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

const NO_TEAM = "__none__";

const schema = z.object({
  name: z.string().trim().min(1, "Give the board a name").max(80, "Keep it under 80 characters"),
  teamId: z.string(),
  visibility: z.enum(["WORKSPACE", "TEAM", "PRIVATE"]),
  templateId: z.enum(BOARD_TEMPLATE_IDS),
  color: z.enum(COLOR_TOKENS as readonly [ColorToken, ...ColorToken[]]),
  icon: z.string(),
});

type FormValues = z.infer<typeof schema>;

export interface CreateBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTeamId?: string | null;
}

export function CreateBoardDialog({ open, onOpenChange, defaultTeamId }: CreateBoardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {/* The form lives inside the content so it mounts fresh (with default values) every time the dialog opens. */}
        <CreateBoardForm onOpenChange={onOpenChange} defaultTeamId={defaultTeamId} />
      </DialogContent>
    </Dialog>
  );
}

function CreateBoardForm({ onOpenChange, defaultTeamId }: Omit<CreateBoardDialogProps, "open">) {
  const ws = useWorkspace();
  const user = useCurrentUser();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      teamId: defaultTeamId ?? NO_TEAM,
      visibility: "WORKSPACE",
      templateId: "blank",
      color: "blue",
      icon: "layout-grid",
    },
  });

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      services.boards.createBoard(
        {
          workspaceId: ws.workspace.id,
          name: values.name,
          teamId: values.teamId === NO_TEAM ? null : values.teamId,
          visibility: values.visibility,
          templateId: values.templateId,
          color: values.color,
          icon: values.icon,
        },
        user.id,
      ),
    onSuccess: async ({ board }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.boards(ws.workspace.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.boardMembersAll(ws.workspace.id) });
      onOpenChange(false);
      toast.success(`Board “${board.name}” created`);
      router.push(ws.boardPath(board));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create board"),
  });

  const teamId = useWatch({ control: form.control, name: "teamId" });
  const visibility = useWatch({ control: form.control, name: "visibility" });
  const activeTeams = ws.teams.filter((t) => t.archivedAt === null);

  return (
    <>
        <DialogHeader>
          <DialogTitle>Create board</DialogTitle>
          <DialogDescription>Boards hold groups of items. Pick a template to start with sensible columns.</DialogDescription>
        </DialogHeader>
        <form id="create-board-form" className="grid gap-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <div className="grid gap-1.5">
            <Label htmlFor="board-name">Board name</Label>
            <Input id="board-name" autoFocus placeholder="e.g. Open Day 2026" {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
            {form.formState.errors.name && <p className="text-2xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Team</Label>
              <Controller
                control={form.control}
                name="teamId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Team">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEAM}>No team</SelectItem>
                      {activeTeams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            <DynamicIcon name={t.icon} className={cn("size-3.5", colorClasses(t.color).text)} /> {t.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Visibility</Label>
              <Controller
                control={form.control}
                name="visibility"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WORKSPACE">Workspace – everyone can see it</SelectItem>
                      <SelectItem value="TEAM" disabled={teamId === NO_TEAM}>
                        Team – team members only
                      </SelectItem>
                      <SelectItem value="PRIVATE">Private – invited members only</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {visibility === "TEAM" && teamId === NO_TEAM && <p className="text-2xs text-destructive">Choose a team for team visibility.</p>}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Template</Label>
            <Controller
              control={form.control}
              name="templateId"
              render={({ field }) => (
                <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
                  {BOARD_TEMPLATE_LIST.map((template) => {
                    const selected = field.value === template.id;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => field.onChange(template.id)}
                        className={cn(
                          "rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                          selected ? "border-ring bg-accent" : "border-border",
                        )}
                      >
                        <p className="text-[13px] font-medium">{template.name}</p>
                        <p className="mt-0.5 text-2xs text-muted-foreground">{template.description}</p>
                        <p className="mt-2 text-2xs text-muted-foreground">
                          {template.groups.length} groups · {template.columns.length + 1} columns
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-1.5">
              <Label>Colour</Label>
              <Controller control={form.control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
            </div>
            <div className="grid gap-1.5">
              <Label>Icon</Label>
              <Controller control={form.control} name="icon" render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} className="grid-cols-8" />} />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-board-form"
            disabled={create.isPending || (visibility === "TEAM" && teamId === NO_TEAM)}
            data-testid="create-board-submit"
          >
            {create.isPending ? "Creating…" : "Create Board"}
          </Button>
        </DialogFooter>
    </>
  );
}
