"use client";

import { ArrowRight, Plus, X } from "lucide-react";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Board, BookingRouteRule, BookingRouteTarget, BookingRouting, BookingServiceType } from "@/domain";
import { newBlockId } from "@/domain";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Chip, ChipGroup } from "../booking-fields";

const TEAM = "__team__";
const ALLOCATION = "__allocation__";

const EMPTY: BookingRouting = { enabled: false, rules: [], otherwise: { kind: "team" } };

/**
 * Where a service's bookings land, chosen by the form rather than by the
 * team's nominated booking board: a switch, rules on the work types picked
 * (first match wins), and where everything else goes. Edits a copy; Save puts
 * it on the draft, like everything else in the editor, and nothing is live
 * until the form is published.
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
  onSave: (routing: BookingRouting | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" data-testid="booking-routing-dialog">
        {/* Mounted with the dialog, so each opening starts from what the service has. */}
        {open && <RoutingForm service={service} onCancel={() => onOpenChange(false)} onSave={(routing) => (onSave(routing), onOpenChange(false))} />}
      </DialogContent>
    </Dialog>
  );
}

function RoutingForm({ service, onCancel, onSave }: { service: BookingServiceType; onCancel: () => void; onSave: (routing: BookingRouting | null) => void }) {
  const ws = useWorkspace();
  const [routing, setRouting] = React.useState<BookingRouting>(() => structuredClone(service.routing ?? EMPTY));
  const team = ws.teamById(service.teamId);
  const teamBoard = ws.boardById(team?.bookingBoardId ?? null);
  const boards = ws.boards.filter((b) => !b.system && b.archivedAt === null);
  const workTypes = service.subServices;
  const name = service.name || "this service";

  const patch = (next: Partial<BookingRouting>) => setRouting((prev) => ({ ...prev, ...next }));
  const patchRule = (id: string, next: Partial<BookingRouteRule>) => patch({ rules: routing.rules.map((r) => (r.id === id ? { ...r, ...next } : r)) });
  const incomplete = routing.enabled && routing.rules.some((r) => r.workTypes.length === 0 || !r.boardId);
  const followsTeam = team ? (teamBoard ? `${team.name}'s booking board (${teamBoard.name})` : `${team.name}, via Task Allocation`) : "Task Allocation";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Where {name} bookings go</DialogTitle>
        <DialogDescription>Now: {followsTeam}.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface/50 px-3.5 py-3 text-[13px]">
          <span className="font-medium">Pick the board by work type</span>
          <Switch checked={routing.enabled} onCheckedChange={(enabled) => patch({ enabled })} aria-label="Pick the board by work type" data-testid="routing-enabled" />
        </label>

        {routing.enabled && (
          <>
            <div className="space-y-2">
              <p className="label-quiet">Rules, top first</p>
              {workTypes.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-[13px] text-muted-foreground">{name} offers no work types yet. Add them on step one.</p>
              ) : (
                <>
                  {routing.rules.map((rule, index) => (
                    <div key={rule.id} className="space-y-2 rounded-xl border border-border/70 p-3" data-testid="routing-rule">
                      <div className="flex items-center gap-2">
                        <span className="text-2xs font-semibold text-muted-foreground tabular">{index + 1}</span>
                        <span className="text-[13px] font-medium">If work types include</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="ml-auto size-7 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove rule ${index + 1}`}
                          onClick={() => patch({ rules: routing.rules.filter((r) => r.id !== rule.id) })}
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
                    onClick={() => patch({ rules: [...routing.rules, { id: newBlockId("route"), workTypes: [], boardId: "" }] })}
                    disabled={routing.rules.length >= 30}
                    data-testid="routing-add-rule"
                  >
                    <Plus /> Add a rule
                  </Button>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="label-quiet">Otherwise</p>
              <OtherwiseSelect value={routing.otherwise} boards={boards} teamLabel={followsTeam} hasTeamBoard={!!teamBoard} onChange={(otherwise) => patch({ otherwise })} />
            </div>
          </>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={incomplete}
          title={incomplete ? "Every rule needs a work type and a board" : undefined}
          // Switched off with nothing in it is the same as never having had any.
          onClick={() => onSave(!routing.enabled && routing.rules.length === 0 ? null : routing)}
          data-testid="routing-save"
        >
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

/** The boards a rule can send to, by team. */
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
              <SelectLabel>{group.label}</SelectLabel>
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

function OtherwiseSelect({
  value,
  boards,
  teamLabel,
  hasTeamBoard,
  onChange,
}: {
  value: BookingRouteTarget;
  boards: Board[];
  teamLabel: string;
  hasTeamBoard: boolean;
  onChange: (next: BookingRouteTarget) => void;
}) {
  // With no board of its own, the team's way and the queue are the same place: one entry for both.
  const current = value.kind === "board" ? value.boardId : !hasTeamBoard || value.kind === "team" ? TEAM : ALLOCATION;
  return (
    <BoardSelect
      value={current}
      boards={boards}
      ariaLabel="Where everything else goes"
      testId="routing-otherwise"
      onChange={(id) => onChange(id === TEAM ? { kind: "team" } : id === ALLOCATION ? { kind: "allocation" } : { kind: "board", boardId: id })}
      extra={
        <SelectGroup>
          {hasTeamBoard && <SelectItem value={TEAM}>{teamLabel}</SelectItem>}
          <SelectItem value={hasTeamBoard ? ALLOCATION : TEAM}>Task Allocation (a manager places it)</SelectItem>
        </SelectGroup>
      }
    />
  );
}
