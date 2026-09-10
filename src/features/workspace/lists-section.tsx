"use client";

import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ColorPicker } from "@/components/shared/color-picker";
import { LabelPill } from "@/components/shared/label-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import type { AssetRate, AssetRates, ColorToken, RatePer, TagOption, WorkspaceListKey } from "@/domain";
import { hoursPerUnit, MAX_LIST_OPTION_NAME, normaliseAssetRates, perUnitHint, RATE_UNITS, rateUnitLabel, WORKSPACE_LIST_KEYS, WORKSPACE_LIST_META } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { addRow, describeDraft, draftCommit, draftDirty, liveRows, removeRow, renameRow, rowsFromOptions, type DraftRow } from "@/features/workspace/list-draft";
import { useListOptionUsage, useWorkspaceLists, useWorkspaceListMutations } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { canManageWorkspace } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

/** Nothing means "leave the word where it is" in the replace picker. */
const KEEP = "__keep__";

/**
 * The lists this workspace standardises, and what each word is worth.
 *
 * One tab per list — the asset types a deliverable can be, the stakeholder
 * groups a request comes from — because they are separate vocabularies and
 * reading one should not mean scrolling past the other.
 *
 * A list row is a word *and its values*. Asset types carry an output rate, and
 * the rate belongs on the row rather than in a section of its own: rates are
 * keyed by type name, and `workspace_lists` rows are rewritten whole on every
 * save, so a name that lives in one editor and a rate that lives in another
 * drift apart the moment somebody renames something. Here a rename moves the
 * rate with it, and a removal takes it away, because they are one edit.
 *
 * Nothing is written until Save. Every change — a name, a colour, a rate, an
 * addition, a removal and what happens to the work carrying it — is held as a
 * draft, so a half-finished thought can be abandoned with Discard, and one
 * commit writes the list, the renames and the rates together.
 */
