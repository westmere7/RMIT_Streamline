"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { EntityId, LeaveEntry } from "@/domain";
import { LEAVE_KIND_LABELS, workingDaysBetween } from "@/domain";
import { LeaveDialog } from "@/features/calendar/dialogs";
import { useHolidays, useLeave } from "@/features/calendar/hooks";
import { spanLabel, todayInVietnam } from "@/features/calendar/model";
import { LEAVE_COLORS } from "@/features/calendar/views";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { isWorkspaceAdmin } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

/** A person's leave on their profile: what is coming, and a way to add more (theirs, or an admin's). */
export function useProfileLeave(userId: EntityId) {
  const ws = useWorkspace();
  const leave = useLeave(ws.workspace.id);
  const today = todayInVietnam();
  return React.useMemo(() => (leave.data ?? []).filter((l) => l.userId === userId && l.status === "PLANNED" && l.endsOn >= today), [leave.data, userId, today]);
}

export function ProfileLeave({ userId }: { userId: EntityId }) {
  const ws = useWorkspace();
  const upcoming = useProfileLeave(userId);
  const holidays = useHolidays(ws.workspace.id);
  const isAdmin = isWorkspaceAdmin(ws.permissions);
  const canAdd = isAdmin || ws.currentUser.id === userId;
  const [open, setOpen] = React.useState<{ entry: LeaveEntry | null } | null>(null);
  const cal = { holidays: holidays.data ?? [] };
  return (
    <div className="grid gap-2" data-testid="profile-leave">
      {upcoming.length === 0 ? (
        <p className="px-2 py-1 text-[13px] text-muted-foreground">No leave coming up.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {upcoming.map((l) => {
            const days = workingDaysBetween(cal, l.startsOn, l.endsOn) - (l.startHalf ? 0.5 : 0) - (l.endHalf && l.endsOn !== l.startsOn ? 0.5 : 0);
            return (
              <li key={l.id}>
                <button type="button" onClick={() => setOpen({ entry: l })} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-accent/70">
                  <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-medium", colorClasses(LEAVE_COLORS[l.kind]).soft)}>{LEAVE_KIND_LABELS[l.kind]}</span>
                  <span className="min-w-0 flex-1 truncate">{spanLabel(l.startsOn, l.endsOn)}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground tabular">
                    {days} working {days === 1 ? "day" : "days"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {canAdd && (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setOpen({ entry: null })} data-testid="profile-add-leave">
          <Plus /> Add leave
        </Button>
      )}
      <LeaveDialog open={!!open} onOpenChange={(o) => !o && setOpen(null)} workspaceId={ws.workspace.id} me={ws.currentUser.id} isAdmin={isAdmin} people={ws.activeUsers} entry={open?.entry ?? null} day={todayInVietnam()} defaultUserId={userId} />
    </div>
  );
}
