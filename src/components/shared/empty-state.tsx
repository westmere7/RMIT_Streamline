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
        compact ? "gap-1 px-4 py-6" : "gap-2 px-6 py-12",
        className,
      )}
    >
      {Icon && (
        <span className="mb-1 flex size-9 items-center justify-center rounded-full bg-surface-strong text-muted-foreground">
          <Icon className="size-4" />
        </span>
      )}
      <p className={cn("font-medium", compact ? "text-[13px]" : "text-sm")}>{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