export function ListsSection() {
  const ws = useWorkspace();
  const lists = useWorkspaceLists(ws.workspace.id);
  const manage = canManageWorkspace(ws.permissions);

  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-semibold">Lists</h2>
        <p className="text-[13px] text-muted-foreground">
          The words everyone picks from, and what each one is worth. {manage ? "Editing one changes it for the whole workspace." : "Only workspace owners and admins can change them."}
        </p>
      </div>

      <Tabs defaultValue={WORKSPACE_LIST_KEYS[0]}>
        <UnderlineTabsList className="mb-5">
          {WORKSPACE_LIST_KEYS.map((key) => (
            <UnderlineTabsTrigger key={key} value={key} data-testid={`lists-tab-${key}`}>
              {WORKSPACE_LIST_META[key].label}
              <span className="text-2xs font-normal text-muted-foreground tabular">{(lists.data?.[key] ?? WORKSPACE_LIST_META[key].defaults).length}</span>
            </UnderlineTabsTrigger>
          ))}
        </UnderlineTabsList>

        {WORKSPACE_LIST_KEYS.map((key) => (
          <TabsContent key={key} value={key}>
            <ListEditor key={key} listKey={key} options={lists.data?.[key] ?? WORKSPACE_LIST_META[key].defaults.map((o) => ({ ...o }))} canEdit={manage} />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

function ListEditor({ listKey, options, canEdit }: { listKey: WorkspaceListKey; options: TagOption[]; canEdit: boolean }) {
  const ws = useWorkspace();
  const services = useServices();
  const meta = WORKSPACE_LIST_META[listKey];
  const { save, remove } = useWorkspaceListMutations(ws.workspace.id);

  // Asset types are the list that carries a value today. The rates live on the
  // workspace, not on the list rows, so they are drafted alongside them.
  const carriesRates = listKey === "ASSET_TYPES";
  const storedRates = React.useMemo(() => (carriesRates ? normaliseAssetRates(ws.workspace.assetRates) : {}), [carriesRates, ws.workspace.assetRates]);

  const [rows, setRows] = React.useState<DraftRow[]>(() => rowsFromOptions(options));
  const [rates, setRates] = React.useState<AssetRates>(storedRates);
  const [adding, setAdding] = React.useState("");
  const [asking, setAsking] = React.useState<DraftRow | null>(null);

  const live = liveRows(rows);
  const pending = draftCommit(rows, rates);
  const ratesChanged = carriesRates && JSON.stringify(pending.rates) !== JSON.stringify(storedRates);
  const dirty = draftDirty(pending, options, storedRates, carriesRates);

  // Reseed the draft when the stored list moves under us — a save landing, or a
  // background refetch — but only while there is nothing unsaved to lose. The
  // lists query refetches on focus once it goes stale, and remounting on that
  // would throw away an edit somebody was halfway through. If they do hold
  // unsaved work while someone else changes the list, their draft stands and
  // their Save wins; losing the edit silently would be the worse of the two.
  const settled = JSON.stringify([options, storedRates]);
  const [seen, setSeen] = React.useState(settled);
  if (seen !== settled) {
    setSeen(settled);
    if (!dirty) {
      setRows(rowsFromOptions(options));
      setRates(storedRates);
    }
  }

  const commit = useMutation({
    mutationFn: async () => {
      // Through the shared mutations rather than the services directly: they are
      // what settle the lists query and tell the boards their vocabulary moved.
      //
      // Removals first — each rewrites the work that carries the word — and the
      // save that follows is what settles the list itself.
      for (const { name, removal } of pending.removals) {
        await remove.mutateAsync({ listKey, name, options: removal.replaceWith === undefined ? {} : { replaceWith: removal.replaceWith } });
      }
      await save.mutateAsync({ listKey, options: pending.options, renames: pending.renames });
      // The rates last, and only once the names they key by are settled.
      if (carriesRates) await services.repos.workspaces.update(ws.workspace.id, { assetRates: pending.rates });
    },
    onSuccess: async () => {
      // The workspace carries the rates, and the editor is keyed on the lists
      // query, so both have to come round before the draft is reseeded.
      if (carriesRates) await ws.refresh();
      toast.success(`${meta.label} saved`);
    },
    // The shared mutations already report their own failures; this covers the
    // rates write and says the save did not land.
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the list"),
  });

  const discard = () => {
    setRows(rowsFromOptions(options));
    setRates(storedRates);
    setAdding("");
  };

  const patchRow = (id: string, next: Partial<DraftRow>) => setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...next } : row)));

  /** A rename takes the rate with it: they are the same edit. */
  const rename = (row: DraftRow, raw: string) => {
    const result = renameRow(rows, rates, row.id, raw.slice(0, MAX_LIST_OPTION_NAME));
    if ("refused" in result) {
      if (result.refused === "duplicate") toast.error(`${meta.label} already has "${raw.trim()}"`);
      return;
    }
    setRows(result.rows);
    setRates(result.rates);
  };

  const add = () => {
    const result = addRow(rows, adding, tagColorFor(adding.trim()));
    setAdding("");
    if ("refused" in result) return;
    setRows(result);
  };

  const patchRate = (name: string, next: Partial<AssetRate> | null) =>
    setRates((prev) => {
      const rest = { ...prev };
      if (next === null) {
        delete rest[name];
        return rest;
      }
      const current = prev[name] ?? { qty: 1, every: 1, per: "day" as RatePer };
      return { ...rest, [name]: { ...current, ...next } };
    });

  const slowest = Math.max(0, ...live.map((row) => hoursPerUnit(rates[row.name])));
  const rated = live.filter((row) => hoursPerUnit(rates[row.name]) > 0).length;

  return (
    <section data-testid={`list-${listKey}`}>
      <div className="mb-2 flex items-baseline gap-2">
        <p className="text-2xs text-muted-foreground">{meta.description}</p>
        {carriesRates && (
          <span className="ml-auto shrink-0 text-2xs text-muted-foreground tabular" data-testid="lists-rated-count">
            {rated} of {live.length} rated
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
        {carriesRates && (
          <div className="flex items-center gap-2 border-b border-border/60 bg-surface/50 px-2.5 py-1.5 text-2xs text-muted-foreground">
            <span className="min-w-0 flex-1">Type</span>
            <span className="w-[15.5rem] shrink-0">Output rate — how many the team finishes</span>
            <span className="w-[12rem] shrink-0">Time for one</span>
            <span className="w-7 shrink-0" />
          </div>
        )}

        <ul className="divide-y divide-border/60">
          {rows.map((row) => (
            <ListRow
              key={row.id}
              row={row}
              canEdit={canEdit}
              carriesRates={carriesRates}
              rate={rates[row.name]}
              slowest={slowest}
              onRecolor={(color) => patchRow(row.id, { color })}
              onRename={(name) => rename(row, name)}
              onRate={(next) => patchRate(row.name, next)}
              onAskRemove={() => setAsking(row)}
              onUndoRemove={() => patchRow(row.id, { removal: undefined })}
            />
          ))}
          {rows.length === 0 && <li className="px-3 py-3 text-center text-[13px] text-muted-foreground">Nothing in this list yet.</li>}
        </ul>

        {canEdit && (
          <div className="flex items-center gap-2 border-t border-border/60 px-2.5 py-1.5">
            <Plus className="size-3.5 shrink-0 text-muted-foreground/60" />
            <input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                add();
              }}
              maxLength={MAX_LIST_OPTION_NAME}
              placeholder={`Add to ${meta.label.toLowerCase()}`}
              aria-label={`Add to ${meta.label}`}
              className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
              data-testid="list-add-input"
            />
            <Button type="button" size="sm" variant="secondary" className="h-7 shrink-0" disabled={!adding.trim()} onClick={add} data-testid="list-add-submit">
              Add
            </Button>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
          <Button disabled={!dirty || commit.isPending} onClick={() => commit.mutate()} data-testid="lists-save">
            {commit.isPending && <LoaderCircle className="animate-spin" />} Save
          </Button>
          <Button variant="ghost" disabled={!dirty || commit.isPending} onClick={discard} data-testid="lists-discard">
            <RotateCcw /> Discard
          </Button>
          <p className="text-2xs text-muted-foreground" data-testid="lists-dirty-note">
            {dirty ? describeDraft(pending, options, ratesChanged) : "No unsaved changes."}
          </p>
        </div>
      )}

      <RemoveOptionDialog
        listKey={listKey}
        row={asking}
        others={live.filter((row) => row.id !== asking?.id).map((row) => row.name)}
        onClose={() => setAsking(null)}
        onConfirm={(removal) => {
          if (asking) setRows(removeRow(rows, asking.id, removal));
          setAsking(null);
        }}
      />
    </section>
  );
}

