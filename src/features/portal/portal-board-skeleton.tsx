import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The portal's board while it loads: its shape rather than two grey slabs.
 * The toolbar (view, search, the tools on the right), then two groups, each
 * with its heading, the column headings and rows whose cells sit where the
 * real ones will: ticket, name, requested, department, a status pill,
 * priority, the people, the due date. Narrow screens keep the first few.
 */
const COLUMNS = [
  { key: "ticket", width: "w-16", cell: "h-3 w-12" },
  { key: "item", width: "min-w-0 flex-1", cell: "" },
  { key: "requested", width: "w-24", cell: "h-3 w-12", hide: "max-sm:hidden" },
  { key: "department", width: "w-28", cell: "h-5 w-20 rounded-md", hide: "max-md:hidden" },
  { key: "status", width: "w-32", cell: "h-6 w-28 rounded-md" },
  { key: "priority", width: "w-24", cell: "h-3 w-14", hide: "max-lg:hidden" },
  { key: "people", width: "w-20", cell: "size-6 rounded-full", hide: "max-lg:hidden" },
  { key: "due", width: "w-20", cell: "h-3 w-12", hide: "max-xl:hidden" },
] as const;

/** Name widths that vary the way task names do. */
const NAME_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/12", "w-7/12", "w-3/5", "w-2/5", "w-1/2"];

export function PortalBoardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)} aria-busy aria-label="Loading the board" data-testid="portal-board-skeleton">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-4 py-2.5 sm:px-6">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-48 rounded-full max-sm:flex-1" />
        <div className="ml-auto hidden items-center gap-3 md:flex">
          {["w-16", "w-14", "w-14", "w-12", "w-14", "w-24"].map((width, index) => (
            <Skeleton key={index} className={cn("h-6", width)} />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-7 overflow-hidden px-4 pt-5 sm:px-6">
        {[7, 4].map((rows, group) => (
          <section key={group}>
            <div className="mb-2.5 flex items-center gap-2.5">
              <Skeleton className="size-4 rounded" />
              <Skeleton className={cn("h-5", group === 0 ? "w-44" : "w-32")} />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
            <div className="overflow-hidden rounded-xl border border-border/60">
              {/* Column headings. */}
              <div className="flex h-10 items-center gap-4 border-b border-border/60 bg-surface/50 px-3">
                <span aria-hidden className="h-6 w-1 shrink-0 rounded-full bg-surface-strong/70" />
                {COLUMNS.map((column) => (
                  <div key={column.key} className={cn("flex shrink-0 items-center", column.width, "hide" in column && column.hide)}>
                    <Skeleton className={cn("h-2.5", column.key === "item" ? "w-12" : "w-14")} />
                  </div>
                ))}
              </div>
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex h-11 items-center gap-4 border-b border-border/40 px-3 last:border-b-0">
                  <span aria-hidden className="h-7 w-1 shrink-0 rounded-full bg-surface-strong/70" />
                  {COLUMNS.map((column) => (
                    <div key={column.key} className={cn("flex shrink-0 items-center", column.width, "hide" in column && column.hide, column.key === "status" && "justify-center")}>
                      <Skeleton className={column.key === "item" ? cn("h-3.5", NAME_WIDTHS[(row + group * 3) % NAME_WIDTHS.length]) : column.cell} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
