"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Info } from "lucide-react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Team } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { queryKeys } from "@/lib/query/keys";
import { STANDARD_BOOKING_FIELDS, STANDARD_FIELD_LABELS, extraFieldsFor, planStandardFields } from "@/services/booking";
import { cn } from "@/lib/utils";

const TASK_ALLOCATION = "__allocation__";

/**
 * Team settings: which board receives this team's bookings. Because every board
 * has its own columns, the preview underneath shows exactly where each answer
 * from the booking form will go on the chosen board, what stays in the item's
 * description, and which extra questions the form will ask on the team's behalf.
 */
export function BookingBoardSetting({ team, value, onChange }: { team: Team; value: string | null; onChange: (boardId: string | null) => void }) {
  const ws = useWorkspace();
  const services = useServices();
  const boards = ws.boardsForTeam(team.id).filter((b) => !b.system);
  const chosen = value ? boards.find((b) => b.id === value) ?? null : null;

  const columns = useQuery({
    queryKey: queryKeys.boardColumns(chosen?.id ?? ""),
    queryFn: () => services.repos.boards.listColumns(chosen!.id),
    enabled: !!chosen,
    staleTime: 30_000,
  });

  const plan = columns.data ? planStandardFields(columns.data) : null;
  const extras = columns.data ? extraFieldsFor(columns.data) : [];

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
                <DynamicIcon name={b.icon} className={cn("size-3.5", colorClasses(b.color).text)} />
                {b.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!chosen ? (
        <p className="text-2xs text-muted-foreground">Bookings for {team.name} wait on Task Allocation, marked for this team, until a manager allocates them.</p>
      ) : plan ? (
        <div className="mt-1 space-y-2.5 rounded-xl border border-border/60 bg-surface/50 p-3 text-2xs" data-testid="booking-mapping">
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <Info className="mt-px size-3 shrink-0" />
            Bookings go straight onto {chosen.name}. Answers land in these columns; the rest is kept in the item&apos;s description.
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {STANDARD_BOOKING_FIELDS.map((field) => {
              const column = plan[field];
              return (
                <li key={field} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">{STANDARD_FIELD_LABELS[field]}</span>
                  <ArrowRight className="size-3 shrink-0 text-border" />
                  {column ? <span className="font-medium">{column.name}</span> : <span className="italic text-muted-foreground">description</span>}
                </li>
              );
            })}
          </ul>
          {extras.length > 0 && (
            <p className="text-muted-foreground">
              The form also asks for: <span className="font-medium text-foreground">{extras.map((f) => f.name).join(", ")}</span>.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