function ListRow({
  row,
  canEdit,
  carriesRates,
  rate,
  slowest,
  onRecolor,
  onRename,
  onRate,
  onAskRemove,
  onUndoRemove,
}: {
  row: DraftRow;
  canEdit: boolean;
  carriesRates: boolean;
  rate: AssetRate | undefined;
  slowest: number;
  onRecolor: (color: ColorToken) => void;
  onRename: (name: string) => void;
  onRate: (next: Partial<AssetRate> | null) => void;
  onAskRemove: () => void;
  onUndoRemove: () => void;
}) {
  const removed = !!row.removal;
  const hint = perUnitHint(rate);
  const hours = hoursPerUnit(rate);

  return (
    <li className={cn("group flex items-center gap-2 px-2.5 py-1.5", removed && "bg-destructive/[0.04]")} data-testid="list-option">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Popover>
          <PopoverTrigger asChild disabled={!canEdit || removed}>
            <button
              type="button"
              aria-label={`Colour of ${row.name}`}
              className={cn("size-4 shrink-0 rounded-full", colorClasses(row.color).dot, canEdit && !removed && "hover:ring-2 hover:ring-ring")}
              data-testid="list-option-color"
            />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <ColorPicker value={row.color} onChange={onRecolor} />
          </PopoverContent>
        </Popover>

        {canEdit && !removed ? (
          <input
            defaultValue={row.name}
            key={row.name}
            maxLength={MAX_LIST_OPTION_NAME}
            aria-label={`Name of ${row.name}`}
            onBlur={(e) => onRename(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = row.name;
                e.currentTarget.blur();
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[13px] outline-none hover:bg-accent focus:bg-background focus:ring-2 focus:ring-ring"
            data-testid="list-option-name"
          />
        ) : (
          <span className={cn("min-w-0 flex-1 truncate px-1.5 text-[13px]", removed && "line-through text-muted-foreground")} data-testid="list-option-name">
            {row.name}
          </span>
        )}
      </span>

      {carriesRates &&
        (removed ? (
          <span className="w-[27.5rem] shrink-0 text-2xs text-muted-foreground">
            {row.removal?.replaceWith === undefined ? "will leave the list" : row.removal.replaceWith === null ? "will be cleared from its deliverables" : `will move to ${row.removal.replaceWith}`}
          </span>
        ) : (
          <>
            <span className="flex w-[15.5rem] shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
              <Input
                type="number"
                min={1}
                step="any"
                inputMode="decimal"
                aria-label={`${row.name}: how many`}
                className="h-7 w-16 tabular"
                disabled={!canEdit}
                value={rate ? String(rate.qty) : ""}
                placeholder="—"
                onChange={(e) => {
                  const qty = Number(e.target.value);
                  if (!e.target.value.trim()) onRate(null);
                  else if (Number.isFinite(qty) && qty > 0) onRate({ qty });
                }}
                data-testid={`rate-qty-${row.name}`}
              />
              every
              <Input
                type="number"
                min={1}
                step="any"
                inputMode="decimal"
                aria-label={`${row.name}: every how many`}
                className="h-7 w-14 tabular"
                disabled={!canEdit || !rate}
                value={rate ? String(rate.every) : ""}
                placeholder="1"
                onChange={(e) => {
                  const every = Number(e.target.value);
                  if (Number.isFinite(every) && every > 0) onRate({ every });
                }}
                data-testid={`rate-every-${row.name}`}
              />
              <Select value={rate?.per ?? "day"} disabled={!canEdit || !rate} onValueChange={(per) => onRate({ per: per as RatePer })}>
                <SelectTrigger className="h-7 w-[5.5rem]" aria-label={`${row.name}: per`} data-testid={`rate-per-${row.name}`}>
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

            {/* The sanity check: a rate reading "2 min each" for a campaign film
                is wrong in a way the three numbers alone do not show. */}
            <span className="flex w-[12rem] shrink-0 items-center gap-2">
              {hint ? (
                <>
                  <span className="h-1.5 min-w-1 flex-1 overflow-hidden rounded-full bg-surface-strong/80">
                    <span className="block h-full rounded-full bg-primary/70" style={{ width: `${slowest > 0 ? Math.max(3, (hours / slowest) * 100) : 0}%` }} />
                  </span>
                  <span className="shrink-0 text-2xs tabular text-muted-foreground">{hint}</span>
                </>
              ) : (
                <span className="text-2xs text-muted-foreground/70">no rate — nought hours</span>
              )}
            </span>
          </>
        ))}

      {canEdit &&
        (removed ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Keep ${row.name}`} onClick={onUndoRemove} className="shrink-0 text-muted-foreground" data-testid="list-option-undo">
            <Undo2 />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${row.name}`}
            onClick={onAskRemove}
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
            data-testid="list-option-remove"
          >
            <X />
          </Button>
        ))}
    </li>
  );
}

