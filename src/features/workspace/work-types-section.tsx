"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ColorPicker } from "@/components/shared/color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ColorToken, WorkType } from "@/domain";
import { COLOR_TOKENS, MAX_WORK_TYPE_NAME, MAX_WORK_TYPES, normaliseWorkTypes } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { newId } from "@/lib/ids";
import { canManageWorkspace } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";

/**
 * The work types themselves: a name and a colour each, up to eight. Which asset
 * types belong to them is chosen on the asset types' own rows above; this only
 * names the groups. Removing one takes it off every asset type. Nothing is
 * written until Save, and a save leaves the rows' assignments as they are.
 */
export function WorkTypesSection() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const canEdit = canManageWorkspace(ws.permissions);
  const stored = React.useMemo(() => normaliseWorkTypes(ws.workspace.workTypes), [ws.workspace.workTypes]);
  const [draft, setDraft] = React.useState<WorkType[]>(stored.workTypes);
  const settled = JSON.stringify(stored.workTypes);
  const [seen, setSeen] = React.useState(settled);
  const dirty = JSON.stringify(draft) !== settled;
  if (seen !== settled && !dirty) {
    setSeen(settled);
    setDraft(stored.workTypes);
  }

  const save = useMutation({
    mutationFn: async () => {
      // The assignments as stored, less any to a work type that has gone.
      const current = normaliseWorkTypes(ws.workspace.workTypes);
      const ids = new Set(draft.map((w) => w.id));
      const assets: Record<string, string[]> = {};
      for (const [type, list] of Object.entries(current.assets)) {
        const kept = list.filter((id) => ids.has(id));
        if (kept.length > 0) assets[type] = kept;
      }
      await services.repos.workspaces.update(ws.workspace.id, { workTypes: normaliseWorkTypes({ workTypes: draft, assets }) });
      await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) }), queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(ws.workspace.id) })]);
    },
    onSuccess: () => toast.success("Work types saved"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the work types"),
  });

  const patch = (id: string, next: Partial<WorkType>) => setDraft((d) => d.map((w) => (w.id === id ? { ...w, ...next } : w)));
  const add = () =>
    setDraft((d) => {
      const used = new Set(d.map((w) => w.color));
      const color = COLOR_TOKENS.find((c) => !used.has(c) && c !== "gray") ?? "blue";
      return [...d, { id: newId(), name: `Work type ${d.length + 1}`, color }];
    });

  return (
    <section className="mt-8" id="work-types" data-testid="work-types">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[15px] font-semibold tracking-tight">Work types</h3>
        <p className="text-2xs text-muted-foreground">Pick them for each asset type above.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card p-3 shadow-xs">
        {draft.map((workType) => (
          <div key={workType.id} className="flex items-center gap-1 rounded-full border border-border/70 bg-surface/50 py-0.5 pr-1 pl-1" data-testid="work-type">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" disabled={!canEdit} aria-label={`Colour of ${workType.name}`} className="flex size-6 items-center justify-center rounded-full hover:bg-accent">
                  <span className="size-3 rounded-full" style={{ background: colorClasses(workType.color).hex }} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <ColorPicker value={workType.color} onChange={(color: ColorToken) => patch(workType.id, { color })} />
              </PopoverContent>
            </Popover>
            <Input
              value={workType.name}
              disabled={!canEdit}
              onChange={(e) => patch(workType.id, { name: e.target.value.slice(0, MAX_WORK_TYPE_NAME) })}
              aria-label="Work type name"
              className="h-6 w-32 border-0 bg-transparent px-1 text-[13px] font-medium shadow-none focus-visible:ring-1"
              data-testid="work-type-name"
            />
            {canEdit && (
              <button type="button" onClick={() => setDraft((d) => d.filter((w) => w.id !== workType.id))} aria-label={`Remove ${workType.name}`} className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
        {draft.length === 0 && <p className="text-[13px] text-muted-foreground">No work types yet.</p>}
        {canEdit && draft.length < MAX_WORK_TYPES && (
          <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full text-2xs" onClick={add} data-testid="work-type-add">
            <Plus className="size-3.5" /> Add work type
          </Button>
        )}
        {canEdit && dirty && (
          <span className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7" disabled={save.isPending} onClick={() => setDraft(stored.workTypes)}>
              Discard
            </Button>
            <Button size="sm" className="h-7" disabled={save.isPending} onClick={() => save.mutate()} data-testid="work-types-save">
              {save.isPending && <LoaderCircle className="animate-spin" />} Save
            </Button>
          </span>
        )}
      </div>
    </section>
  );
}
