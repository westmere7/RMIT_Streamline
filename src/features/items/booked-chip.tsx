"use client";

import { format } from "date-fns";
import { ClipboardPen } from "lucide-react";
import * as React from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveColumnRoles, type BoardColumn, type ColumnValue, type Item } from "@/domain";
import { useItemActivity } from "@/features/activity/hooks";
import { useBoardContext } from "@/features/boards/board-context";
import { useWorkspace } from "@/features/workspace/workspace-context";

const WHEN = "d MMM yyyy, h:mm a";

/**
 * "Booked", beside the ticket, on a task that came in through the booking form
 * or a portal. Hovering it (tapping, on a phone) says when, who asked, for
 * which department and when it reached a team. The requester and department
 * are read from the booking's entry in the task's log, and only once the card
 * is opened.
 */
export function BookedChip({ item }: { item: Item }) {
  const [open, setOpen] = React.useState(false);
  if (!item.bookedVia) return null;
  // The portal's form and the old keyed link are one booking form now, whichever one this came through.
  const via = "the booking form";
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Booked through ${via}`}
          className="inline-flex h-5 items-center gap-1 rounded-full bg-surface-strong/50 pr-2 pl-1.5 text-2xs font-medium text-foreground/80 transition-colors hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-ring"
          data-testid="panel-booked-chip"
        >
          <ClipboardPen className="size-3" aria-hidden /> Via booking form
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 p-3" data-testid="panel-booked-card">
        {open && <BookedDetails item={item} via={via} />}
      </HoverCardContent>
    </HoverCard>
  );
}

function BookedDetails({ item, via }: { item: Item; via: string }) {
  const ws = useWorkspace();
  const { model } = useBoardContext();
  const activity = useItemActivity(item.id);
  const entry = activity.data?.filter((a) => a.eventType === "ITEM_CREATED").sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const meta = (entry?.metadata ?? {}) as { requesterName?: string; department?: string };

  // The board's own columns fill in what the log does not have (tasks booked
  // before it was written there): the requester, an email column, the department.
  const roles = resolveColumnRoles(model.columns);
  const valueOf = (column: BoardColumn | null | undefined) => (column ? model.getValue(item.id, column.id) : undefined);
  const requesterValue = valueOf(roles.requester);
  const requester = requesterValue?.type === "REQUESTER" && requesterValue.userIds[0] ? ws.userById(requesterValue.userIds[0]) : null;
  const emailValue = valueOf(model.columns.find((c) => c.type === "TEXT" && /e-?mail/i.test(c.name)));
  const departmentValue = valueOf(roles.department);
  const name = meta.requesterName || requester?.displayName || textOf(requesterValue) || null;
  const email = requester?.email || textOf(emailValue) || null;
  const department = meta.department || (departmentValue?.type === "STAKEHOLDER" ? departmentValue.group : textOf(departmentValue)) || null;

  const rows: { label: string; value: React.ReactNode; testId: string }[] = [
    { label: "Booked", value: format(new Date(item.createdAt), WHEN), testId: "booked-at" },
    ...(activity.isPending
      ? [{ label: "By", value: <Skeleton className="h-3.5 w-24" />, testId: "booked-by-pending" }]
      : [
          ...(name || email
            ? [
                {
                  label: "By",
                  value: (
                    <span className="block min-w-0">
                      {name && <span className="block truncate">{name}</span>}
                      {email && <span className={name ? "block break-all text-muted-foreground" : "block break-all"}>{email}</span>}
                    </span>
                  ),
                  testId: "booked-by",
                },
              ]
            : []),
          ...(department ? [{ label: "For", value: department, testId: "booked-for" }] : []),
        ]),
    { label: "Reached a team", value: item.allocatedAt ? format(new Date(item.allocatedAt), WHEN) : "Not yet", testId: "booked-allocated" },
  ];

  return (
    <div className="text-[13px]">
      <p className="mb-2 flex items-center gap-1.5 font-semibold">
        <ClipboardPen className="size-3.5 text-muted-foreground" aria-hidden /> Booked through {via}
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        {rows.map((row) => (
          <React.Fragment key={row.testId}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0" data-testid={row.testId}>
              {row.value}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

/** A text column's words, or nothing. */
function textOf(value: ColumnValue | undefined): string | null {
  return value?.type === "TEXT" && value.text.trim() ? value.text.trim() : null;
}
