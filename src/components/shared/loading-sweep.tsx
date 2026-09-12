import { cn } from "@/lib/utils";

/**
 * A hairline of the workspace's red, sweeping while something is on its way.
 *
 * It sits across the top of whatever is loading rather than in place of it, so
 * the page keeps its shape and the wait reads as "this is coming" instead of
 * "this is gone". The stakeholder portal has used it between boards for a
 * while; the board does the same now, so waiting looks the same wherever it
 * happens.
 */
export function LoadingSweep({ label = "Loading", className, testId = "loading-sweep" }: { label?: string; className?: string; testId?: string }) {
  return (
    <div className={cn("relative h-0.5 shrink-0 overflow-hidden bg-primary/10", className)} role="status" aria-label={label} data-testid={testId}>
      <span aria-hidden className="auth-sweep absolute inset-y-0 w-1/2" />
    </div>
  );
}
