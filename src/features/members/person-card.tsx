"use client";

import { Building2, Clock, Mail, MessageSquare, Users, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { User } from "@/domain";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";

/** "4:12 pm", in their timezone; null when it cannot be read. */
function localTime(timezone: string, now: Date): string | null {
  try {
    return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(now);
  } catch {
    return null;
  }
}

/** Popups a card must not sit on: pickers, menus, selects and lists. Tooltips and other cards are not among them. */
const POPUP_AROUND = "[data-radix-popper-content-wrapper], [role=menu], [role=listbox], [cmdk-root]";
const POPUP_OPEN = "[data-radix-popper-content-wrapper] > [data-state=open]:not([data-hover-card]), [role=menu][data-state=open], [role=listbox][data-state=open]";

/** A picker or menu is open, or the face is inside one: a card now would overlap it. */
function popupInTheWay(trigger: Element | null): boolean {
  if (typeof document === "undefined") return false;
  return !!trigger?.closest(POPUP_AROUND) || !!document.querySelector(POPUP_OPEN);
}

/**
 * Someone's compact card, shown while hovering their face or name. Opens after a
 * short pause so passing over a column of avatars does not flash cards, closes
 * on a press so it never sits over the picker that press opens, and stays shut
 * while a picker or menu is open or when the face is inside one.
 */
export function PersonCard({ userId, children }: { userId: string; children: React.ReactElement }) {
  const ws = useWorkspace();
  const [open, setOpen] = React.useState(false);
  // The trigger is whatever element it wraps; typed as an anchor only because Radix types it so.
  const triggerRef = React.useRef<HTMLAnchorElement>(null);
  const user = ws.userById(userId);
  if (!user) return children;
  return (
    <HoverCard open={open} onOpenChange={(next) => setOpen(next && !popupInTheWay(triggerRef.current))} openDelay={350} closeDelay={100}>
      <HoverCardTrigger asChild ref={triggerRef} onPointerDown={() => setOpen(false)}>
        {children}
      </HoverCardTrigger>
      {/* The card is portalled, but React still bubbles its clicks to the trigger's
          parents: a cell would open its picker from a click on "View profile". */}
      <HoverCardContent className="w-72 p-0" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        {open && <PersonCardBody user={user} onClose={() => setOpen(false)} />}
      </HoverCardContent>
    </HoverCard>
  );
}

function PersonCardBody({ user, onClose }: { user: User; onClose: () => void }) {
  const ws = useWorkspace();
  const isSelf = ws.currentUser.id === user.id;
  const member = ws.members.find((m) => m.userId === user.id);
  const status = user.deactivatedAt || member?.status === "DEACTIVATED" ? "Deactivated" : member?.status === "INVITED" ? "Pending onboarding" : null;
  const teams = ws.teamMembers
    .filter((tm) => tm.userId === user.id)
    .map((tm) => ws.teamById(tm.teamId))
    .filter((team): team is NonNullable<typeof team> => !!team && team.archivedAt === null);
  // Someone who has not onboarded has not told us their timezone: it is only the default.
  const time = member?.status === "INVITED" ? null : localTime(user.timezone, new Date());

  return (
    <div data-testid="person-card">
      <div className="relative flex items-center gap-3 p-3 pr-9">
        <UserAvatar user={user} size="xl" tooltip={false} />
        <div className="min-w-0 flex-1">
          <Link href={routes.person(ws.slug, user.id)} onClick={onClose} className="block truncate text-sm font-semibold hover:underline" data-testid="person-card-name">
            {user.displayName}
          </Link>
          {user.jobTitle && <p className="truncate text-xs text-muted-foreground">{user.jobTitle}</p>}
          {status && (
            <Badge variant={status === "Deactivated" ? "outline" : "warning"} className="mt-1" data-testid="person-card-status">
              {status}
            </Badge>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" data-testid="person-card-close">
          <X className="size-3.5" />
        </button>
      </div>
      <dl className="space-y-1.5 border-t border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
        <Row icon={Mail} label="Email">
          <a href={`mailto:${user.email}`} className="truncate hover:text-foreground hover:underline">
            {user.email}
          </a>
        </Row>
        {user.stakeholderGroup && <Row icon={Building2} label="Department">{user.stakeholderGroup}</Row>}
        {teams.length > 0 && (
          <Row icon={Users} label="Teams">
            {teams.map((t, i) => (
              <React.Fragment key={t.id}>
                {i > 0 && ", "}
                <Link href={routes.team(ws.slug, t.id)} onClick={onClose} className="hover:text-foreground hover:underline" data-testid="person-card-team">
                  {t.name}
                </Link>
              </React.Fragment>
            ))}
          </Row>
        )}
        {time && (
          <Row icon={Clock} label="Local time">
            {time} local time
          </Row>
        )}
      </dl>
      <div className="flex items-center gap-1 border-t border-border/60 p-1.5">
        <Link href={routes.person(ws.slug, user.id)} onClick={onClose} className="flex-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors hover:bg-accent/70" data-testid="person-card-profile">
          View profile
        </Link>
        {!isSelf && (
          <Link href={routes.messages(ws.slug, user.id)} onClick={onClose} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent/70" data-testid="person-card-message">
            <MessageSquare className="size-3.5" aria-hidden /> Message
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="shrink-0">
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

/** Supplies every avatar and name in the workspace with the card above. */
export const renderPersonCard = (userId: string, trigger: React.ReactElement) => <PersonCard userId={userId}>{trigger}</PersonCard>;
