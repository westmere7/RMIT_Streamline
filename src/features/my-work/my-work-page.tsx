"use client";

import { CalendarDays, Check, ChevronDown, Filter, Layers, Link2, ListTodo, Search, SquareKanban, Star, UserRound, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ColorDot, LabelPill } from "@/components/shared/label-pill";
import { PriorityPill } from "@/components/shared/priority-signal";
import { PageHeader } from "@/components/shared/page-header";
import { AvatarStack } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkeletonLine } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { User } from "@/domain";
import { isStuckLabel } from "@/domain";
import { EMPTY_MY_WORK_FILTERS, MY_WORK_DUE_BUCKETS, MY_WORK_KINDS, MY_WORK_KIND_LABELS, MY_WORK_SEARCH_KINDS, MY_WORK_SEARCH_KIND_LABELS, activeMyWorkFilterCount, filterMyWork, myWorkLabelNames, type MyWorkFilters, type MyWorkSearchKind } from "@/features/my-work/filters";
import { useMyAssets, useMyStarred, useMyWork, useStar } from "@/features/my-work/hooks";
import { StarTaskButton } from "@/features/my-work/star-task-button";
import { MY_WORK_TABS, MyAssetsView, MyWorkTabs, openAssetCount, type MyWorkTab } from "@/features/my-work/my-assets-view";
import { useSearchParams } from "next/navigation";
import { MyWorkSkeleton } from "@/features/my-work/my-work-skeleton";
import { MyWorkMobile } from "@/features/mobile/my-work-mobile";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { colorClasses } from "@/lib/colors";
import { formatShortDate } from "@/lib/dates/dates";
import { cn, groupBy } from "@/lib/utils";
import { MY_WORK_SECTION_LABELS, MY_WORK_SECTIONS, sectionFor, type MyWorkItem, type MyWorkSection } from "@/services/my-work-service";

/** The same work, in the shape the screen calls for. */
export function MyWorkPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MyWorkMobile /> : <MyWorkDesktop />;
}

