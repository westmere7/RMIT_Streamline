"use client";

import { ArrowRight, Plus, X } from "lucide-react";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Board, BookingRouteRule, BookingRouteTarget, BookingRouting, BookingServiceType } from "@/domain";
import { newBlockId } from "@/domain";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Chip, ChipGroup } from "../booking-fields";

const ALLOCATION = "__allocation__";
const TEAM = "team:";

/** What Save hands back: the rules, switched on, and the team that takes what no rule catches (if a team does). */
export interface RoutingPatch {
  routing: BookingRouting;
  teamId: string | null;
}

/**
 * The rules behind Auto-allocation in Bookings go to: each sends a booking that
 * picked any of its work types to a board, the first match winning, and
 * Otherwise takes the rest: Task Allocation, a team's own booking board, or any
 * board. Edits a copy; Save puts it on the draft, like everything else in the
 * editor, and nothing is live until the form is published.
 */
export function RoutingDialog({
  service,
  open,
  onOpenChange,
  onSave,
}: {
  service: BookingServiceType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: RoutingPatch) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" data-testid="booking-routing-dialog">
        {/* Mounted with the dialog, so each opening starts from what the service has. */}
        {open && <RoutingForm service={service} onCancel={() => onOpenChange(false)} onSave={(patch) => (onSave(patch), onOpenChange(false))} />}
      </DialogContent>
    </Dialog>
  );
}

