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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { COLOR_TOKENS, describeTemplateSpec, type ColorToken, type SavedBoardTemplate } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { BOARD_TEMPLATE_IDS, BOARD_TEMPLATE_LIST } from "@/features/boards/templates";
import { useDeleteBoardTemplate, useSaveTemplateDialog, useSavedBoardTemplates } from "@/features/boards/board-templates";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { isWorkspaceAdmin } from "@/lib/permissions/permissions";
import { LayoutTemplate, Trash2 } from "lucide-react";
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
      icon: "square-kanban",
    },
  });

  // A saved template, when one is picked; the built-in choice otherwise.
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const saved = useSavedBoardTemplates();
  const removeTemplate = useDeleteBoardTemplate();
  const [deleting, setDeleting] = React.useState<SavedBoardTemplate | null>(null);
  const showSaveTemplate = useSaveTemplateDialog((s) => s.show);
  const canRemove = (t: SavedBoardTemplate) => t.createdBy === user.id || isWorkspaceAdmin(ws.permissions);

  const create = useMutation({
    mutationFn: (values: FormValues) => {
      const input = {
        workspaceId: ws.workspace.id,
        name: values.name,
        teamId: values.teamId === NO_TEAM ? null : values.teamId,
        visibility: values.visibility,
        color: values.color,
        icon: values.icon,
      };
      return savedId ? services.boardTemplates.createBoard(savedId, input, user.id) : services.boards.createBoard({ ...input, templateId: values.templateId }, user.id);
    },
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
          <DialogDescription>Boards hold groups of items. Start from a template, or one you saved.</DialogDescription>
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
              render={({ field }) => {
                // One list, built in and saved alike: "builtin:<id>" or "saved:<id>".
                const value = savedId ? `saved:${savedId}` : `builtin:${field.value}`;
                const builtIn = BOARD_TEMPLATE_LIST.find((t) => t.id === field.value);
                const picked = savedId ? (saved.data ?? []).find((t) => t.id === savedId) : null;
                return (
                  <div className="flex items-center gap-2">
                    <Select
                      value={value}
                      onValueChange={(next) => {
                        const [kind, id] = next.split(":") as [string, string];
                        if (kind === "builtin") {
                          setSavedId(null);
                          field.onChange(id);
                          return;
                        }
                        const template = (saved.data ?? []).find((t) => t.id === id);
                        setSavedId(id);
                        // The look it was saved with, as a starting point.
                        if (template?.spec.board) {
                          form.setValue("color", template.spec.board.color);
                          form.setValue("icon", template.spec.board.icon);
                        }
                      }}
                    >
                      <SelectTrigger aria-label="Template" className="h-auto min-h-11 flex-1 py-2" data-testid="board-template">
                        <SelectValue>
                          <span className="flex min-w-0 flex-col items-start text-left">
                            <span className="flex items-center gap-1.5 text-[13px] font-medium">
                              {picked && <LayoutTemplate className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                              {picked ? picked.name : builtIn?.name}
                            </span>
                            <span className="text-2xs text-muted-foreground">{picked ? describeTemplateSpec(picked.spec) : builtIn ? builtInSummary(builtIn) : ""}</span>
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-80 border-border bg-card shadow-xl ring-1 ring-black/5 dark:bg-[color-mix(in_oklab,var(--color-popover),white_7%)] dark:ring-white/10">
                        <SelectGroup>
                          <SelectLabel>Built in</SelectLabel>
                          {BOARD_TEMPLATE_LIST.map((template) => (
                            <SelectItem key={template.id} value={`builtin:${template.id}`} className="py-2">
                              <TemplateOption name={template.name} description={template.description} summary={builtInSummary(template)} />
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        {(saved.data ?? []).length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Saved</SelectLabel>
                            {(saved.data ?? []).map((template) => (
                              <SelectItem key={template.id} value={`saved:${template.id}`} className="py-2" data-testid="saved-template">
                                <TemplateOption name={template.name} description={template.description} summary={describeTemplateSpec(template.spec)} saved />
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                    {/* A saved one is deleted from beside the list, not from inside it, where a click would pick it. */}
                    {picked && canRemove(picked) && (
                      <SimpleTooltip label="Delete this template">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${picked.name}`} className="shrink-0 text-muted-foreground" onClick={() => setDeleting(picked)} data-testid="saved-template-delete">
                          <Trash2 />
                        </Button>
                      </SimpleTooltip>
                    )}
                  </div>
                );
              }}
            />
            <button type="button" onClick={() => showSaveTemplate(null)} className="justify-self-start text-2xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" data-testid="save-board-as-template">
              Save a board as a template…
            </button>
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
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete “${deleting?.name ?? ""}”?`}
          description="Boards already made from it stay as they are."
          confirmLabel="Delete template"
          destructive
          onConfirm={async () => {
            if (!deleting) return;
            if (savedId === deleting.id) setSavedId(null);
            await removeTemplate.mutateAsync(deleting.id);
          }}
        />
    </>
  );
}

/** "1 group · 4 columns" for a built-in template. */
function builtInSummary(template: { groups: unknown[]; columns: unknown[] }): string {
  return `${template.groups.length} group${template.groups.length === 1 ? "" : "s"} · ${template.columns.length + 1} columns`;
}

/** A template in the list: its name, what it is for, and what it holds. */
function TemplateOption({ name, description, summary, saved = false }: { name: string; description: string | null; summary: string; saved?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        {saved && <LayoutTemplate className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
        {name}
      </span>
      {description && <span className="text-2xs text-muted-foreground">{description}</span>}
      <span className="text-2xs text-muted-foreground/80">{summary}</span>
    </span>
  );
}
