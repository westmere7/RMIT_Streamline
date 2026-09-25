"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_TEMPLATE_PARTS, TEMPLATE_PARTS, TEMPLATE_PART_INFO, normaliseTemplateParts, type BoardTemplatePart, type EntityId } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";

/**
 * Where "Save as template" is opened from — a board's menu, or the new-board
 * dialog — it is the same dialog, mounted once in the app shell. With a board
 * it saves that one; without, it asks which.
 */
export const useSaveTemplateDialog = create<{ open: boolean; boardId: EntityId | null; show: (boardId?: EntityId | null) => void; hide: () => void }>((set) => ({
  open: false,
  boardId: null,
  show: (boardId = null) => set({ open: true, boardId }),
  hide: () => set({ open: false }),
}));

export function useSavedBoardTemplates() {
  const ws = useWorkspace();
  const services = useServices();
  return useQuery({ queryKey: queryKeys.boardTemplates(ws.workspace.id), queryFn: () => services.boardTemplates.list(ws.workspace.id), staleTime: 60_000 });
}

export function useDeleteBoardTemplate() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: EntityId) => services.boardTemplates.delete(templateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.boardTemplates(ws.workspace.id) }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete the template"),
  });
}

/** Mounted once, in the app shell. */
export function SaveBoardTemplateHost() {
  const { open, boardId, hide } = useSaveTemplateDialog();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      <DialogContent>{open && <SaveBoardTemplateForm boardId={boardId} onDone={hide} />}</DialogContent>
    </Dialog>
  );
}

function SaveBoardTemplateForm({ boardId, onDone }: { boardId: EntityId | null; onDone: () => void }) {
  const ws = useWorkspace();
  const user = useCurrentUser();
  const services = useServices();
  const queryClient = useQueryClient();
  const boards = ws.boards.filter((b) => b.archivedAt === null);
  const [chosen, setChosen] = React.useState<EntityId | null>(boardId ?? boards[0]?.id ?? null);
  const board = boards.find((b) => b.id === chosen) ?? null;
  const [name, setName] = React.useState(board ? `${board.name} layout` : "");
  const [description, setDescription] = React.useState("");
  const [parts, setParts] = React.useState<BoardTemplatePart[]>([...DEFAULT_TEMPLATE_PARTS]);
  const existing = useSavedBoardTemplates();
  const replaces = existing.data?.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());

  const toggle = (part: BoardTemplatePart, on: boolean) => setParts((now) => normaliseTemplateParts(on ? [...now, part] : now.filter((p) => p !== part)));
  // Automations point at groups and labels, so they can only come with both.
  const automationsAllowed = parts.includes("groups") && parts.includes("columnSettings");

  const save = useMutation({
    mutationFn: () => services.boardTemplates.saveFromBoard(chosen!, { name, description, parts }, user.id),
    onSuccess: async (template) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.boardTemplates(ws.workspace.id) });
      toast.success(`Template “${template.name}” saved`, { description: "Pick it when you create a board." });
      onDone();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the template"),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <LayoutTemplate className="size-5 text-muted-foreground" /> Save as template
        </DialogTitle>
        <DialogDescription>New boards can start from this layout. The columns always come with it.</DialogDescription>
      </DialogHeader>
      <form
        id="save-board-template-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen && name.trim()) save.mutate();
        }}
      >
        {!boardId && (
          <div className="grid gap-1.5">
            <Label>Board</Label>
            <Select
              value={chosen ?? ""}
              onValueChange={(id) => {
                const next = boards.find((b) => b.id === id);
                if (next && (!name.trim() || name === `${board?.name} layout`)) setName(`${next.name} layout`);
                setChosen(id);
              }}
            >
              <SelectTrigger aria-label="Board" data-testid="template-board">
                <SelectValue placeholder="Pick a board" />
              </SelectTrigger>
              <SelectContent>
                {boards.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="template-name">Name</Label>
          <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus data-testid="template-name" />
          {replaces && <p className="text-2xs text-muted-foreground">Saves over the template with this name.</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="template-description">Description</Label>
          <Input id="template-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} placeholder="Optional" data-testid="template-description" />
        </div>
        <fieldset className="grid gap-2.5">
          <legend className="mb-1 text-[13px] font-medium">What to save</legend>
          {TEMPLATE_PARTS.map((part) => {
            const disabled = part === "automations" && !automationsAllowed;
            return (
              <label key={part} className="flex items-start gap-2.5 text-[13px] has-[:disabled]:opacity-60">
                <Checkbox checked={parts.includes(part)} disabled={disabled} onCheckedChange={(checked) => toggle(part, checked === true)} className="mt-0.5" data-testid={`template-part-${part}`} />
                <span>
                  <span className="font-medium">{TEMPLATE_PART_INFO[part].label}</span>
                  <span className="block text-2xs text-muted-foreground">{TEMPLATE_PART_INFO[part].hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" form="save-board-template-form" disabled={!chosen || !name.trim() || save.isPending} data-testid="template-save">
          {save.isPending ? "Saving…" : replaces ? "Save over it" : "Save template"}
        </Button>
      </DialogFooter>
    </>
  );
}
