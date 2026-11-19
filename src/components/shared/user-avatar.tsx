"use client";

import * as React from "react";
import type { User } from "@/domain";
import { userInitials } from "@/domain";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { avatarColorFor, colorClasses } from "@/lib/colors";
import { useIsOnline } from "@/lib/realtime/presence";
import { cn } from "@/lib/utils";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-7 text-[11px]",
  lg: "size-9 text-xs",
  xl: "size-12 text-sm",
};

export interface UserAvatarProps {
  user: Pick<User, "id" | "firstName" | "lastName" | "displayName" | "avatarUrl"> | null | undefined;
  size?: AvatarSize;
  className?: string;
  /** Show the person's card (or their name) on hover. Defaults to true. */
  tooltip?: boolean;
}

/**
 * How a person's card is drawn on hover. The workspace supplies it (it knows
 * their teams, their status and where their profile is); anywhere else, such as
 * a shared board, a name in a tooltip is all there is.
 */
type PersonCardRenderer = (userId: string, trigger: React.ReactElement) => React.ReactElement;
const PersonCardContext = React.createContext<PersonCardRenderer | null>(null);
export const PersonCardProvider = PersonCardContext.Provider;

/** A person's compact card on hover where there is one, their name in a tooltip otherwise. */
export function PersonHover({ user, children }: { user: Pick<User, "id" | "displayName">; children: React.ReactElement }) {
  const render = React.useContext(PersonCardContext);
  return render ? render(user.id, children) : <SimpleTooltip label={user.displayName}>{children}</SimpleTooltip>;
}

/** The gap around the online dot: thinner on the smallest avatars, where 2px would swallow it. */
const DOT_RING: Record<AvatarSize, string> = {
  xs: "ring-1",
  sm: "ring-[1.5px]",
  md: "ring-2",
  lg: "ring-2",
  xl: "ring-2",
};

/**
 * The online dot sits on the circle's edge at the bottom right, half inside it,
 * rather than in the corner of the square around it, which is off the picture
 * altogether on a large avatar. 14.6% is where a circle crosses its box's
 * diagonal (1 − 1/√2, halved). Its size follows the avatar's, within limits,
 * so the large ones a page sizes itself (the profile) get a dot that fits.
 */
const DOT_STYLE: React.CSSProperties = {
  right: "14.6%",
  bottom: "14.6%",
  width: "clamp(6px, 24%, 16px)",
  height: "clamp(6px, 24%, 16px)",
  transform: "translate(50%, 50%)",
};

export function UserAvatar({ user, size = "md", className, tooltip = true }: UserAvatarProps) {
  // Only inside the workspace: elsewhere (shared pages, sign-in) nobody is joined, so nobody is online.
  // The name stays the accessible name (buttons and pickers are found by it); data-online marks the state.
  const online = useIsOnline(user?.id);
  const content = (
    <span
      role="img"
      aria-label={user?.displayName ?? "Unassigned"}
      data-online={online || undefined}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none ring-2 ring-background",
        SIZE_CLASSES[size],
        user ? colorClasses(avatarColorFor(user.id)).solid : "border border-dashed border-input bg-transparent text-muted-foreground",
        className,
      )}
    >
      {user ? (
        user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatars are external/optional data URLs
          <img src={user.avatarUrl} alt="" className="size-full rounded-full object-cover" />
        ) : (
          userInitials(user)
        )
      ) : (
        "?"
      )}
      {online && <span aria-hidden className={cn("absolute rounded-full bg-emerald-500 ring-background", DOT_RING[size])} style={DOT_STYLE} data-testid="avatar-online" />}
    </span>
  );
  if (!tooltip || !user) return content;
  return <PersonHover user={user}>{content}</PersonHover>;
}

export interface AvatarStackProps {
  users: Array<Pick<User, "id" | "firstName" | "lastName" | "displayName" | "avatarUrl">>;
  size?: AvatarSize;
  max?: number;
  className?: string;
}

/** Each user once, first appearance kept: one person can sit in two people columns. */
export function uniqueUsers<U extends { id: string }>(users: U[]): U[] {
  const seen = new Set<string>();
  return users.filter((u) => !seen.has(u.id) && !!seen.add(u.id));
}

/** Overlapping avatars for multi-assignee cells. */
export function AvatarStack({ users: given, size = "md", max = 3, className }: AvatarStackProps) {
  const users = uniqueUsers(given);
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;
  return (
    <span className={cn("inline-flex items-center -space-x-1.5", className)}>
      {visible.map((u) => (
        <UserAvatar key={u.id} user={u} size={size} />
      ))}
      {overflow > 0 && (
        <SimpleTooltip label={users.slice(max).map((u) => u.displayName).join(", ")}>
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-surface-strong font-medium text-muted-foreground ring-2 ring-background",
              SIZE_CLASSES[size],
            )}
          >
            +{overflow}
          </span>
        </SimpleTooltip>
      )}
    </span>
  );
}
