import { cn } from "@/lib/utils";

/**
 * "Live": what stakeholders get right now. A green dot breathing slowly beside
 * the word, small enough to sit on a label line. Still for anyone who has
 * asked their system for less motion.
 */
export function LiveBadge({ className, title = "Stakeholders get this form now" }: { className?: string; title?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/12 px-1.5 py-px text-2xs font-medium tracking-normal normal-case text-emerald-700 dark:text-emerald-300", className)}
      title={title}
      data-testid="live-badge"
    >
      <span aria-hidden className="live-dot size-1.5 rounded-full bg-emerald-500" />
      Live
    </span>
  );
}
