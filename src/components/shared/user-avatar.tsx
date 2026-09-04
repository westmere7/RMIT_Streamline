"use client";

import * as React from "react";
import type { User } from "@/domain";
import { userInitials } from "@/domain";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { avatarColorFor, colorClasses } from "@/lib/colors";
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
  /** Show a tooltip with the user's name on hover. Defaults to true. */
  tooltip?: boolean;
}

export function UserAvatar({ user, size = "md", className, tooltip = true }: UserAvatarProps) {
  const content = (
    <span
      role="img"
      aria-label={user?.displayName ?? "Unassigned"}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none ring-2 ring-background",
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
    </span>
  );
  if (!tooltip || !user) return content;
  return <SimpleTooltip label={user.displayName}>{content}</SimpleTooltip>;
}

export interface AvatarStackProps {
  users: Array<Pick<User, "id" | "firstName" | "lastName" | "displayName" | "avatarUrl">>;
  size?: AvatarSize;
  max?: number;
  className?: string;
}

/** Overlapping avatars for multi-assignee cells. */
export function AvatarStack({ users, size = "md", max = 3, className }: AvatarStackProps) {
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
