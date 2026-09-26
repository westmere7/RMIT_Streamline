"use client";

import { ListTodo, Search, SlidersHorizontal, X } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ColorDot } from "@/components/shared/label-pill";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SkeletonLine } from "@/components/ui/skeleton";
import type { User } from "@/domain";
import {
  EMPTY_MY_WORK_FILTERS,
  MY_WORK_DUE_BUCKETS,
  MY_WORK_KINDS,
  MY_WORK_KIND_LABELS,
  MY_WORK_SEARCH_KINDS,
  MY_WORK_SEARCH_KIND_LABELS,
  activeMyWorkFilterCount,
  filterMyWork,
  myWorkLabelNames,
  type MyWorkFilters,
} from "@/features/my-work/filters";
import { useMyWork } from "@/features/my-work/hooks";
import { MyWorkMobileSkeleton } from "@/features/my-work/my-work-skeleton";
import { MobileTaskList, MobileTaskRow } from "@/features/mobile/task-row";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { cn, groupBy } from "@/lib/utils";
import { MY_WORK_SECTION_LABELS, MY_WORK_SECTIONS, sectionFor, type MyWorkItem, type MyWorkSection } from "@/services/my-work-service";

/** On a phone the words are for names unless the reader says otherwise. */
const PHONE_START: MyWorkFilters = { ...EMPTY_MY_WORK_FILTERS, searchKind: "item" };

/**
 * My Work on a phone: the same six sections, the same grouping, in cards that
 * say what the desktop table's columns say, and the same ways to narrow it —
 * a search field, and every desktop filter in one sheet.
 *
 * The data, the grouping, the deduplication and the filtering are the
 * existing service's and the shared filter model's; only the presentation is
 * new.
 */
export function MyWorkMobile() {
  const ws = useWorkspace();
  const myWork = useMyWork(ws.workspace.id, ws.currentUser.id);
  const [showCompleted, setShowCompleted] = React.useState(false);
  const [filters, setFilters] = React.useState<MyWorkFilters>(PHONE_START);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const now = React.useMemo(() => new Date(), []);
  const patch = (p: Partial<MyWorkFilters>) => setFilters((prev) => ({ ...prev, ...p }));
  const clear = () => setFilters((prev) => ({ ...PHONE_START, searchKind: prev.searchKind }));

  const all = React.useMemo(() => myWork.data ?? [], [myWork.data]);
  const personName = React.useCallback((id: string) => ws.userById(id)?.displayName, [ws]);
  const shown = React.useMemo(() => filterMyWork(all, filters, { now, personName }), [all, filters, now, personName]);
  const grouped = React.useMemo(() => groupBy(shown, (entry) => sectionFor(entry, now)), [shown, now]);
  const openCount = all.filter((e) => !e.isDone).length;
  const completed = grouped.get("completed") ?? [];
  const filterCount = activeMyWorkFilterCount(filters);
  // The badge counts what the sheet sets; the field shows its own words.
  const sheetCount = activeMyWorkFilterCount({ ...filters, search: "" });

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
      <div className="px-4 pt-4 pb-8">
        <h1 className="text-lg font-semibold tracking-tight">My Work</h1>
        {/* The count waits for the list. Nobody has nought items assigned for
            the second and a half before the first read comes back. */}
        <p className="mb-3 text-[13px] text-muted-foreground">
          {myWork.data ? `${openCount} open ${openCount === 1 ? "item" : "items"} assigned to you.` : <SkeletonLine className="w-52 max-w-full" />}
        </p>

        {all.length > 0 && (
          <div className="mb-1 flex items-center gap-2" data-testid="my-work-filters">
            <label className="relative flex min-w-0 flex-1 items-center">
              <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
              <input
                type="search"
                enterKeyHint="search"
                value={filters.search}
                onChange={(e) => patch({ search: e.target.value })}
                placeholder={MY_WORK_SEARCH_KIND_LABELS[filters.searchKind ?? "item"].placeholder}
                aria-label="Search my work"
                className="h-11 w-full rounded-xl border border-border/70 bg-card pr-3 pl-9 text-[15px] outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring"
                data-testid="my-work-search"
              />
            </label>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className={cn("flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[15px] font-medium active:bg-accent/70", sheetCount ? "border-primary/50 text-foreground" : "border-border/70")}
              data-testid="my-work-open-filters"
            >
              <SlidersHorizontal aria-hidden className="size-4" />
              Filters
              {sheetCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular">{sheetCount}</span>}
            </button>
          </div>
        )}
        {filterCount > 0 && (
          <div className="flex items-center justify-between text-[13px] text-muted-foreground">
            <span className="tabular" data-testid="my-work-filter-count">
              {shown.length} of {all.length}
            </span>
            <button type="button" onClick={clear} className="-mr-2 flex h-10 items-center gap-1 rounded-lg px-2 font-medium text-foreground active:bg-accent/70" data-testid="my-work-clear-filters">
              <X aria-hidden className="size-4" /> Clear
            </button>
          </div>
        )}

        {myWork.isLoading && <MyWorkMobileSkeleton />}
        {myWork.isError && <ErrorState title="Could not load your work." error={myWork.error} onRetry={() => myWork.refetch()} />}
        {myWork.data && all.length === 0 && (
          <EmptyState icon={ListTodo} title="Nothing assigned to you" description="Items where you are set as an owner appear here, grouped by when they are due." />
        )}
        {myWork.data && all.length > 0 && shown.length === 0 && (
          <EmptyState
            icon={SlidersHorizontal}
            title="Nothing matches"
            description="Every item you are on is hidden by the filters."
            action={
              <Button variant="outline" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        )}

        {myWork.data &&
          MY_WORK_SECTIONS.filter((s) => s !== "completed").map((section) => {
            const entries = grouped.get(section) ?? [];
            if (entries.length === 0) return null;
            return <Section key={section} section={section} entries={entries} now={now} />;
          })}

        {completed.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              aria-expanded={showCompleted}
              className="mt-5 flex h-11 w-full items-center justify-between rounded-xl border border-border/70 px-3 text-[13px] font-medium active:bg-accent/70"
              data-testid="my-work-toggle-completed"
            >
              {showCompleted ? "Hide completed" : "Show completed"}
              <span className="rounded-full bg-surface-strong/80 px-2 py-0.5 text-xs tabular">{completed.length}</span>
            </button>
            {showCompleted && <Section section="completed" entries={completed} now={now} />}
          </>
        )}
      </div>

      <FilterSheet open={sheetOpen} onOpenChange={setSheetOpen} all={all} filters={filters} patch={patch} onClear={clear} shown={shown.length} />
    </div>
  );
}

