"use client";

import { TriangleAlert } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = "Something went wrong.", error, onRetry, className }: ErrorStateProps) {
  React.useEffect(() => {
    if (error) console.error("[ui] error state:", error);
  }, [error]);
  const message = error instanceof Error ? error.message : undefined;
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <span className="flex size-9 items-center justify-center rounded-full bg-red-50 text-red-600">
        <TriangleAlert className="size-4" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {message && <p className="max-w-md text-[13px] text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
