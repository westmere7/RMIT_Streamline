"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RotateCcw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SizeDefinition, SizeScale, SizeSpanUnit, TShirtSize } from "@/domain";
import {
  DEFAULT_SIZE_SCALE,
  MAX_SIZE_EXAMPLES,
  MAX_SIZE_SCOPE,
  SIZE_SPAN_UNITS,
  SIZE_SPAN_UNIT_LABELS,
  T_SHIRT_SIZES,
  formatHours,
  normaliseSizeScale,
  sizeScaleProblem,
  spanHours,
} from "@/domain";
import { useServices } from "@/features/data/data-context";
import { SizePill } from "@/features/boards/components/pickers/size-picker";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canManageWorkspace } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";

/**
 * What each T-shirt size means here: a span of working time, the kind of work,
 * and typical jobs. The size picker shows all of it, and sets a task's assets
 * (weighed by the asset types' rates) against the spans to say which size the
 * task fits. Nothing is written until Save.
 */
export function SizesSection() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const canEdit = canManageWorkspace(ws.permissions);
  const stored = React.useMemo(() => normaliseSizeScale(ws.workspace.sizeScale), [ws.workspace.sizeScale]);
  const [draft, setDraft] = React.useState<SizeScale>(stored);
  const settled = JSON.stringify(stored);
  const [seen, setSeen] = React.useState(settled);
  const dirty = JSON.stringify(draft) !== settled;
  if (seen !== settled && !dirty) {
    setSeen(settled);
    setDraft(stored);
  }
  const problem = sizeScaleProblem(draft);
  const isDefault = JSON.stringify(draft) === JSON.stringify(DEFAULT_SIZE_SCALE);

  const save = useMutation({
    mutationFn: async () => {
      await services.repos.workspaces.update(ws.workspace.id, { sizeScale: normaliseSizeScale(draft) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
    },
    onSuccess: () => toast.success("Sizes saved"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the sizes"),
  });

  const patch = (size: TShirtSize, next: Partial<SizeDefinition>) => setDraft((d) => ({ ...d, [size]: { ...d[size], ...next } }));

  return (
    <div className="space-y-3" data-testid="sizes-section">
      <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
        {T_SHIRT_SIZES.map((size) => (
          <SizeRow key={size} size={size} definition={draft[size]} canEdit={canEdit} onChange={(next) => patch(size, next)} />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-2xs text-muted-foreground">
          A week is 5 working days of 8 hours; a month is 21 working days. A task fits the smallest size its assets&apos; hours reach.
        </p>
        {problem && (
          <p className="text-2xs font-medium text-destructive" role="alert" data-testid="sizes-problem">
            {problem}
          </p>
        )}
        {canEdit && !isDefault && (
          <Button variant="ghost" size="sm" className="h-7" disabled={save.isPending} onClick={() => setDraft(normaliseSizeScale(DEFAULT_SIZE_SCALE))} data-testid="sizes-reset">
            <RotateCcw className="size-3.5" /> Defaults
          </Button>
        )}
        {canEdit && dirty && (
          <>
            <Button variant="ghost" size="sm" className="h-7" disabled={save.isPending} onClick={() => setDraft(stored)}>
              Discard
            </Button>
            <Button size="sm" className="h-7" disabled={save.isPending || !!problem} onClick={() => save.mutate()} data-testid="sizes-save">
              {save.isPending && <LoaderCircle className="animate-spin" />} Save
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function SizeRow({ size, definition, canEdit, onChange }: { size: TShirtSize; definition: SizeDefinition; canEdit: boolean; onChange: (next: Partial<SizeDefinition>) => void }) {
  const { span } = definition;
  const hours = spanHours(span);
  const [examples, setExamples] = React.useState(definition.examples.join("\n"));
  const joined = definition.examples.join("\n");
  const [seenExamples, setSeenExamples] = React.useState(joined);
  // A reset or a discard from outside rewrites the box; typing does not fight it.
  if (seenExamples !== joined && examples.split("\n").map((l) => l.trim()).filter(Boolean).join("\n") !== joined) {
    setSeenExamples(joined);
    setExamples(joined);
  }
  const number = (raw: string): number | null => {
    const n = Number(raw);
    return raw.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n;
  };

  return (
    <li className="grid gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)]" data-testid={`size-row-${size}`}>
      <div className="pt-1">
        <SizePill size={size} className="h-7 px-2 text-xs" />
      </div>
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={`${size} from`}
            inputMode="decimal"
            placeholder="From"
            value={span.from ?? ""}
            disabled={!canEdit}
            onChange={(e) => onChange({ span: { ...span, from: number(e.target.value) } })}
            className="h-8 w-20 tabular"
            data-testid={`size-from-${size}`}
          />
          <span className="text-muted-foreground" aria-hidden>
            –
          </span>
          <Input
            aria-label={`${size} to`}
            inputMode="decimal"
            value={span.to || ""}
            disabled={!canEdit}
            onChange={(e) => onChange({ span: { ...span, to: number(e.target.value) ?? 0 } })}
            className="h-8 w-20 tabular"
            data-testid={`size-to-${size}`}
          />
          <Select value={span.unit} disabled={!canEdit} onValueChange={(unit) => onChange({ span: { ...span, unit: unit as SizeSpanUnit } })}>
            <SelectTrigger className="h-8 w-28" aria-label={`${size} unit`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_SPAN_UNITS.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {SIZE_SPAN_UNIT_LABELS[unit].many}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-2xs text-muted-foreground tabular">{hours.from !== null ? `${formatHours(hours.from)} to ${formatHours(hours.to)}` : `up to ${formatHours(hours.to)}`}</span>
        </div>
        <Input
          aria-label={`${size} scope`}
          placeholder="The kind of work, e.g. Design briefs"
          value={definition.scope}
          maxLength={MAX_SIZE_SCOPE}
          disabled={!canEdit}
          onChange={(e) => onChange({ scope: e.target.value })}
          className="h-8"
          data-testid={`size-scope-${size}`}
        />
        <Textarea
          aria-label={`${size} examples, one per line`}
          placeholder="Typical jobs, one per line"
          value={examples}
          disabled={!canEdit}
          rows={Math.min(6, Math.max(2, examples.split("\n").length))}
          onChange={(e) => {
            setExamples(e.target.value);
            const list = e.target.value
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .slice(0, MAX_SIZE_EXAMPLES);
            setSeenExamples(list.join("\n"));
            onChange({ examples: list });
          }}
          className="min-h-0 resize-y text-[13px]"
          data-testid={`size-examples-${size}`}
        />
      </div>
    </li>
  );
}
