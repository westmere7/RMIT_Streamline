"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Check, EyeOff, Filter, Hash, Search, X } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { columnLabels, type BoardViewKind } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { VIEWS } from "@/features/boards/components/board-view-switcher";
import { formatTag, tagOptionsFor } from "@/features/boards/tag-palette";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { activeFilterCount, sortFieldColumnId, useBoardUi, useBoardUiStore, type DateFilter, type SortField } from "@/stores/board-ui-store";

const SORT_LABELS: Record<Exclude<SortField, `column:${string}`>, string> = { name: "Item name", dueDate: "Due date", priority: "Priority", status: "Status", createdAt: "Created date" };
const DATE_FILTERS: Array<{ id: NonNullable<DateFilter>; label: string }> = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Due today" },
  { id: "thisWeek", label: "Due this week" },
  { id: "noDate", label: "No date" },
];

/**
 * The board's tools on a phone: a row of chips, each opening a sheet.
 *
 * The desktop toolbar lays search, person, tags, filter, sort and hide out side
 * by side, which needs about 700 pixels. Here each is a chip that says whether
 * it is doing anything — a count, a value — and opens a full-width sheet with
 * room for real targets. The state is the same board UI store the desktop
 * toolbar writes, so a filter set here is the filter the grid shows.
 */
