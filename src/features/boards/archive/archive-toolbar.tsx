"use client";

import { ArrowDown, ArrowUp, Filter, LoaderCircle, Search, Tag, UserRound, X } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ArchiveFilters, ArchiveRequest, ArchiveSortField, BoardColumn, BoardGroup, TagOption, User } from "@/domain";
import { archiveFilterCount, columnLabels, columnTagOptions } from "@/domain";
import { formatTag } from "@/features/boards/tag-palette";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { cn } from "@/lib/utils";

const SORT_LABELS: Record<ArchiveSortField, string> = { archivedAt: "Date archived", name: "Item name" };

export interface ArchiveToolbarProps {
  request: ArchiveRequest;
  onChange: (patch: Partial<ArchiveRequest>) => void;
  groups: BoardGroup[];
  columns: BoardColumn[];
  users: User[];
  /** Tags seen on the pages read so far, on top of the board's own palette. */
  extraTags: string[];
  loading: boolean;
}

/**
 * The archive's control line.
 *
 * The board's filters, minus the ones that mean nothing here: there is no view
 * to switch, nothing to add, no columns to hide and no dates to chase — "due
 * this week" is not a question you ask of work that has been put away. What is
 * left runs against the whole archive, not the page on screen, because the
 * database is what does the filtering.
 */
