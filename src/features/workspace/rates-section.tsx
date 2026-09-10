"use client";

import { useMutation } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetRate, AssetRates, RatePer } from "@/domain";
import { formatHours, hoursPerUnit, normaliseAssetRates, perUnitHint, RATE_UNITS, rateUnitLabel } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canManageWorkspace } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

/**
 * How fast the team produces each kind of deliverable.
 *
 * A count of deliverables says how many things there are, not how much work
 * they are: three hundred photo edits and ten campaign films are not a 30:1
 * difference in output, and the dashboard's asset count reads as though they
 * were. A rate here — "8 a day", "1 every 2 weeks" — lets the dashboard weigh
 * each type and report **effort in hours** beside the counts.
 *
 * Two things worth knowing about what this does *not* do. Nothing is written
 * back onto a task: effort is worked out when a chart is drawn, so correcting a
 * rate re-reads the history rather than rewriting it. And a type left blank
 * contributes nothing rather than a guessed default — the dashboard names the
 * blanks instead, because a total nobody can trust is worse than one that
 * admits what it is missing.
 */
export function RatesSection() {
  const ws = useWorkspace();
  const services = useServices();
  const types = useWorkspaceList(ws.workspace.id, "ASSET_TYPES");
  const manage = canManageWorkspace(ws.permissions);
  const stored = React.useMemo(() => normaliseAssetRates(ws.workspace.assetRates), [ws.workspace.assetRates]);
  const [draft, setDraft] = React.useState<AssetRates>(stored);
  const [seen, setSeen] = React.useState(stored);

  // The stored rates win whenever they change under us — another tab, or a
  // reload — rather than a stale draft sitting on top of them. Adjusted during
  // render rather than in an effect: an effect would paint the stale draft
  // first and then correct it, which is a visible flicker on the values
  // somebody is reading.
  if (seen !== stored) {
    setSeen(stored);
    setDraft(stored);
  }

  const save = useMutation({
    mutationFn: async (rates: AssetRates) => {
      const cleaned = normaliseAssetRates(rates);
      await services.repos.workspaces.update(ws.workspace.id, { assetRates: cleaned });
      return cleaned;
    },
    onSuccess: async (cleaned) => {
      setDraft(cleaned);
      await ws.refresh();
      toast.success("Output rates saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the rates"),
  });

  const dirty = JSON.stringify(normaliseAssetRates(draft)) !== JSON.stringify(stored);
  const rated = Object.keys(normaliseAssetRates(draft)).length;

  // The slowest type per unit, so the bars have something to be relative to.
  const slowest = Math.max(0, ...types.map((t) => hoursPerUnit(draft[t.name])));

  const patch = (name: string, next: Partial<AssetRate> | null) =>
    setDraft((prev) => {
      const rest = { ...prev };
      if (next === null) {
        delete rest[name];
        return rest;
      }
      const current = prev[name] ?? { qty: 1, every: 1, per: "day" as RatePer };
      return { ...rest, [name]: { ...current, ...next } };
    });

  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-semibold">Output rates</h2>
        <p className="text-[13px] text-muted-foreground">
          How many of each thing the team finishes, and how long that takes. The dashboard uses these to report effort in hours beside the counts.{" "}
          {manage ? "" : "Only workspace owners and admins can change them."}
        </p>
      </div>

      {types.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[13px] text-muted-foreground">
          No asset types yet. Add them under Lists first — a rate belongs to a type.
        </p>
      ) : (
        <div className="space-y-1.5">
          {types.map((type) => {
            const rate = draft[type.name];
            const hint = perUnitHint(rate);
            const hours = hoursPerUnit(rate);
            return (
              <div key={type.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-card px-3 py-2.5" data-testid={`rate-row-${type.name}`}>
                <span className="flex min-w-[9rem] flex-1 items-center gap-2">
                  <span aria-hidden className={cn("size-2.5 shrink-0 rounded-sm", colorClasses(type.color).dot)} />
                  <span className="truncate text-[13px] font-medium">{type.name}</span>
                </span>

                <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Input
                    type="number"
                    min={1}
                    step="any"
                    inputMode="decimal"
                    aria-label={`${type.name}: how many`}
                    className="h-8 w-16 tabular"
                    disabled={!manage}
                    value={rate ? String(rate.qty) : ""}
                    placeholder="—"
                    onChange={(e) => {
                      const qty = Number(e.target.value);
                      if (!e.target.value.trim()) patch(type.name, null);
                      else if (Number.isFinite(qty) && qty > 0) patch(type.name, { qty });
                    }}
                    data-testid={`rate-qty-${type.name}`}
                  />
                  every
                  <Input
                    type="number"
                    min={1}
                    step="any"
                    inputMode="decimal"
                    aria-label={`${type.name}: every how many`}
                    className="h-8 w-14 tabular"
                    disabled={!manage || !rate}
                    value={rate ? String(rate.every) : ""}
                    placeholder="1"
                    onChange={(e) => {
                      const every = Number(e.target.value);
                      if (Number.isFinite(every) && every > 0) patch(type.name, { every });
                    }}
                    data-testid={`rate-every-${type.name}`}
                  />
                  <Select value={rate?.per ?? "day"} disabled={!manage || !rate} onValueChange={(per) => patch(type.name, { per: per as RatePer })}>
                    <SelectTrigger className="h-8 w-24" aria-label={`${type.name}: per`} data-testid={`rate-per-${type.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RATE_UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {rateUnitLabel(rate?.every ?? 1, unit)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </span>

                {/* The sanity check: a rate that reads "2 min each" for a film
                    is wrong in a way the three numbers alone do not show. */}
                <span className="flex w-[13rem] shrink-0 items-center gap-2">
                  {hint ? (
                    <>
                      <span className="h-1.5 min-w-1 flex-1 overflow-hidden rounded-full bg-surface-strong/80">
                        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${slowest > 0 ? Math.max(3, (hours / slowest) * 100) : 0}%` }} />
                      </span>
                      <span className="shrink-0 text-2xs tabular text-muted-foreground">{hint}</span>
                    </>
                  ) : (
                    <span className="text-2xs text-muted-foreground/70">no rate — counts as nought hours</span>
                  )}
                </span>

                {manage && rate && (
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 text-2xs text-muted-foreground" onClick={() => patch(type.name, null)} data-testid={`rate-clear-${type.name}`}>
                    Clear
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {manage && types.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)} data-testid="rates-save">
            {save.isPending && <LoaderCircle className="animate-spin" />} Save rates
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(stored)} data-testid="rates-revert">
              Revert
            </Button>
          )}
          <p className="text-2xs text-muted-foreground">
            {rated} of {types.length} types rated
            {rated > 0 && slowest > 0 ? ` · slowest is ${formatHours(slowest)} for one` : ""}
          </p>
        </div>
      )}
    </>
  );
}