/**
 * Taking a word out of a list when things already carry it. It says how many,
 * and either hands them to another option or leaves the word on them — never
 * silently blanks work that has already been done.
 *
 * The answer is recorded in the draft rather than sent: nothing here happens
 * until Save, so the row stays visible with what is about to become of it, and
 * Discard brings it back.
 */
function RemoveOptionDialog({
  listKey,
  row,
  others,
  onClose,
  onConfirm,
}: {
  listKey: WorkspaceListKey;
  row: DraftRow | null;
  others: string[];
  onClose: () => void;
  onConfirm: (removal: { replaceWith?: string | null }) => void;
}) {
  const ws = useWorkspace();
  // Only a stored word can have anything using it; one added in this draft cannot.
  const usage = useListOptionUsage(ws.workspace.id, listKey, row?.origin ?? null);
  const [replaceWith, setReplaceWith] = React.useState<string>(KEEP);
  // The dialog animates out after the row is marked, so it keeps the last one to
  // read from — and each row opens its own question, so the previous answer must
  // not carry over to it.
  const [shown, setShown] = React.useState<DraftRow | null>(row);
  if (row && row.id !== shown?.id) {
    setShown(row);
    setReplaceWith(KEEP);
  }
  const count = row?.origin ? (usage.data?.count ?? 0) : 0;
  const checking = !!row?.origin && usage.isLoading;

  return (
    <Dialog open={!!row} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm" data-testid="list-remove-dialog">
        <DialogHeader>
          <DialogTitle>Remove {shown?.name}?</DialogTitle>
          <DialogDescription>
            {!shown?.origin
              ? "It was only added here, so it just leaves the draft."
              : checking
                ? "Checking what still uses it…"
                : count === 0
                  ? `Nothing uses ${shown?.name}, so it just leaves the list.`
                  : `${count} ${usage.data?.noun} still ${count === 1 ? "carries" : "carry"} it.`}
          </DialogDescription>
        </DialogHeader>

        {count > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] font-medium">What happens to {count === 1 ? "it" : "them"}?</p>
            <Select value={replaceWith} onValueChange={setReplaceWith}>
              <SelectTrigger data-testid="list-remove-replacement">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Keep {shown?.name} on them</SelectItem>
                <SelectItem value="">Clear it</SelectItem>
                {others.map((other) => (
                  <SelectItem key={other} value={other}>
                    Move them to {other}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {replaceWith === KEEP && (
              <p className="text-2xs text-muted-foreground">
                They keep the word <LabelPill label={{ id: shown?.name ?? "", name: shown?.name ?? "", color: shown?.color ?? "gray" }} appearance="soft" size="sm" /> and the list stops offering it.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(replaceWith === KEEP ? {} : { replaceWith: replaceWith === "" ? null : replaceWith })}
            disabled={checking}
            data-testid="list-remove-confirm"
          >
            <Trash2 /> Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
