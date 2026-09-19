"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { MobileTaskList } from "@/features/mobile/task-row";

/** How many rows each placeholder section stands up, longest first. */
const SECTIONS = [5, 3];

/**
 * My Work while the list is being read.
 *
 * Sections with a card of rows, on the table's own grid, so the columns that
 * arrive land where the blocks were. Two sections rather than the six there
 * are: which of overdue, today and later this person has is exactly what is
 * not known yet, and a placeholder for an empty section is a heading that
 * disappears.
 */
export function MyWorkSkeleton() {
  return (
    <div aria-busy aria-label="Loading your work" data-testid="my-work-skeleton">
      {SECTIONS.map((rows, section) => (
        <section key={section} className="mt-5 first:mt-2">
          <div className="mb-2 flex items-center gap-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-4 w-7 rounded-full" />
          </div>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
            {/* The column-heading strip, kept as a band: the words in it are
                fixed, so a block pretending to be them would be the only thing
                on the page that could have said something true. */}
            <div className="hidden h-9 border-b border-border/70 bg-surface/70 md:block" />
            <ul className="divide-y divide-border/60">
              {Array.from({ length: rows }).map((_, i) => (
                <li
                  key={i}
                  className="grid min-h-10 grid-cols-[minmax(0,1fr)_90px] items-center gap-3 px-3 py-1.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px_130px_110px_90px]"
                >
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="hidden h-3.5 w-2/3 md:block" />
                  <Skeleton className="hidden size-6 rounded-full md:block" />
                  <Skeleton className="hidden h-5 w-20 rounded-full md:block" />
                  <Skeleton className="hidden h-5 w-14 rounded-full md:block" />
                  <Skeleton className="ml-auto h-3.5 w-12" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * The same wait on a phone, in the cards that screen uses.
 *
 * @param sections How many headed groups to stand up. Home shows one, because
 * it only ever lists the next few tasks under a heading of its own.
 */
export function MyWorkMobileSkeleton({ sections = SECTIONS.length, rows }: { sections?: number; rows?: number } = {}) {
  const shape = SECTIONS.slice(0, sections).map((count) => rows ?? count);
  return (
    <div aria-busy aria-label="Loading your work" data-testid="my-work-mobile-skeleton">
      {shape.map((rows, section) => (
        <section key={section} className="mt-5 first:mt-0">
          {/* One section is Home asking for the next few tasks under a heading
              it has already drawn; more than one is the page itself, which has
              to stand up its own. */}
          {shape.length > 1 && (
            <div className="mb-2 flex items-center gap-2 px-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-4 w-7 rounded-full" />
            </div>
          )}
          <MobileTaskList>
            {Array.from({ length: rows }).map((_, i) => (
              <li key={i} className="flex min-h-16 flex-col justify-center gap-1.5 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="ml-auto h-3.5 w-12" />
                </div>
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-3.5 w-1/2" />
              </li>
            ))}
          </MobileTaskList>
        </section>
      ))}
    </div>
  );
}