function MyWorkDesktop() {
  const ws = useWorkspace();
  const myWork = useMyWork(ws.workspace.id, ws.currentUser.id);
  const params = useSearchParams();
  const [tab, setTab] = React.useState<MyWorkTab>(() => (MY_WORK_TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as MyWorkTab) : "tasks");
  const myAssets = useMyAssets(ws.workspace.id, ws.currentUser.id, tab === "assets");
  const assetCount = openAssetCount(myAssets.data);
  const myStarred = useMyStarred(ws.workspace.id, ws.currentUser.id, tab === "starred");
  const starredCount = myStarred.data ? myStarred.data.filter((e) => !e.isDone).length : null;
  const [showCompleted, setShowCompleted] = React.useState(false);
  const [filters, setFilters] = React.useState<MyWorkFilters>(EMPTY_MY_WORK_FILTERS);
  const now = React.useMemo(() => new Date(), []);
  const patch = (p: Partial<MyWorkFilters>) => setFilters((prev) => ({ ...prev, ...p }));

  const all = React.useMemo(() => myWork.data ?? [], [myWork.data]);
  const personName = React.useCallback((id: string) => ws.userById(id)?.displayName, [ws]);
  const shown = React.useMemo(() => filterMyWork(all, filters, { now, personName }), [all, filters, now, personName]);
  const grouped = React.useMemo(() => groupBy(shown, (entry) => sectionFor(entry, now)), [shown, now]);
  const openCount = all.filter((e) => !e.isDone).length;
  const filterCount = activeMyWorkFilterCount(filters);

  // What there is to filter by, read off the list itself: the boards the work
  // is on, the words its statuses and priorities use, and the people sharing it.
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

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader
          title="My Work"
          // Counted, or a blank line waiting to be one. "0 open items"
          // while the list is still being read is a figure, and it is wrong.
          description={
            tab === "starred" ? (
              starredCount !== null ? `${starredCount} starred ${starredCount === 1 ? "task" : "tasks"} still open.` : <SkeletonLine className="w-72 max-w-full" />
            ) : tab === "assets" ? (
              assetCount !== null ? `${assetCount} open ${assetCount === 1 ? "asset" : "assets"} on you across ${ws.workspace.name}.` : <SkeletonLine className="w-72 max-w-full" />
            ) : myWork.data ? (
              `${openCount} open ${openCount === 1 ? "item" : "items"} assigned to you across ${ws.workspace.name}.`
            ) : (
              <SkeletonLine className="w-72 max-w-full" />
            )
          }
          actions={
            // Starred folds its done tasks away itself.
            tab !== "starred" && (
            <div className="flex items-center gap-2">
              <Switch id="show-completed" aria-label="Show completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
              <Label htmlFor="show-completed" className="text-[13px] font-normal">
                Show completed
              </Label>
            </div>
            )
          }
        />
        {/* The bar: what to search and the words, then one button per thing to
            narrow by. Like a board's toolbar, so nobody learns a second one. */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 sm:px-6" data-testid="my-work-filters">
          <MyWorkTabs tab={tab} onTab={setTab} tasks={myWork.data ? openCount : null} assets={assetCount} starred={starredCount} className="mr-1" />
          {tab === "tasks" && (
          <>
          <SearchBox kind={filters.searchKind} value={filters.search} onKind={(searchKind) => patch({ searchKind })} onValue={(search) => patch({ search })} />
          <span aria-hidden className="mx-1 h-5 w-px bg-border/70" />
          <ChecklistFilter
            icon={UserRound}
            label="PIC"
            title="Anyone else on the item"
            empty="Nothing you are on is shared with anybody else."
            options={people.map((u) => ({ id: u.id, label: u.displayName }))}
            selected={filters.personIds}
            onChange={(personIds) => patch({ personIds })}
            testId="my-work-filter-person"
          />
          <ChecklistFilter
            icon={SquareKanban}
            label="Board"
            title="Which boards"
            empty="Nothing here yet."
            options={boards.map((b) => ({ id: b.id, label: b.name, color: b.color }))}
            selected={filters.boardIds}
            onChange={(boardIds) => patch({ boardIds })}
            testId="my-work-filter-board"
          />
          <ChecklistFilter icon={Filter} label="Status" title="Status" empty="Nothing here has a status." options={statuses.map((s) => ({ id: s, label: s }))} selected={filters.statuses} onChange={(statuses) => patch({ statuses })} testId="my-work-filter-status" />
          <ChecklistFilter icon={Filter} label="Priority" title="Priority" empty="Nothing here has a priority." options={priorities.map((p) => ({ id: p, label: p }))} selected={filters.priorities} onChange={(priorities) => patch({ priorities })} testId="my-work-filter-priority" />
          <ChoiceFilter icon={CalendarDays} label="Due" title="Due" options={MY_WORK_DUE_BUCKETS.map((b) => ({ id: b.id, label: b.label }))} value={filters.due} onChange={(due) => patch({ due })} testId="my-work-filter-due" />
          <ChoiceFilter
            icon={Layers}
            label="Type"
            title="Items or subitems"
            options={MY_WORK_KINDS.filter((k) => k !== "all").map((k) => ({ id: k, label: MY_WORK_KIND_LABELS[k] }))}
            value={filters.kind === "all" ? null : filters.kind}
            onChange={(kind) => patch({ kind: kind ?? "all" })}
            testId="my-work-filter-kind"
          />
          {filterCount > 0 && (
            <>
              <span className="ml-1 text-2xs text-muted-foreground tabular" data-testid="my-work-filter-count">
                {shown.length} of {all.length}
              </span>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setFilters(EMPTY_MY_WORK_FILTERS)} data-testid="my-work-clear-filters">
                <X /> Clear
              </Button>
            </>
          )}
          </>
          )}
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          {tab === "starred" ? <StarredView query={myStarred} now={now} /> : tab === "assets" ? <MyAssetsView query={myAssets} showCompleted={showCompleted} /> : <>
          {myWork.isLoading && <MyWorkSkeleton />}
          {myWork.isError && <ErrorState title="Could not load your work." error={myWork.error} onRetry={() => myWork.refetch()} />}
          {myWork.data && all.length === 0 && <EmptyState icon={ListTodo} title="Nothing assigned to you" description="Items where you are set as an owner will appear here, grouped by due date." />}
          {myWork.data && all.length > 0 && shown.length === 0 && (
            <EmptyState
              icon={Filter}
              title="Nothing matches"
              description="Every item you are on is hidden by the filters."
              action={
                <Button variant="outline" onClick={() => setFilters(EMPTY_MY_WORK_FILTERS)}>
                  Clear filters
                </Button>
              }
            />
          )}
          {myWork.data &&
            MY_WORK_SECTIONS.filter((s) => s !== "completed" || showCompleted).map((section) => {
              const entries = grouped.get(section) ?? [];
              if (entries.length === 0) return null;
              return <WorkSection key={section} section={section} entries={entries} now={now} />;
            })}
          </>}
        </div>
      </div>
    </div>
  );
}