function Section({ section, entries, now }: { section: MyWorkSection; entries: MyWorkItem[]; now: Date }) {
  return (
    <section className="mt-5" data-testid={`my-work-${section}`}>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-semibold tracking-tight">
        <span className={cn(section === "overdue" && "text-red-600 dark:text-red-400")}>{MY_WORK_SECTION_LABELS[section]}</span>
        <span className="rounded-full bg-surface-strong/80 px-2 py-0.5 text-xs font-medium text-muted-foreground tabular">{entries.length}</span>
      </h2>
      <MobileTaskList>
        {entries.map((entry) => (
          <MobileTaskRow key={entry.item.id} entry={entry} now={now} />
        ))}
      </MobileTaskList>
    </section>
  );
}

/** Every desktop filter, as rows of chips in one sheet. */
function FilterSheet({
  open,
  onOpenChange,
  all,
  filters,
  patch,
  onClear,
  shown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  all: MyWorkItem[];
  filters: MyWorkFilters;
  patch: (p: Partial<MyWorkFilters>) => void;
  onClear: () => void;
  shown: number;
}) {
  const ws = useWorkspace();
  // What there is to filter by, read off the list itself, as the desktop does.
  const boards = React.useMemo(() => {
    const seen = new Map(all.flatMap((e) => [e.board, ...e.linkedBoards]).map((b) => [b.id, b]));
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [all]);
  const statuses = React.useMemo(() => myWorkLabelNames(all, "status"), [all]);
  const priorities = React.useMemo(() => myWorkLabelNames(all, "priority"), [all]);
  const people = React.useMemo(() => {
    const ids = new Set(all.flatMap((e) => e.people));
    ids.delete(ws.currentUser.id);
    return [...ids].map((id) => ws.userById(id)).filter((u): u is User => !!u).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [all, ws]);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Filter my work"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="h-11 flex-1" onClick={onClear} data-testid="my-work-sheet-clear">
              Clear all
            </Button>
            <Button className="h-11 flex-1" onClick={() => onOpenChange(false)} data-testid="my-work-sheet-done">
              Show {shown}
            </Button>
          </div>
        }
      >
        <div className="space-y-5 pb-2">
          <ChipGroup title="Search in">
            {MY_WORK_SEARCH_KINDS.map((kind) => (
              <Chip key={kind} on={filters.searchKind === kind} onClick={() => patch({ searchKind: kind })} testId={`my-work-search-kind-${kind}`}>
                {MY_WORK_SEARCH_KIND_LABELS[kind].label}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup title="Due">
            {MY_WORK_DUE_BUCKETS.map((b) => (
              <Chip key={b.id} on={filters.due === b.id} onClick={() => patch({ due: filters.due === b.id ? null : b.id })} testId={`my-work-due-${b.id}`}>
                {b.label}
              </Chip>
            ))}
          </ChipGroup>
          {statuses.length > 0 && (
            <ChipGroup title="Status">
              {statuses.map((s) => (
                <Chip key={s} on={filters.statuses.includes(s)} onClick={() => patch({ statuses: toggle(filters.statuses, s) })}>
                  {s}
                </Chip>
              ))}
            </ChipGroup>
          )}
          {priorities.length > 0 && (
            <ChipGroup title="Priority">
              {priorities.map((p) => (
                <Chip key={p} on={filters.priorities.includes(p)} onClick={() => patch({ priorities: toggle(filters.priorities, p) })}>
                  {p}
                </Chip>
              ))}
            </ChipGroup>
          )}
          {boards.length > 0 && (
            <ChipGroup title="Board">
              {boards.map((b) => (
                <Chip key={b.id} on={filters.boardIds.includes(b.id)} onClick={() => patch({ boardIds: toggle(filters.boardIds, b.id) })}>
                  <ColorDot color={b.color} />
                  {b.name}
                </Chip>
              ))}
            </ChipGroup>
          )}
          {people.length > 0 && (
            <ChipGroup title="Shared with">
              {people.map((u) => (
                <Chip key={u.id} on={filters.personIds.includes(u.id)} onClick={() => patch({ personIds: toggle(filters.personIds, u.id) })}>
                  {u.displayName}
                </Chip>
              ))}
            </ChipGroup>
          )}
          <ChipGroup title="Type">
            {MY_WORK_KINDS.filter((k) => k !== "all").map((k) => (
              <Chip key={k} on={filters.kind === k} onClick={() => patch({ kind: filters.kind === k ? "all" : k })}>
                {MY_WORK_KIND_LABELS[k]}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ChipGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Chip({ on, onClick, children, testId }: { on: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex min-h-10 max-w-full items-center gap-1.5 rounded-full border px-3.5 text-[14px] active:bg-accent/70",
        on ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border/70 text-muted-foreground",
      )}
      data-testid={testId}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">{children}</span>
    </button>
  );
}