export function ArchiveToolbar({ request, onChange, groups, columns, users, extraTags, loading }: ArchiveToolbarProps) {
  const { filters } = request;
  const filterCount = archiveFilterCount(filters);
  const setFilters = (patch: Partial<ArchiveFilters>) => onChange({ filters: { ...filters, ...patch } });

  const statusColumn = columns.find((c) => c.type === "STATUS") ?? null;
  const priorityColumn = columns.find((c) => c.type === "PRIORITY") ?? null;
  const tagColumns = columns.filter((c) => c.type === "TAGS");
  const hasPeople = columns.some((c) => c.type === "PERSON");

  const tagOptions: TagOption[] = React.useMemo(() => {
    const options = tagColumns.flatMap((column) => columnTagOptions(column));
    const known = new Set(options.map((o) => o.name.toLowerCase()));
    const extras = extraTags.filter((tag) => !known.has(tag.toLowerCase()));
    return [...options, ...[...new Set(extras)].sort().map((name) => ({ name, color: tagColorFor(name) }))];
  }, [tagColumns, extraTags]);

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-border/70 px-6" role="toolbar" aria-label="Archive tools">
      <div className="relative w-56 min-w-28 shrink">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        {loading && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" data-testid="archive-search-loading">
            <LoaderCircle className="size-3.5 animate-spin" />
            <span className="sr-only">Searching the archive</span>
          </span>
        )}
        <Input
          value={request.search}
          onChange={(e) => onChange({ search: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") onChange({ search: "" });
          }}
          placeholder="Search the archive"
          aria-label="Search the archive"
          data-testid="archive-search"
          className="h-9 w-full rounded-full border-transparent bg-surface pl-9 pr-8 hover:bg-surface-strong/70 focus-visible:bg-card"
        />
        {request.search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange({ search: "" })}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {hasPeople && (
          <FilterPopover
            testId="archive-person-filter"
            icon={<UserRound />}
            label="Person"
            count={filters.personIds.length}
            width="w-72"
            title="Filter by owner"
          >
            <div className="flex flex-wrap gap-2.5">
              {users
                .filter((u) => u.deactivatedAt === null)
                .map((user) => {
                  const active = filters.personIds.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilters({ personIds: active ? filters.personIds.filter((id) => id !== user.id) : [...filters.personIds, user.id] })}
                      className={cn("inline-flex rounded-full ring-offset-2 ring-offset-popover transition-shadow", active && "ring-2 ring-ring")}
                    >
                      <UserAvatar user={user} size="sm" />
                    </button>
                  );
                })}
            </div>
          </FilterPopover>
        )}

        {tagOptions.length > 0 && (
          <FilterPopover testId="archive-tag-filter" icon={<Tag />} label="Tags" count={filters.tags.length} width="w-72" title="Filter by tag">
            <div className="flex flex-wrap gap-1.5">
              {tagOptions.map((option) => {
                const active = filters.tags.includes(option.name);
                return (
                  <button
                    key={option.name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilters({ tags: active ? filters.tags.filter((t) => t !== option.name) : [...filters.tags, option.name] })}
                    className={cn("rounded-full px-2 py-0.5 text-2xs font-medium transition-shadow", colorClasses(option.color).soft, active && "ring-2 ring-ring ring-offset-1 ring-offset-popover")}
                  >
                    {formatTag(option.name)}
                  </button>
                );
              })}
            </div>
          </FilterPopover>
        )}

        <FilterPopover testId="archive-filter" icon={<Filter />} label="Filter" count={filterCount} width="w-80" title={null}>
          <div className="space-y-3.5">
            <CheckList
              title="Group it came from"
              options={groups.map((group) => ({ id: group.id, label: group.name, dot: colorClasses(group.color).dot }))}
              selected={filters.groupIds}
              onChange={(groupIds) => setFilters({ groupIds })}
            />
            {statusColumn && (
              <CheckList
                title={statusColumn.name}
                options={columnLabels(statusColumn).map((label) => ({ id: label.id, label: label.name, dot: colorClasses(label.color).dot }))}
                selected={filters.statusIds}
                onChange={(statusIds) => setFilters({ statusIds })}
              />
            )}
            {priorityColumn && (
              <CheckList
                title={priorityColumn.name}
                options={columnLabels(priorityColumn).map((label) => ({ id: label.id, label: label.name, dot: colorClasses(label.color).dot }))}
                selected={filters.priorityIds}
                onChange={(priorityIds) => setFilters({ priorityIds })}
              />
            )}
          </div>
        </FilterPopover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Sort" className="rounded-full" data-testid="archive-sort">
              <span className="flex items-center gap-1 text-2xs">
                {SORT_LABELS[request.sort.field]} {request.sort.direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={request.sort.field}
              onValueChange={(field) => onChange({ sort: { field: field as ArchiveSortField, direction: request.sort.direction } })}
            >
              {(Object.keys(SORT_LABELS) as ArchiveSortField[]).map((field) => (
                <DropdownMenuRadioItem key={field} value={field}>
                  {SORT_LABELS[field]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange({ sort: { ...request.sort, direction: request.sort.direction === "asc" ? "desc" : "asc" } })}>
              {request.sort.direction === "desc" ? <ArrowUp /> : <ArrowDown />} {request.sort.direction === "desc" ? "Oldest first" : "Newest first"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {(filterCount > 0 || request.search) && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
            data-testid="archive-clear-filters"
            onClick={() => onChange({ search: "", filters: { groupIds: [], personIds: [], statusIds: [], priorityIds: [], tags: [] } })}
          >
            <X /> Clear all
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterPopover({
  testId,
  icon,
  label,
  count,
  width,
  title,
  children,
}: {
  testId: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  width: string;
  title: string | null;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Filter by ${label.toLowerCase()}`}
          className={cn("rounded-full", count > 0 && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground")}
          data-testid={testId}
        >
          {icon} <span className="hidden xl:inline">{label}</span>
          {count > 0 && <span className="rounded-full bg-ring px-1.5 text-2xs font-semibold text-white tabular">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn(width, "p-3")}>
        {title && <p className="mb-2.5 text-xs font-medium text-muted-foreground">{title}</p>}
        {children}
      </PopoverContent>
    </Popover>
  );
}

function CheckList({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: Array<{ id: string; label: string; dot: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {options.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-[13px] hover:bg-accent/60">
            <Checkbox
              checked={selected.includes(option.id)}
              onCheckedChange={(next) => onChange(next === true ? [...selected, option.id] : selected.filter((id) => id !== option.id))}
            />
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", option.dot)} />
            <span className="truncate">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