export function MobileBoardTools({
  view,
  onViewChange,
  actions,
}: {
  view: BoardViewKind;
  onViewChange: (view: BoardViewKind) => void;
  /** Rendered at the end of the row. The portal puts "Book a task" here. */
  actions?: React.ReactNode;
}) {
  const { board, model } = useBoardContext();
  const ui = useBoardUi(board.id);
  const store = useBoardUiStore();
  const [open, setOpen] = React.useState<null | "views" | "search" | "filter" | "sort" | "columns">(null);
  const close = () => setOpen(null);

  const filterCount = activeFilterCount(ui.filters);
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0]!;
  const CurrentIcon = current.icon;
  const sortLabel = (field: SortField) => {
    const columnId = sortFieldColumnId(field);
    if (columnId !== null) return model.columns.find((c) => c.id === columnId)?.name ?? "Column";
    return SORT_LABELS[field as keyof typeof SORT_LABELS];
  };

  return (
    <>
      {/* Scrolls inside itself; the page never moves sideways. */}
      <div className="-mx-3 shrink-0 overflow-x-auto overscroll-x-contain px-3" role="toolbar" aria-label="Board tools">
        <div className="flex w-max items-center gap-1.5 pb-0.5">
          <Chip onClick={() => setOpen("views")} icon={CurrentIcon} label={current.label} testId="mobile-view-switcher" active />
          <Chip onClick={() => setOpen("search")} icon={Search} label={ui.search || "Search"} active={!!ui.search} testId="mobile-search-chip" />
          <Chip onClick={() => setOpen("filter")} icon={Filter} label="Filter" count={filterCount} active={filterCount > 0} testId="mobile-filter-chip" />
          <Chip onClick={() => setOpen("sort")} icon={ArrowUpDown} label={ui.sort ? sortLabel(ui.sort.field) : "Sort"} active={!!ui.sort} testId="mobile-sort-chip">
            {ui.sort && (ui.sort.direction === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
          </Chip>
          <Chip onClick={() => setOpen("columns")} icon={EyeOff} label="Columns" testId="mobile-columns-chip" />
        </div>
      </div>

      <Sheet open={open === "views"} onOpenChange={(next) => !next && close()}>
        <SheetContent title="Views">
          <div role="menu" className="pb-2">
            {VIEWS.map(({ id, label, hint, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={id === view}
                onClick={() => {
                  onViewChange(id);
                  close();
                }}
                className="flex min-h-14 w-full items-start gap-3 rounded-lg px-2 py-2 text-left active:bg-accent/70"
                data-testid={`mobile-view-${id}`}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{label}</span>
                  <span className="block text-[13px] text-muted-foreground">{hint}</span>
                </span>
                {id === view && <Check className="mt-1 size-4 shrink-0" aria-hidden />}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={open === "search"} onOpenChange={(next) => !next && close()}>
        <SheetContent title="Search this board" description="Matches the item name or its booking code.">
          <div className="relative pb-2">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={ui.search}
              onChange={(e) => store.setSearch(board.id, e.target.value)}
              placeholder="Name or ID"
              aria-label="Search items"
              className="h-12 pl-9 pr-10 text-base"
              data-testid="mobile-search-input"
            />
            {ui.search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => store.setSearch(board.id, "")}
                className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-accent/70"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <p className="pb-2 text-[13px] text-muted-foreground" aria-live="polite">
            {model.isFiltered ? `${model.visibleTopLevel} of ${model.totalTopLevel} items` : `${model.totalTopLevel} items`}
          </p>
        </SheetContent>
      </Sheet>

      <Sheet open={open === "filter"} onOpenChange={(next) => !next && close()}>
        <SheetContent
          title="Filter"
          description={filterCount > 0 ? `${filterCount} active` : undefined}
          footer={
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 flex-1" onClick={() => store.clearFilters(board.id)} disabled={filterCount === 0} data-testid="mobile-filter-clear">
                Clear all
              </Button>
              <Button className="h-11 flex-1" onClick={close}>
                Done
              </Button>
            </div>
          }
        >
          <MobileFilters />
        </SheetContent>
      </Sheet>

      <Sheet open={open === "sort"} onOpenChange={(next) => !next && close()}>
        <SheetContent title="Sort">
          <div role="menu" className="pb-2">
            {(Object.keys(SORT_LABELS) as Array<keyof typeof SORT_LABELS>).map((field) => {
              const active = ui.sort?.field === field;
              return (
                <button
                  key={field}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => store.setSort(board.id, { field, direction: active ? (ui.sort!.direction === "asc" ? "desc" : "asc") : "asc" })}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-[15px] active:bg-accent/70"
                  data-testid={`mobile-sort-${field}`}
                >
                  <span className="min-w-0 flex-1 truncate">{SORT_LABELS[field]}</span>
                  {active && (ui.sort!.direction === "asc" ? <ArrowUp className="size-4" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />)}
                  {active && <span className="sr-only">{ui.sort!.direction === "asc" ? "ascending" : "descending"}</span>}
                </button>
              );
            })}
            {ui.sort && (
              <button type="button" onClick={() => store.setSort(board.id, null)} className="mt-1 flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-[15px] text-muted-foreground active:bg-accent/70">
                <X className="size-4" aria-hidden /> Clear sort
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={open === "columns"} onOpenChange={(next) => !next && close()}>
        <SheetContent title="Columns" description="Which fields the grid shows. Cards always carry the essentials.">
          <MobileColumns />
        </SheetContent>
      </Sheet>
    </>
  );
}

function Chip({
  onClick,
  icon: Icon,
  label,
  count,
  active,
  testId,
  children,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  active?: boolean;
  testId?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex h-11 max-w-44 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium active:bg-accent/70",
        active ? "border-ring bg-accent-soft/60 text-accent-soft-foreground" : "border-border/70 text-muted-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      {children}
      {count !== undefined && count > 0 && <span className="shrink-0 rounded-full bg-ring px-1.5 text-2xs font-semibold text-white tabular">{count}</span>}
    </button>
  );
}

/** Status, priority, group, person, tags and date — the desktop's filters, stacked. */
function MobileFilters() {
  const { board, model, users } = useBoardContext();
  const ui = useBoardUi(board.id);
  const setFilters = useBoardUiStore((s) => s.setFilters);
  const toggle = (key: "statusIds" | "priorityIds" | "groupIds", id: string) => {
    const current = ui.filters[key];
    setFilters(board.id, { [key]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] });
  };

  const tagColumns = React.useMemo(() => model.columns.filter((c) => c.type === "TAGS"), [model.columns]);
  const tagOptions = React.useMemo(() => {
    const seen = new Map<string, ReturnType<typeof tagOptionsFor>[number]>();
    for (const column of tagColumns) {
      for (const option of tagOptionsFor(column, model.snapshot.values)) {
        const key = option.name.toLowerCase();
        if (!seen.has(key)) seen.set(key, option);
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tagColumns, model.snapshot.values]);
  const tagSelected = (name: string) => ui.filters.tags.some((tag) => tag.toLowerCase() === name.toLowerCase());

  return (
    <div className="space-y-5 pb-2" data-testid="mobile-filter-panel">
      <Group title="People">
        <div className="flex flex-wrap gap-2.5">
          {users
            .filter((u) => u.deactivatedAt === null)
            .map((user) => {
              const active = ui.filters.personIds.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={user.displayName}
                  onClick={() => setFilters(board.id, { personIds: active ? ui.filters.personIds.filter((id) => id !== user.id) : [...ui.filters.personIds, user.id] })}
                  className={cn("inline-flex rounded-full p-0.5 ring-offset-2 ring-offset-popover", active && "ring-2 ring-ring")}
                >
                  <UserAvatar user={user} size="lg" tooltip={false} />
                </button>
              );
            })}
        </div>
      </Group>

      {model.statusColumn && (
        <Group title="Status">
          {columnLabels(model.statusColumn).map((label) => (
            <Option key={label.id} label={label.name} color={colorClasses(label.color).dot} checked={ui.filters.statusIds.includes(label.id)} onChange={() => toggle("statusIds", label.id)} />
          ))}
        </Group>
      )}

      {model.priorityColumn && (
        <Group title="Priority">
          {columnLabels(model.priorityColumn).map((label) => (
            <Option key={label.id} label={label.name} color={colorClasses(label.color).dot} checked={ui.filters.priorityIds.includes(label.id)} onChange={() => toggle("priorityIds", label.id)} />
          ))}
        </Group>
      )}

      <Group title="Group">
        {model.groups.map((group) => (
          <Option key={group.id} label={group.name} color={colorClasses(group.color).dot} checked={ui.filters.groupIds.includes(group.id)} onChange={() => toggle("groupIds", group.id)} />
        ))}
      </Group>

      {tagOptions.length > 0 && (
        <Group title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {tagOptions.map((option) => {
              const active = tagSelected(option.name);
              return (
                <button
                  key={option.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setFilters(board.id, {
                      tags: active ? ui.filters.tags.filter((tag) => tag.toLowerCase() !== option.name.toLowerCase()) : [...ui.filters.tags, option.name],
                    })
                  }
                  className={cn("flex min-h-9 items-center rounded-full px-3 text-[13px] font-medium ring-2 ring-transparent", colorClasses(option.color).soft, active && "ring-ring")}
                >
                  <Hash className="mr-0.5 size-3" aria-hidden />
                  {formatTag(option.name)}
                </button>
              );
            })}
          </div>
        </Group>
      )}

      <Group title="Date">
        <div className="grid grid-cols-2 gap-1.5">
          {[{ id: null, label: "Any date" }, ...DATE_FILTERS].map((option) => {
            const active = (ui.filters.date ?? null) === option.id;
            return (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFilters(board.id, { date: option.id })}
                className={cn("flex min-h-11 items-center justify-center rounded-lg border text-[13px] font-medium", active ? "border-ring bg-accent-soft/60" : "border-border/70")}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </Group>
    </div>
  );
}

/** Which columns the grid shows — the desktop's Hide menu, including the ID# slot. */
function MobileColumns() {
  const { model, mutations, canManage, showReference, setShowReference } = useBoardContext();
  return (
    <div className="pb-2">
      <Option label="ID#" checked={showReference} onChange={() => setShowReference(!showReference)} testId="mobile-toggle-reference" />
      {model.columns.map((column) => (
        <Option
          key={column.id}
          label={column.name}
          checked={!column.hidden}
          disabled={!canManage}
          onChange={() => void mutations.updateColumn(column.id, { hidden: !column.hidden })}
        />
      ))}
      {!canManage && <p className="px-2 pt-2 text-[13px] text-muted-foreground">Only a board manager can hide columns.</p>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 px-1 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Option({ label, color, checked, onChange, disabled, testId }: { label: string; color?: string; checked: boolean; onChange: () => void; disabled?: boolean; testId?: string }) {
  return (
    <label className={cn("flex min-h-12 items-center gap-3 rounded-lg px-2 text-[15px] active:bg-accent/70", disabled && "opacity-50")}>
      <Checkbox checked={checked} onCheckedChange={onChange} disabled={disabled} className="size-5" data-testid={testId} />
      {color && <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", color)} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}
