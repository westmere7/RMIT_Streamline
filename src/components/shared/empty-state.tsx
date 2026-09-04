import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-1.5 px-4 py-7" : "gap-2 px-6 py-14",
        className,
      )}
    >
      {Icon && (
        <span className="mb-1.5 flex size-11 items-center justify-center rounded-2xl bg-surface text-muted-foreground">
          <Icon className="size-5" />
        </span>
      )}
      <p className={cn("font-semibold tracking-tight", compact ? "text-[13px]" : "text-[15px]")}>{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
