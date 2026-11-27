"use client";

import { Palmtree } from "lucide-react";
import Link from "next/link";
import { AvatarStack } from "@/components/shared/user-avatar";
import type { User } from "@/domain";
import { useHolidays, useLeave } from "@/features/calendar/hooks";
import { holidaysOn, leaveOn, todayInVietnam } from "@/features/calendar/model";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";

/** Who is out today, or the holiday it is, as a link to the Calendar. Nothing when everyone is in. */
export function AwayToday() {
  const ws = useWorkspace();
  const leave = useLeave(ws.workspace.id);
  const holidays = useHolidays(ws.workspace.id);
  const today = todayInVietnam();
  const holiday = holidaysOn(holidays.data ?? [], today)[0];
  const away = leaveOn(leave.data ?? [], today);
  if (!holiday && away.length === 0) return null;
  const users = away.map((l) => ws.userById(l.userId)).filter((u): u is User => !!u);
  return (
    <Link href={routes.calendar(ws.slug)} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-2.5 py-1 text-[12.5px] text-muted-foreground hover:border-input hover:text-foreground" data-testid="home-away-today">
      {holiday ? (
        <>
          <Palmtree className="size-3.5 text-amber-600" /> {holiday.name}
        </>
      ) : (
        <>
          <AvatarStack users={users} size="xs" max={4} />
          {away.length} away today
        </>
      )}
    </Link>
  );
}