/**
 * What to search, then the words.
 *
 * The kind comes first because a name typed into a box that searched items,
 * people and boards at once found things for the wrong reason — "Linh" is a
 * person, a board group and part of a task name. Until a kind is picked the
 * box says so and takes nothing.
 */
function SearchBox({ kind, value, onKind, onValue }: { kind: MyWorkSearchKind | null; value: string; onKind: (kind: MyWorkSearchKind) => void; onValue: (value: string) => void }) {
  return (
    <div className="flex items-center overflow-hidden rounded-full border border-border/70 bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20" data-testid="my-work-search">
      <Select value={kind ?? ""} onValueChange={(v) => onKind(v as MyWorkSearchKind)}>
        <SelectTrigger className="h-8 w-auto gap-1 rounded-none border-0 border-r border-border/70 bg-surface/60 px-3 text-2xs font-medium shadow-none focus-visible:ring-0" aria-label="What to search" data-testid="my-work-search-kind">
          <Search className="size-3.5 text-muted-foreground" aria-hidden />
          <SelectValue placeholder="Search…" />
        </SelectTrigger>
        <SelectContent>
          {MY_WORK_SEARCH_KINDS.map((option) => (
            <SelectItem key={option} value={option} data-testid={`my-work-search-kind-${option}`}>
              {MY_WORK_SEARCH_KIND_LABELS[option].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={value}
        onChange={(e) => onValue(e.target.value)}
        disabled={!kind}
        placeholder={kind ? MY_WORK_SEARCH_KIND_LABELS[kind].placeholder : "Pick what to search first"}
        aria-label={kind ? MY_WORK_SEARCH_KIND_LABELS[kind].placeholder : "Search"}
        className="h-8 w-56 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 disabled:cursor-not-allowed"
        data-testid="my-work-search-input"
      />
      {value && (
        <button type="button" onClick={() => onValue("")} aria-label="Clear search" className="mr-1.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * A round toolbar button that says what it filters and how many ways.
 *
 * It sits under a popover trigger with `asChild`, so the trigger's own props
 * and ref have to reach the button: without them the click opened nothing.
 */
const FilterButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button> & { icon: React.ComponentType<{ className?: string }>; label: string; count: number; testId?: string }>(function FilterButton(
  { icon: Icon, label, count, testId, className, ...props },
  ref,
) {
  return (
    <Button ref={ref} variant="ghost" size="sm" className={cn("rounded-full", count > 0 && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground", className)} data-testid={testId} {...props}>
      <Icon className="size-4" /> {label}
      {count > 0 && <span className="rounded-full bg-ring px-1.5 text-2xs font-semibold text-white tabular">{count}</span>}
      <ChevronDown className="size-3.5 opacity-60" />
    </Button>
  );
});

/** Several of a list may be on at once: boards, statuses, people. */
function ChecklistFilter({
  icon,
  label,
  title,
  empty,
  options,
  selected,
  onChange,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  empty: string;
  options: Array<{ id: string; label: string; color?: Parameters<typeof ColorDot>[0]["color"] }>;
  selected: string[];
  onChange: (next: string[]) => void;
  testId: string;
}) {
  const on = new Set(selected);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterButton icon={icon} label={label} count={selected.length} testId={testId} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="mb-1.5 px-1 text-2xs font-medium text-muted-foreground">{title}</p>
        {options.length === 0 && <p className="px-1 py-2 text-[13px] text-muted-foreground">{empty}</p>}
        <ul className="scrollbar-thin max-h-72 overflow-y-auto">
          {options.map((option) => {
            const active = on.has(option.id);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => onChange(active ? selected.filter((id) => id !== option.id) : [...selected, option.id])}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent", active && "bg-accent/60")}
                  data-testid={`${testId}-${option.id}`}
                >
                  {option.color && <ColorDot color={option.color} />}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <Check className={cn("size-3.5 shrink-0", active ? "opacity-100" : "opacity-0")} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-1 text-muted-foreground" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** One of a list, or none: the due bucket, items against subitems. */
function ChoiceFilter<T extends string>({
  icon,
  label,
  title,
  options,
  value,
  onChange,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  options: Array<{ id: T; label: string }>;
  value: T | null;
  onChange: (next: T | null) => void;
  testId: string;
}) {
  const current = options.find((o) => o.id === value) ?? null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterButton icon={icon} label={current ? `${label}: ${current.label}` : label} count={current ? 1 : 0} testId={testId} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <p className="mb-1.5 px-1 text-2xs font-medium text-muted-foreground">{title}</p>
        <ul role="radiogroup" aria-label={title}>
          {options.map((option) => {
            const active = option.id === value;
            return (
              <li key={option.id}>
                <button type="button" role="radio" aria-checked={active} onClick={() => onChange(active ? null : option.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent", active && "bg-accent/60")} data-testid={`${testId}-${option.id}`}>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <Check className={cn("size-3.5 shrink-0", active ? "opacity-100" : "opacity-0")} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Starred tasks: the open ones in the usual due-date sections, and the done
 * ones folded away at the foot with a way to unstar them all, so the list
 * does not silt up with finished work.
 */
function StarredView({ query, now }: { query: ReturnType<typeof useMyStarred>; now: Date }) {
  const ws = useWorkspace();
  const star = useStar(ws.currentUser.id);
  const [showDone, setShowDone] = React.useState(false);
  const entries = React.useMemo(() => query.data ?? [], [query.data]);
  const grouped = React.useMemo(() => groupBy(entries, (entry) => sectionFor(entry, now)), [entries, now]);
  const done = grouped.get("completed") ?? [];
  if (query.isLoading) return <MyWorkSkeleton />;
  if (query.isError) return <ErrorState title="Could not load your starred tasks." error={query.error} onRetry={() => query.refetch()} />;
  if (entries.length === 0) return <EmptyState icon={Star} title="Nothing starred" description="Star a task from its panel to keep it here." />;
  return (
    <div data-testid="my-starred">
      {MY_WORK_SECTIONS.filter((s) => s !== "completed").map((section) => {
        const list = grouped.get(section) ?? [];
        return list.length > 0 ? <WorkSection key={section} section={section} entries={list} now={now} /> : null;
      })}
      {done.length > 0 && (
        <div className="mt-6 flex items-center gap-2" data-testid="my-starred-done">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            <ChevronDown className={cn("transition-transform", !showDone && "-rotate-90")} /> Done · {done.length}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => star.mutate({ items: done.map((e) => e.item), on: false })} data-testid="my-starred-clear-done">
            Clear done
          </Button>
        </div>
      )}
      {showDone && done.length > 0 && <WorkSection section="completed" entries={done} now={now} />}
    </div>
  );
}

function WorkSection({ section, entries, now }: { section: MyWorkSection; entries: MyWorkItem[]; now: Date }) {
  const ws = useWorkspace();
  return (
    <section className="mt-5" data-testid={`my-work-${section}`}>
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-tight text-muted-foreground">
        <span className={cn(section === "overdue" && "text-red-600 dark:text-red-400")}>{MY_WORK_SECTION_LABELS[section]}</span>
        <span className="rounded-full bg-surface-strong/80 px-2 py-0.5 text-2xs font-medium tabular">{entries.length}</span>
      </h2>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
        <div className="hidden h-9 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px_130px_110px_90px_28px] items-center gap-3 border-b border-border/70 bg-surface/70 px-4 text-2xs font-medium text-muted-foreground md:grid">
          <span>Item</span>
          <span>Board · Group</span>
          <span>PIC</span>
          <span>Status</span>
          <span>Priority</span>
          <span className="text-right">Due</span>
          <span />
        </div>
        <ul className="divide-y divide-border/60">
          {entries.map((entry) => {
            const others = entry.people.filter((id) => id !== ws.currentUser.id).map((id) => ws.userById(id)).filter((u): u is User => !!u);
            return (
              <li key={entry.item.id} className="relative">
                <Link
                  href={ws.boardPath(entry.board, { itemId: entry.item.id })}
                  className={cn(
                    "grid min-h-10 grid-cols-[minmax(0,1fr)_90px_28px] items-center gap-3 px-3 py-1.5 text-[13px] hover:bg-accent md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px_130px_110px_90px_28px]",
                    entry.isDone && "text-muted-foreground",
                  )}
                  data-testid="my-work-row"
                >
                  <span className={cn("truncate font-medium", entry.isDone && "text-muted-foreground")}>
                    {entry.item.parentItemId && <span className="mr-1 text-2xs text-muted-foreground">Subitem ·</span>}
                    {entry.item.name}
                  </span>
                  <span className="hidden min-w-0 items-center gap-1.5 text-muted-foreground md:flex">
                    <DynamicIcon name={entry.board.icon} className={cn("size-3.5 shrink-0", colorClasses(entry.board.color).text)} />
                    <span className="truncate">
                      {entry.board.name}
                      {entry.group ? <span className="text-muted-foreground/70"> · {entry.group.name}</span> : null}
                    </span>
                    {entry.linkedBoards.length > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground/70" title={`Also on ${entry.linkedBoards.map((b) => b.name).join(", ")}`}>
                        <Link2 className="size-3" /> +{entry.linkedBoards.length}
                      </span>
                    )}
                  </span>
                  {/* Who else is on it. You are, by definition, so you are not drawn. */}
                  <span className="hidden md:block">{others.length > 0 ? <AvatarStack users={others} size="sm" max={3} /> : <span className="text-2xs text-muted-foreground">Just you</span>}</span>
                  <span className="hidden md:block">
                    <LabelPill label={entry.status} size="sm" emptyText="—" striped={isStuckLabel(entry.statusColumn, entry.status?.id)} />
                  </span>
                  <span className="hidden md:block">
                    <PriorityPill label={entry.priority} emptyText="—" />
                  </span>
                  <span className={cn("text-right text-xs tabular", section === "overdue" ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{entry.dueDate ? formatShortDate(entry.dueDate, now) : "—"}</span>
                  {/* Room for the star, which sits over the link rather than in it. */}
                  <span aria-hidden />
                </Link>
                <StarTaskButton item={entry.item} className="absolute top-1/2 right-2 -translate-y-1/2" />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