function RoutingForm({ service, onCancel, onSave }: { service: BookingServiceType; onCancel: () => void; onSave: (patch: RoutingPatch) => void }) {
  const ws = useWorkspace();
  const [rules, setRules] = React.useState<BookingRouteRule[]>(() =>
    service.routing?.rules.length ? structuredClone(service.routing.rules) : [{ id: newBlockId("route"), workTypes: [], boardId: "" }],
  );
  // Otherwise, as one value: the queue, a team (its own booking board), or a board.
  const [otherwise, setOtherwise] = React.useState<string>(() => {
    const target = service.routing?.otherwise ?? ({ kind: "team" } as BookingRouteTarget);
    if (target.kind === "board") return target.boardId;
    if (target.kind === "team" && service.teamId) return TEAM + service.teamId;
    return ALLOCATION;
  });
  const boards = ws.boards.filter((b) => !b.system && b.archivedAt === null);
  const teams = ws.teams.filter((t) => !t.system && t.archivedAt === null).sort((a, b) => a.name.localeCompare(b.name));
  const workTypes = service.subServices;
  const name = service.name || "this service";
  const patchRule = (id: string, next: Partial<BookingRouteRule>) => setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));
  const incomplete = rules.length === 0 || rules.some((r) => r.workTypes.length === 0 || !r.boardId);

  const save = () => {
    const team = otherwise.startsWith(TEAM) ? otherwise.slice(TEAM.length) : null;
    const target: BookingRouteTarget = team ? { kind: "team" } : otherwise === ALLOCATION ? { kind: "allocation" } : { kind: "board", boardId: otherwise };
    onSave({ routing: { enabled: true, rules, otherwise: target }, teamId: team });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Auto-allocation for {name}</DialogTitle>
        <DialogDescription>Picks the board from the work types chosen. The first rule that matches decides.</DialogDescription>
      </DialogHeader>

      {workTypes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-[13px] text-muted-foreground">{name} offers no work types yet. Add them on step one first.</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {rules.map((rule, index) => (
              <div key={rule.id} className="space-y-2 rounded-xl border border-border/70 p-3" data-testid="routing-rule">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-2xs font-semibold text-muted-foreground tabular">{index + 1}</span>
                  <span className="text-[13px] font-medium">If work types</span>
                  <MatchToggle value={rule.match ?? "any"} onChange={(match) => patchRule(rule.id, { match: match === "any" ? undefined : match })} index={index} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto size-7 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove rule ${index + 1}`}
                    onClick={() => setRules((prev) => prev.filter((r) => r.id !== rule.id))}
                    data-testid="routing-rule-remove"
                  >
                    <X />
                  </Button>
                </div>
                <ChipGroup ariaLabel={`Work types for rule ${index + 1}`}>
                  {workTypes.map((w) => {
                    const on = rule.workTypes.includes(w.name);
                    return (
                      <Chip key={w.name} color={w.color} active={on} onClick={() => patchRule(rule.id, { workTypes: on ? rule.workTypes.filter((x) => x !== w.name) : [...rule.workTypes, w.name] })}>
                        {w.name}
                      </Chip>
                    );
                  })}
                </ChipGroup>
                <div className="flex items-center gap-2">
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <BoardSelect value={rule.boardId} boards={boards} onChange={(boardId) => patchRule(rule.id, { boardId })} ariaLabel={`Board for rule ${index + 1}`} testId="routing-rule-board" />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRules((prev) => [...prev, { id: newBlockId("route"), workTypes: [], boardId: "" }])}
              disabled={rules.length >= 30}
              data-testid="routing-add-rule"
            >
              <Plus /> Add a rule
            </Button>
          </div>

          <div className="space-y-1.5">
            <p className="label-quiet">Otherwise</p>
            <BoardSelect
              value={otherwise}
              boards={boards}
              onChange={setOtherwise}
              ariaLabel="Where everything else goes"
              testId="routing-otherwise"
              extra={
                <>
                  <SelectGroup>
                    <SelectItem value={ALLOCATION}>Task Allocation (a manager places it)</SelectItem>
                  </SelectGroup>
                  {teams.length > 0 && (
                    <>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel>A team&apos;s booking board</SelectLabel>
                        {teams.map((team) => {
                          const own = ws.boardById(team.bookingBoardId ?? null);
                          return (
                            <SelectItem key={team.id} value={TEAM + team.id}>
                              <span className="flex min-w-0 items-center gap-2">
                                <DynamicIcon name={team.icon} className={cn("size-3.5 shrink-0", colorClasses(team.color).text)} />
                                <span className="truncate">{team.name}</span>
                                <span className="truncate text-muted-foreground">{own ? own.name : "via Task Allocation"}</span>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    </>
                  )}
                </>
              }
            />
          </div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={incomplete || workTypes.length === 0} title={incomplete ? "Every rule needs a work type and a board" : undefined} onClick={save} data-testid="routing-save">
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

/** The boards a rule can send to, by team; `extra` goes above them. */
function BoardSelect({ value, boards, onChange, ariaLabel, testId, extra }: { value: string; boards: Board[]; onChange: (id: string) => void; ariaLabel: string; testId?: string; extra?: React.ReactNode }) {
  const ws = useWorkspace();
  const byTeam = new Map<string, Board[]>();
  for (const board of boards) {
    const key = board.teamId ?? "";
    byTeam.set(key, [...(byTeam.get(key) ?? []), board]);
  }
  const groups = [...byTeam.entries()]
    .map(([teamId, list]) => ({ label: ws.teamById(teamId || null)?.name ?? "No team", list: list.slice().sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9 min-w-0 flex-1 text-[13px]" aria-label={ariaLabel} data-testid={testId}>
        <SelectValue placeholder="Choose a board" />
      </SelectTrigger>
      <SelectContent>
        {extra}
        {groups.map((group, i) => (
          <React.Fragment key={group.label}>
            {(i > 0 || extra) && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel>{extra ? `Board · ${group.label}` : group.label}</SelectLabel>
              {group.list.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <DynamicIcon name={board.icon} className={cn("size-3.5 shrink-0", colorClasses(board.color).text)} />
                    <span className="truncate">{board.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </React.Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}

/** How a rule's work types are matched: any of them among those picked, or exactly these. */
function MatchToggle({ value, onChange, index }: { value: "any" | "exact"; onChange: (next: "any" | "exact") => void; index: number }) {
  const options = [
    { key: "any" as const, label: "Include", hint: "Any of these, whatever else is picked" },
    { key: "exact" as const, label: "Are exactly", hint: "These and nothing else" },
  ];
  return (
    <div role="radiogroup" aria-label={`How rule ${index + 1} matches`} className="inline-flex rounded-lg border border-border/70 bg-surface p-0.5" data-testid="routing-rule-match">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={value === option.key}
          title={option.hint}
          onClick={() => onChange(option.key)}
          className={cn(
            "h-7 rounded-md px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            value === option.key ? "state-on" : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={`routing-rule-match-${option.key}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

