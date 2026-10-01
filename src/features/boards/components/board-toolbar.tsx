"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, EyeOff, Filter, Hash, LoaderCircle, Plus, Search, UserRound, X } from "lucide-react";
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
import { columnLabels, type BoardViewKind, boardViewsFor } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { boardBarClasses, BoardViewSwitcher, type ArchiveEntry } from "@/features/boards/components/board-view-switcher";
import { PrimaryActionSlot } from "@/features/boards/components/primary-action-slot";
import { useSavedViewStore } from "@/features/boards/saved-views/saved-view-store";
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

/** The board's single control line: which view is open, plus the tools for it. */
export function BoardToolbar({
  view,
  onViewChange,
  searchAlways = false,
  archive,
  leading,
  actions,
  savedViews,
}: {
  view: BoardViewKind;
  onViewChange: (view: BoardViewKind) => void;
  /**
   * Show the search box on every view, not only the table.
   *
   * The table is where a member of staff searches; on a stakeholder portal it
   * is the first thing anyone does, whichever view they are looking at.
   */
  searchAlways?: boolean;
  /** The board's archive, for the people who have one. Never on a public link or a portal. */
  archive?: ArchiveEntry | null;
  /**
   * Rendered at the *start* of the row, before the view switcher: the one
   * thing a visitor came to do, where the eye lands first. The portal puts
   * "Book a task" here.
   */
  leading?: React.ReactNode;
  /** Rendered at the end of the row. */
  actions?: React.ReactNode;
  /** The board's saved views, ahead of the filters. Only the board's own screen has them. */
  savedViews?: React.ReactNode;
}) {
  const { board, model, canEdit, mutations, showTicket, setShowTicket } = useBoardContext();
  const ui = useBoardUi(board.id);
  const store = useBoardUiStore();
  const filterCount = activeFilterCount(ui.filters);
  const sortLabel = (field: SortField) => {
    const columnId = sortFieldColumnId(field);
    if (columnId !== null) return model.columns.find((c) => c.id === columnId)?.name ?? "Column";
    return SORT_LABELS[field as keyof typeof SORT_LABELS];
  };
  // In a saved view, hiding a column is the view's business, not the board's.
  const viewOpen = useSavedViewStore((s) => !!s.boards[board.id]);
  // The columns are only offered to someone who can change them, so only they
  // count; a reader sees the ticket switch, the one thing here that is theirs.
  const columnsChangeable = canEdit || viewOpen;
  const hiddenCount = (columnsChangeable ? model.columns.filter((c) => c.hidden).length : 0) + (showTicket ? 0 : 1);
  const tableTools = view === "table";
  const barRef = React.useRef<HTMLDivElement>(null);
  const density = useToolbarDensity(barRef, `${view}|${filterCount}|${ui.sort?.field ?? ""}|${ui.search ? 1 : 0}|${hiddenCount}|${viewOpen ? 1 : 0}`);
  // Folded: Person and Tags live in the Filter panel. Below that, words go too.
  const folded = density >= 1;
  const labelClass = density >= 2 ? "hidden" : "hidden @5xl:inline";

  // The button labels go by the toolbar's own width rather than the window's:
  // an open task panel takes a third of the window beside it.
  return (
    <div ref={barRef} className={cn(boardBarClasses, "@container")} role="toolbar" aria-label="Board tools">
      {leading}
      {leading && <span aria-hidden className="h-6 w-px shrink-0 bg-border/70" />}
      <BoardViewSwitcher view={view} onChange={onViewChange} archive={archive} views={boardViewsFor(board)} />
      <span aria-hidden className="h-6 w-px shrink-0 bg-border/70" />
      {/* A slot: New item, or a quick run the board has put there. */}
      {tableTools && canEdit && <PrimaryActionSlot newItem={<NewItemButton />} />}
      {(tableTools || searchAlways) && <SearchBox value={ui.search} onChange={(v) => store.setSearch(board.id, v)} />}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {savedViews}
        {savedViews && tableTools && <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border/70" />}
        {tableTools && (
          <>
            {!folded && <PersonFilter labelClass={labelClass} />}
            {!folded && <TagFilter labelClass={labelClass} />}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Filter" className={cn("rounded-full", filterCount > 0 && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground")} data-testid="filter-button">
                  <Filter /> <span className={labelClass}>Filter</span>
                  {filterCount > 0 && <span className="rounded-full bg-ring px-1.5 text-2xs font-semibold text-white tabular">{filterCount}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[520px] p-3">
                <FilterPanel folded={folded} />
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Sort" className={cn("rounded-full", ui.sort && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground")} data-testid="sort-button">
                  <ArrowUpDown /> <span className={labelClass}>Sort</span>
                  {ui.sort && (
                    <span className="flex items-center gap-0.5 text-2xs">
                      {sortLabel(ui.sort.field)} {ui.sort.direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
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
                  {(Object.keys(SORT_LABELS) as Array<keyof typeof SORT_LABELS>).map((field) => (
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
                <Button variant="ghost" size="sm" aria-label="Hide columns" className={cn("rounded-full", hiddenCount > 0 && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground")}>
                  <EyeOff /> <span className={labelClass}>Hide</span>
                  {hiddenCount > 0 && <span className="text-2xs">{hiddenCount}</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                {/* Not a column of the board, but it is one on screen, and this
                    is where anyone would come looking for it. */}
                <DropdownMenuCheckboxItem checked={showTicket} onCheckedChange={(checked) => setShowTicket(checked === true)} data-testid="toggle-ticket-column">
                  Ticket
                </DropdownMenuCheckboxItem>
                {columnsChangeable && model.columns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={!column.hidden}
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
        {actions && <span className="ml-1 flex shrink-0 items-center gap-2">{actions}</span>}
        {/* Last, after the controls: a figure, not a thing to click. */}
        <span className="pl-1.5 text-2xs text-muted-foreground tabular">
          {model.isFiltered ? `${model.visibleTopLevel} of ${model.totalTopLevel} items` : `${model.totalTopLevel} items`}
        </span>
      </div>
    </div>
  );
}

/**
 * The board's search box.
 *
 * Exported because the stakeholder portal keeps a search of its own above the
 * board — a visitor there searches far more than they do anything else, and on
 * every view rather than just the table — and it must be the same control, not
 * a lookalike.
 *
 * The wrapper carries the width and shrinks with the toolbar; the input fills
 * it. With the width on the input instead, it overflowed the wrapper on a narrow
 * window and painted over the Person and Filter buttons, which could then not be
 * clicked at all between roughly 1000 and 1200 pixels.
 */
export function SearchBox({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  const loading = useBoardUiStore((s) => s.boardLoading);
  return (
    <div className={cn("relative w-56 min-w-28 shrink", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      {loading && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" data-testid="search-loading">
          <LoaderCircle className="size-3.5 animate-spin" />
          <span className="sr-only">Still loading items</span>
        </span>
      )}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        placeholder="Search items"
        aria-label="Search items"
        data-testid="search-input"
        className="h-9 w-full rounded-full border-transparent bg-surface pl-9 pr-8 hover:bg-surface-strong/70 focus-visible:bg-card"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** How much the bar has given up to fit: nothing, then Person and Tags folded into Filter, then the buttons' words. */
type Density = 0 | 1 | 2;

/**
 * Steps the bar down only when it runs out of room, and back up once there is
 * room again for what it needed before. The widths are measured, not guessed:
 * a saved view's name, a sort and Clear all all take room, and the task panel
 * takes a third of the window. A change to what the bar holds starts again
 * from the top.
 */
function useToolbarDensity(ref: React.RefObject<HTMLDivElement | null>, contentKey: string): Density {
  const [state, setState] = React.useState<{ key: string; density: Density }>({ key: contentKey, density: 0 });
  // A change to what the bar holds starts again from the top.
  const density: Density = state.key === contentKey ? state.density : 0;
  // The width the bar needed at each density, taken when it overflowed there.
  const needed = React.useRef<{ key: string; widths: Partial<Record<Density, number>> }>({ key: contentKey, widths: {} });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (needed.current.key !== contentKey) needed.current = { key: contentKey, widths: {} };
    // The observer reports once as soon as it is attached, before the frame
    // is painted, and again whenever the bar's width changes.
    const observer = new ResizeObserver(() => {
      const widths = needed.current.widths;
      if (el.scrollWidth > el.clientWidth + 1) {
        if (density < 2) {
          widths[density] = el.scrollWidth;
          setState({ key: contentKey, density: (density + 1) as Density });
        }
        return;
      }
      const wider = density > 0 ? widths[(density - 1) as Density] : undefined;
      if (wider !== undefined && el.clientWidth >= wider) setState({ key: contentKey, density: (density - 1) as Density });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, contentKey, density]);

  return density;
}

function PersonFilter({ labelClass }: { labelClass: string }) {
  const { board } = useBoardContext();
  const selected = useBoardUi(board.id).filters.personIds;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Filter by person" className={cn("rounded-full", selected.length > 0 && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground")} data-testid="person-filter">
          <UserRound /> <span className={labelClass}>Person</span>
          {selected.length > 0 && <span className="rounded-full bg-ring px-1.5 text-2xs font-semibold text-white tabular">{selected.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <p className="mb-2.5 text-xs font-medium text-muted-foreground">Filter items by owner</p>
        <PersonChoices />
      </PopoverContent>
    </Popover>
  );
}

/** The faces to filter by: on the Person button, or in the Filter panel once the bar has folded it in. */
function PersonChoices() {
  const { board, users } = useBoardContext();
  const setFilters = useBoardUiStore((s) => s.setFilters);
  const selected = useBoardUi(board.id).filters.personIds;
  return (
    <>
      <div className="flex flex-wrap gap-2.5" data-testid="person-choices">
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
                // inline-flex so the ring is concentric with the avatar rather than
                // wrapping a taller line box, and offset so it reads as a ring
                // around the face instead of a rim on it.
                className={cn(
                  "inline-flex rounded-full ring-offset-2 ring-offset-popover transition-shadow",
                  // The ring is on or off, rather than coloured or transparent:
                  // two classes setting the same ring colour fight, and which
                  // one wins is down to the order Tailwind emits them in.
                  active ? "ring-2 ring-ring" : "hover:ring-2 hover:ring-ring/40",
                )}
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
    </>
  );
}

/** One entry per tag name across every TAGS column; the first colour wins. */
function useTagOptions() {
  const { model } = useBoardContext();
  const tagColumns = React.useMemo(() => model.columns.filter((c) => c.type === "TAGS"), [model.columns]);
  return React.useMemo(() => {
    const seen = new Map<string, ReturnType<typeof tagOptionsFor>[number]>();
    for (const column of tagColumns) {
      for (const option of tagOptionsFor(column, model.snapshot.values)) {
        const key = option.name.toLowerCase();
        if (!seen.has(key)) seen.set(key, option);
      }
    }
    return { hasTags: tagColumns.length > 0, options: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }, [tagColumns, model.snapshot.values]);
}

/**
 * Its own button, like Person: tags are how people carve a board up day to day,
 * so they are not buried in the filter panel unless the bar is out of room.
 * Hidden on boards with no TAGS column.
 */
function TagFilter({ labelClass }: { labelClass: string }) {
  const { board } = useBoardContext();
  const selected = useBoardUi(board.id).filters.tags;
  const { hasTags, options } = useTagOptions();
  if (!hasTags) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Filter by tag" className={cn("rounded-full", selected.length > 0 && "state-on hover:bg-accent-soft hover:text-accent-soft-foreground")} data-testid="tag-filter">
          <Hash /> <span className={labelClass}>Tags</span>
          {selected.length > 0 && <span className="rounded-full bg-ring px-1.5 text-2xs font-semibold text-white tabular">{selected.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" data-testid="tag-filter-panel">
        <p className="mb-2.5 text-xs font-medium text-muted-foreground">Filter items by tag</p>
        <TagChoices options={options} />
      </PopoverContent>
    </Popover>
  );
}

function TagChoices({ options }: { options: ReturnType<typeof useTagOptions>["options"] }) {
  const { board } = useBoardContext();
  const setFilters = useBoardUiStore((s) => s.setFilters);
  const selected = useBoardUi(board.id).filters.tags;
  const isSelected = (name: string) => selected.some((tag) => tag.toLowerCase() === name.toLowerCase());
  const toggle = (name: string) => setFilters(board.id, { tags: isSelected(name) ? selected.filter((tag) => tag.toLowerCase() !== name.toLowerCase()) : [...selected, name] });
  return (
    <>
      {options.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No tags on this board yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5" data-testid="tag-choices">
          {options.map((option) => {
            const active = isSelected(option.name);
            return (
              <button
                key={option.name}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(option.name)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-2xs font-medium ring-2 ring-transparent transition-shadow hover:ring-ring/50",
                  colorClasses(option.color).soft,
                  active && "ring-ring",
                )}
              >
                {formatTag(option.name)}
              </button>
            );
          })}
        </div>
      )}
      {selected.length > 0 && (
        <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setFilters(board.id, { tags: [] })}>
          Clear
        </Button>
      )}
    </>
  );
}

/** Status, priority, group and date; with Person and Tags on top when the bar has folded their buttons in. */
function FilterPanel({ folded }: { folded: boolean }) {
  const { board, model } = useBoardContext();
  const { hasTags, options: tagOptions } = useTagOptions();
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
      {folded && (
        <div>
          <p className="mb-1.5 label-quiet">Person</p>
          <PersonChoices />
        </div>
      )}
      {folded && hasTags && (
        <div>
          <p className="mb-1.5 label-quiet">Tags</p>
          <TagChoices options={tagOptions} />
        </div>
      )}
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
      <Checkbox aria-label={label} checked={checked} onCheckedChange={onChange} />
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
