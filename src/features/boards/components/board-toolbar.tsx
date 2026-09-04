"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, EyeOff, Filter, Plus, Search, UserRound, X } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { columnLabels, type BoardViewKind } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { boardBarClasses, BoardViewSwitcher } from "@/features/boards/components/board-view-switcher";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { activeFilterCount, useBoardUi, useBoardUiStore, type DateFilter, type SortField } from "@/stores/board-ui-store";

const SORT_LABELS: Record<SortField, string> = { name: "Item name", dueDate: "Due date", priority: "Priority", status: "Status", createdAt: "Created date" };
const DATE_FILTERS: Array<{ id: NonNullable<DateFilter>; label: string }> = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Due today" },
  { id: "thisWeek", label: "Due this week" },
  { id: "noDate", label: "No date" },
];

/** The board's single control line: which view is open, plus the tools for it. */
export function BoardToolbar({ view, onViewChange }: { view: BoardViewKind; onViewChange: (view: BoardViewKind) => void }) {
  const { board, model, canEdit, mutations } = useBoardContext();
  const ui = useBoardUi(board.id);
  const store = useBoardUiStore();
  const filterCount = activeFilterCount(ui.filters);
  const hiddenCount = model.columns.filter((c) => c.hidden).length;
  const tableTools = view === "table";

  return (
    <div className={boardBarClasses} role="toolbar" aria-label="Board tools">
      <BoardViewSwitcher view={view} onChange={onViewChange} />
      <span aria-hidden className="h-6 w-px shrink-0 bg-border/70" />
      {tableTools && canEdit && <NewItemButton />}
      {tableTools && <SearchBox value={ui.search} onChange={(v) => store.setSearch(board.id, v)} />}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {tableTools && (
          <>
            <PersonFilter />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className={cn("rounded-full", filterCount > 0 && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground")} data-testid="filter-button">
                  <Filter /> Filter
                  {filterCount > 0 && <span className="rounded-full bg-ring px-1.5 text-2xs font-semibold text-white tabular">{filterCount}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[520px] p-3">
                <FilterPanel />
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={cn("rounded-full", ui.sort && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground")} data-testid="sort-button">
                  <ArrowUpDown /> Sort
                  {ui.sort && (
                    <span className="flex items-center gap-0.5 text-2xs">
                      {SORT_LABELS[ui.sort.field]} {ui.sort.direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={ui.sort?.field ?? ""}
                  onValueChange={(field) => store.setSort(board.id, { field: field as SortField, direction: ui.sort?.field === field ? ui.sort.direction : "asc" })}
                >
                  {(Object.keys(SORT_LABELS) as SortField[]).map((field) => (
                    <DropdownMenuRadioItem key={field} value={field}>
                      {SORT_LABELS[field]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!ui.sort} onSelect={() => ui.sort && store.setSort(board.id, { ...ui.sort, direction: ui.sort.direction === "asc" ? "desc" : "asc" })}>
                  {ui.sort?.direction === "desc" ? <ArrowUp /> : <ArrowDown />} {ui.sort?.direction === "desc" ? "Ascending" : "Descending"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!ui.sort} onSelect={() => store.setSort(board.id, null)}>
                  <X /> Clear sort
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={cn("rounded-full", hiddenCount > 0 && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground")}>
                  <EyeOff /> Hide
                  {hiddenCount > 0 && <span className="text-2xs">{hiddenCount}</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                {model.columns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={!column.hidden}
                    disabled={!canEdit}
                    onCheckedChange={(checked) => void mutations.updateColumn(column.id, { hidden: !checked })}
                  >
                    {column.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {(filterCount > 0 || ui.search || ui.sort) && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground"
                onClick={() => {
                  store.clearFilters(board.id);
                  store.setSearch(board.id, "");
                  store.setSort(board.id, null);
                }}
              >
                <X /> Clear all
              </Button>
            )}
          </>
        )}
        <span className="pl-1.5 text-2xs text-muted-foreground tabular">
          {model.isFiltered ? `${model.visibleTopLevel} of ${model.totalTopLevel} items` : `${model.totalTopLevel} items`}
        </span>
      </div>
    </div>
  );
}

/** Always visible — searching is the toolbar's most-used control. */
function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative min-w-0 shrink">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        placeholder="Search items"
        aria-label="Search items"
        data-testid="search-input"
        className="h-9 w-56 min-w-28 rounded-full border-transparent bg-surface pl-9 pr-8 hover:bg-surface-strong/70 focus-visible:bg-card"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function PersonFilter() {
  const { board, users } = useBoardContext();
  const ui = useBoardUi(board.id);
  const setFilters = useBoardUiStore((s) => s.setFilters);
  const selected = ui.filters.personIds;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("rounded-full", selected.length > 0 && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground")} data-testid="person-filter">
          <UserRound /> Person
          {selected.length > 0 && <span className="rounded-full bg-ring px-1.5 text-2xs font-semibold text-white tabular">{selected.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <p className="mb-2.5 text-xs font-medium text-muted-foreground">Filter items by owner</p>
        <div className="flex flex-wrap gap-1.5">
          {users
            .filter((u) => u.deactivatedAt === null)
            .map((user) => {
              const active = selected.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilters(board.id, { personIds: active ? selected.filter((id) => id !== user.id) : [...selected, user.id] })}
                  className={cn("rounded-full ring-2 ring-transparent transition-shadow hover:ring-ring/50", active && "ring-ring")}
                >
                  <UserAvatar user={user} size="lg" />
                </button>
              );
            })}
        </div>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setFilters(board.id, { personIds: [] })}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FilterPanel() {
  const { board, model } = useBoardContext();
  const ui = useBoardUi(board.id);
  const setFilters = useBoardUiStore((s) => s.setFilters);
  const clearFilters = useBoardUiStore((s) => s.clearFilters);
  const toggle = (key: "statusIds" | "priorityIds" | "groupIds", id: string) => {
    const current = ui.filters[key];
    setFilters(board.id, { [key]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] });
  };
  return (
    <div className="space-y-3" data-testid="filter-panel">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium">Filters</p>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => clearFilters(board.id)}>
          Clear all
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {model.statusColumn && (
          <FilterGroup title="Status">
            {columnLabels(model.statusColumn).map((label) => (
              <FilterOption key={label.id} label={label.name} color={colorClasses(label.color).dot} checked={ui.filters.statusIds.includes(label.id)} onChange={() => toggle("statusIds", label.id)} />
            ))}
          </FilterGroup>
        )}
        {model.priorityColumn && (
          <FilterGroup title="Priority">
            {columnLabels(model.priorityColumn).map((label) => (
              <FilterOption key={label.id} label={label.name} color={colorClasses(label.color).dot} checked={ui.filters.priorityIds.includes(label.id)} onChange={() => toggle("priorityIds", label.id)} />
            ))}
          </FilterGroup>
        )}
        <FilterGroup title="Group">
          {model.groups.map((group) => (
            <FilterOption key={group.id} label={group.name} color={colorClasses(group.color).dot} checked={ui.filters.groupIds.includes(group.id)} onChange={() => toggle("groupIds", group.id)} />
          ))}
        </FilterGroup>
      </div>
      <div>
        <p className="mb-1.5 label-quiet">Date</p>
        <Select value={ui.filters.date ?? "any"} onValueChange={(v) => setFilters(board.id, { date: v === "any" ? null : (v as DateFilter) })}>
          <SelectTrigger className="w-56" aria-label="Date filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any date</SelectItem>
            {DATE_FILTERS.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 label-quiet">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FilterOption({ label, color, checked, onChange }: { label: string; color: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[13px] hover:bg-accent">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span className={cn("size-2.5 rounded-full", color)} />
      <span className="truncate">{label}</span>
    </label>
  );
}

function NewItemButton() {
  const { board, model, mutations, openItem } = useBoardContext();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [chosenGroupId, setGroupId] = React.useState<string | null>(null);
  const groupId = chosenGroupId && model.groups.some((g) => g.id === chosenGroupId) ? chosenGroupId : (model.groups[0]?.id ?? "");

  const submit = async (openAfter: boolean) => {
    if (!name.trim() || !groupId) return;
    const item = await mutations.createItem({ groupId, name });
    setName("");
    setOpen(false);
    if (openAfter && item) openItem(item.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" disabled={model.groups.length === 0} data-testid="new-item-button">
          <Plus /> New Item
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <Input autoFocus placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Item name" data-testid="new-item-name" />
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger aria-label="Group">
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              {model.groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  <span className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-full", colorClasses(g.color).dot)} /> {g.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={!name.trim()} onClick={() => void submit(true)}>
              Create &amp; open
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim()} data-testid="new-item-submit">
              Create
            </Button>
          </div>
        </form>
        <p className="mt-3 text-2xs text-muted-foreground">Tip: type in the “Add item” row at the bottom of any group for quick entry. Board: {board.name}</p>
      </PopoverContent>
    </Popover>
  );
}
