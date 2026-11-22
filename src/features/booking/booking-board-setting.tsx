"use client";

import type * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Info, SquareKanban } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Team } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";
import { STANDARD_BOOKING_FIELDS, STANDARD_FIELD_LABELS, bookingDestinations, type BookingDestination, type StandardBookingField } from "@/services/booking";
import { cn } from "@/lib/utils";

const TASK_ALLOCATION = "__allocation__";

/**
 * Team settings: which board receives this team's bookings. Because every board
 * has its own columns, the preview underneath shows exactly where each answer
 * from the booking form will go on the chosen board and what stays in the
 * item's description.
 *
 * Which bookings arrive here at all is the form's business, not this setting's:
 * a service type in the form editor names the team it belongs to, and this says
 * where that team's work lands once it does.
 */
export function BookingBoardSetting({ team, value, onChange }: { team: Team; value: string | null; onChange: (boardId: string | null) => void }) {
  const ws = useWorkspace();
  const services = useServices();
  const boards = ws.boardsForTeam(team.id).filter((b) => !b.system);
  const chosen = value ? boards.find((b) => b.id === value) ?? null : null;

  // The preview says which of the standard fields the chosen board has, so a
  // column added to it elsewhere changes the answer here.
  // Built inline rather than memoized: useRealtime is keyed by what the
  // bindings describe, not by the identity of the array they arrive in.
  const chosenId = chosen?.id ?? null;
  const bindings: RealtimeBinding[] = chosenId ? [{ table: "board_columns", filter: `board_id=eq.${chosenId}`, keys: [queryKeys.boardColumns(chosenId)] }] : [];
  useRealtime(chosenId ? `booking-board:${chosenId}` : null, bindings);

  const columns = useQuery({
    queryKey: queryKeys.boardColumns(chosen?.id ?? ""),
    queryFn: () => services.repos.boards.listColumns(chosen!.id),
    enabled: !!chosen,
    staleTime: 30_000,
  });

  // The chosen board is one of the team's own, so the team goes without saying.
  const plan = columns.data ? bookingDestinations(columns.data, { teamOwnsBoard: true }) : null;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="team-booking-board">Bookings land on</Label>
      <Select value={value ?? TASK_ALLOCATION} onValueChange={(v) => onChange(v === TASK_ALLOCATION ? null : v)}>
        <SelectTrigger id="team-booking-board" aria-label="Bookings land on" data-testid="team-booking-board">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TASK_ALLOCATION}>Task Allocation (a manager places them)</SelectItem>
          {boards.map((b) => (
            <SelectItem key={b.id} value={b.id} data-testid={`team-booking-board-${b.slug}`}>
              <span className="flex items-center gap-2">
                <SquareKanban className="size-3.5 shrink-0 text-muted-foreground" />
                {b.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!chosen ? (
        <p className="text-2xs text-muted-foreground">Bookings for {team.name} wait on Task Allocation, marked for this team, until a manager allocates them.</p>
      ) : plan ? (
        <BookingMapping boardName={chosen.name} plan={plan} />
      ) : null}
    </div>
  );
}

/**
 * Where a booking's answers end up, in three plain groups: the board's own
 * columns (answer, then the column), the task's Assets tab, and whatever is
 * left over for the description.
 */
function BookingMapping({ boardName, plan }: { boardName: string; plan: Record<StandardBookingField, BookingDestination[]> }) {
  const intoColumns: Array<{ field: StandardBookingField; column: string }> = [];
  const inBrief: StandardBookingField[] = [];
  const ontoAssets: StandardBookingField[] = [];
  const intoDescription: StandardBookingField[] = [];
  for (const field of STANDARD_BOOKING_FIELDS) {
    for (const place of plan[field]) {
      if (place.kind === "column") intoColumns.push({ field, column: place.column.name });
      else if (place.kind === "brief") inBrief.push(field);
      else if (place.kind === "assets") ontoAssets.push(field);
      else intoDescription.push(field);
    }
  }
  return (
    <div className="mt-1 space-y-3 rounded-xl border border-border/60 bg-surface/50 p-3" data-testid="booking-mapping">
      <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
        <Info className="mt-px size-3 shrink-0" aria-hidden />
        Bookings go straight onto {boardName}.
      </p>
      {intoColumns.length > 0 && (
        <MappingGroup title={`Columns on ${boardName}`}>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {intoColumns.map(({ field, column }) => (
              <li key={`${field}-${column}`} className="flex min-w-0 items-center gap-2 text-[13px]" data-testid={`booking-mapping-${field}`}>
                <span className="w-24 shrink-0 truncate text-muted-foreground">{STANDARD_FIELD_LABELS[field]}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                <span className="min-w-0 truncate rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium">{column}</span>
              </li>
            ))}
          </ul>
        </MappingGroup>
      )}
      {inBrief.length > 0 && (
        <MappingGroup title="In the brief">
          <FieldChips fields={inBrief} testId="booking-mapping-brief" />
        </MappingGroup>
      )}
      {ontoAssets.length > 0 && (
        <MappingGroup title="Assets tab">
          <FieldChips fields={ontoAssets} testId="booking-mapping-assets-tab" />
        </MappingGroup>
      )}
      {intoDescription.length > 0 && (
        <MappingGroup title="Description">
          <FieldChips fields={intoDescription} muted testId="booking-mapping-description" />
        </MappingGroup>
      )}
    </div>
  );
}

function MappingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 border-t border-border/60 pt-2.5">
      <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      {children}
    </div>
  );
}

function FieldChips({ fields, muted = false, testId }: { fields: StandardBookingField[]; muted?: boolean; testId: string }) {
  return (
    <ul className="flex flex-wrap gap-1.5" data-testid={testId}>
      {fields.map((field) => (
        <li key={field} className={cn("rounded-md px-1.5 py-0.5 text-xs", muted ? "border border-border/70 text-muted-foreground" : "bg-accent font-medium")}>
          {STANDARD_FIELD_LABELS[field]}
        </li>
      ))}
    </ul>
  );
}
