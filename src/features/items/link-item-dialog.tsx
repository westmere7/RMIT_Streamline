"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Check, CornerDownRight, SquareKanban, Link2, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { Board, ColorToken, Item, Team } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { useLinkCandidates, useLinkMapping, useLinkMutations } from "@/features/items/link-hooks";
import { SyncFieldList } from "@/features/items/sync-field-list";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { colorClasses } from "@/lib/colors";
import { canEditBoard } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";
import type { LinkCandidate, LinkOptions } from "@/services";

export interface LinkItemDialogProps {
  item: Item;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Three panes: browse teams → boards on the left, search or scroll items in the
 * middle, and choose what will stay in sync on the right before linking.
 */
export function LinkItemDialog({ item, open, onOpenChange }: LinkItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The content unmounts when the dialog closes, so search and selection reset for free. */}
      <DialogContent size="xl" className="gap-0 overflow-hidden p-0 sm:max-w-[1180px]" data-testid="link-item-dialog">
        <LinkItemDialogBody item={item} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface TeamSection {
  team: Team | null;
  boards: Board[];
}

function LinkItemDialogBody({ item, onClose }: { item: Item; onClose: () => void }) {
  const { board } = useBoardContext();
  const ws = useWorkspace();
  const [boardId, setBoardId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const debounced = useDebouncedValue(query.trim(), 150);
  const [selected, setSelected] = React.useState<LinkCandidate | null>(null);
  const [seedFrom, setSeedFrom] = React.useState<LinkOptions["seedFrom"]>("item");
  // Everything the boards share syncs unless the user unticks it here.
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  const candidates = useLinkCandidates(item.id, debounced, boardId, true);
  // Or a task made for the link, on a board and in a group of the person's choosing.
  const [draft, setDraft] = React.useState<{ boardId: string | null; groupId: string | null; name: string } | null>(null);
  const [creating, setCreating] = React.useState(false);
  const services = useServices();
  const mapping = useLinkMapping(board.id, selected?.board.id ?? draft?.boardId ?? null);
  const { link } = useLinkMutations(item.id);

  // Sync writes to both boards, so only boards the user can edit are offered; boards
  // already in this item's chain are shown but cannot take a second item.
  const blocked = new Set(candidates.data?.blockedBoardIds ?? [board.id]);
  const linkable = ws.boards.filter((b) => b.archivedAt === null && b.id !== board.id && canEditBoard(ws.permissions, b));
  const sections: TeamSection[] = [
    ...ws.teams.filter((t) => t.archivedAt === null).map((team) => ({ team, boards: linkable.filter((b) => b.teamId === team.id) })),
    { team: null, boards: linkable.filter((b) => b.teamId === null) },
  ].filter((s) => s.boards.length > 0);
  const linkableIds = new Set(linkable.map((b) => b.id));
  const hits = (candidates.data?.hits ?? []).filter((c) => linkableIds.has(c.board.id));
  const activeBoard = boardId ? (linkable.find((b) => b.id === boardId) ?? null) : null;

  // Browsing one board groups by its groups; browsing everything groups by board · group.
  const groups = new Map<string, { heading: React.ReactNode; hits: LinkCandidate[] }>();
  for (const hit of hits) {
    const key = activeBoard ? (hit.group?.id ?? "none") : `${hit.board.id}:${hit.group?.id ?? "none"}`;
    const existing = groups.get(key);
    if (existing) existing.hits.push(hit);
    else groups.set(key, { heading: activeBoard ? (hit.group?.name ?? "No group") : <BoardHeading board={hit.board} group={hit.group?.name ?? null} />, hits: [hit] });
  }

  const choose = (next: string | null) => {
    setBoardId(next);
    setSelected(null);
    // A new task follows the board being browsed.
    setDraft((d) => (d ? { ...d, boardId: next && !blocked.has(next) ? next : d.boardId, groupId: next && next !== d.boardId ? null : d.groupId } : d));
  };
  const select = (hit: LinkCandidate) => {
    if (hit.item.id !== selected?.item.id) setExcluded(new Set());
    setSelected(hit);
    setDraft(null);
  };
  const startDraft = () => {
    setSelected(null);
    setExcluded(new Set());
    setSeedFrom("item");
    setDraft({ boardId: activeBoard && !blocked.has(activeBoard.id) ? activeBoard.id : null, groupId: null, name: item.name });
  };
  const draftBoard = draft?.boardId ? (linkable.find((b) => b.id === draft.boardId) ?? null) : null;
  const toggleField = (keys: string[], on: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };
  const submit = async () => {
    if (selected) {
      link.mutate({ targetId: selected.item.id, options: { seedFrom, excluded: [...excluded] } }, { onSuccess: onClose });
      return;
    }
    if (!draft?.boardId || !draft.groupId || !draft.name.trim()) return;
    // Made, then linked and filled from this task. A link that fails takes the new task with it.
    setCreating(true);
    try {
      const created = await services.items.createItem({ boardId: draft.boardId, groupId: draft.groupId, name: draft.name.trim() }, ws.currentUser.id);
      try {
        await link.mutateAsync({ targetId: created.id, options: { seedFrom: "item", excluded: [...excluded] } });
      } catch (error) {
        await services.items.deleteItems(draft.boardId, [created.id], ws.currentUser.id).catch(() => undefined);
        throw error;
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not make and link the task");
    } finally {
      setCreating(false);
    }
  };
  const canSubmit = selected ? !link.isPending : !!draft?.boardId && !!draft.groupId && !!draft.name.trim() && !creating && !link.isPending;

  return (
    <>
      <DialogHeader className="px-5 pt-5 pb-4 text-left">
        <DialogTitle className="flex items-center gap-2">
          <Link2 className="size-4 text-muted-foreground" /> Link to another item
        </DialogTitle>
        <DialogDescription>Both items then stay in sync — name, description and every column the two boards share, unless you switch a field off. Subitems are left alone.</DialogDescription>
      </DialogHeader>

      <div className="grid h-[600px] border-t md:grid-cols-[240px_minmax(0,1fr)_320px]">
        {/* Teams → boards, shaped like the app sidebar */}
        <nav aria-label="Boards" className="scrollbar-thin hidden min-h-0 overflow-y-auto border-r p-2 md:block">
          <ScopeButton active={boardId === null} onClick={() => choose(null)}>
            <SquareKanban className="size-3.5 text-muted-foreground/70" />
            <span className="truncate">All boards</span>
            <span className="ml-auto text-2xs text-muted-foreground tabular">{linkable.length}</span>
          </ScopeButton>
          <p className="mt-3 px-2 pb-1 label-quiet">Teams</p>
          <ul className="space-y-0.5">
            {sections.map(({ team, boards }) => (
              <li key={team?.id ?? "none"}>
                <div className="flex h-8 items-center gap-2 px-2 text-[13px] font-medium">
                  {team ? <DynamicIcon name={team.icon} className={cn("size-3.5 shrink-0", colorClasses(team.color).text)} /> : <SquareKanban className="size-3.5 shrink-0 text-muted-foreground/70" />}
                  <span className="truncate">{team?.name ?? "No team"}</span>
                  <span className="ml-auto text-2xs text-muted-foreground tabular">{boards.length}</span>
                </div>
                <ul className="mt-0.5 ml-[15px] space-y-0.5 border-l pl-2">
                  {boards.map((b) => {
                    const taken = blocked.has(b.id);
                    return (
                      <li key={b.id}>
                        <SimpleTooltip label="Already linked into this chain" disabled={!taken}>
                          <ScopeButton active={boardId === b.id} disabled={taken} onClick={() => choose(b.id)} nested>
                            <SquareKanban className={cn("size-3.5 shrink-0", boardId === b.id ? "text-foreground" : "text-muted-foreground/70")} />
                            <span className="truncate">{b.name}</span>
                            {taken && <Link2 className="ml-auto size-3 shrink-0 text-muted-foreground/60" />}
                          </ScopeButton>
                        </SimpleTooltip>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        {/* Items */}
        <Command
          shouldFilter={false}
          className="min-h-0 rounded-none [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:first-child_[cmdk-group-heading]]:pt-1"
        >
          <CommandInput placeholder={activeBoard ? `Search ${activeBoard.name}…` : "Search items across all boards…"} value={query} onValueChange={setQuery} autoFocus data-testid="link-search" />
          <CommandList className="scrollbar-thin max-h-none min-h-0 flex-1 px-2 pb-2">
            <CommandGroup className="pt-1">
              <CommandItem
                value="__new-task"
                onSelect={startDraft}
                className={cn("gap-2 rounded-md px-2 py-2 text-[13px]", draft && "bg-accent")}
                data-testid="link-new-task"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/50 text-muted-foreground">
                  <Plus className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{activeBoard ? `New task on ${activeBoard.name}` : "New task to link to"}</span>
              </CommandItem>
            </CommandGroup>
            {candidates.isLoading && (
              <div className="space-y-2 p-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            )}
            {!candidates.isLoading && hits.length === 0 && <CommandEmpty>{debounced ? `No items match “${debounced}”${activeBoard ? ` on ${activeBoard.name}` : ""}.` : "No items here yet."}</CommandEmpty>}
            {[...groups.entries()].map(([key, group]) => (
              <CommandGroup key={key} heading={group.heading}>
                {group.hits.map((hit, index) => (
                  <CandidateRow key={hit.item.id} hit={hit} striped={index % 2 === 1} selected={selected?.item.id === hit.item.id} onSelect={() => select(hit)} />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>

        {/* Preview + options */}
        <aside className="scrollbar-thin flex min-h-0 flex-col gap-5 overflow-y-auto border-t p-4 md:border-t-0 md:border-l">
          {draft ? (
            <>
              <section className="space-y-2.5" data-testid="link-new-task-form">
                <SectionLabel>New task</SectionLabel>
                <label className="grid gap-1 text-2xs text-muted-foreground">
                  Board
                  <Select value={draft.boardId ?? ""} onValueChange={(next) => setDraft({ ...draft, boardId: next, groupId: null })}>
                    <SelectTrigger className="h-8 text-[13px]" aria-label="Board for the new task" data-testid="link-new-board">
                      <SelectValue placeholder="Choose a board" />
                    </SelectTrigger>
                    <SelectContent>
                      {linkable
                        .filter((b) => !blocked.has(b.id))
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </label>
                {draftBoard && <DraftGroupSelect boardId={draftBoard.id} value={draft.groupId} onChange={(groupId) => setDraft({ ...draft, groupId })} />}
                <label className="grid gap-1 text-2xs text-muted-foreground">
                  Name
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 text-[13px]" aria-label="Name of the new task" data-testid="link-new-name" />
                </label>
                <p className="text-2xs text-muted-foreground">It starts with this task&rsquo;s values for every field that stays in sync.</p>
              </section>
              {draftBoard && (
                <section>
                  <SectionLabel>What stays in sync</SectionLabel>
                  {mapping.isLoading || !mapping.data ? (
                    <Skeleton className="h-24" />
                  ) : (
                    <SyncFieldList
                      mapping={mapping.data}
                      excluded={excluded}
                      onToggle={toggleField}
                      boardName={board.name}
                      otherBoardName={draftBoard.name}
                      ticket={{ self: item.ticket ?? null, other: null, from: "item" }}
                    />
                  )}
                </section>
              )}
            </>
          ) : !selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-[13px] text-muted-foreground">
              <span className="flex size-9 items-center justify-center rounded-full bg-surface-strong">
                <ArrowLeftRight className="size-4" />
              </span>
              Pick an item to choose what will stay in sync.
            </div>
          ) : (
            <>
              <section>
                <SectionLabel>Linking</SectionLabel>
                <PairRow name={item.name} boardName={board.name} color={board.color} icon={board.icon} />
                <div className="my-1 flex justify-center text-muted-foreground/60">
                  <ArrowLeftRight className="size-3.5" />
                </div>
                <PairRow name={selected.item.name} boardName={selected.board.name} color={selected.board.color} icon={selected.board.icon} />
              </section>

              <section>
                <SectionLabel>What stays in sync</SectionLabel>
                {mapping.isLoading || !mapping.data ? (
                  <Skeleton className="h-24" />
                ) : (
                  <SyncFieldList
                    mapping={mapping.data}
                    excluded={excluded}
                    onToggle={toggleField}
                    boardName={board.name}
                    otherBoardName={selected.board.name}
                    ticket={{ self: item.ticket ?? null, other: selected.item.ticket ?? null, from: seedFrom }}
                  />
                )}
              </section>

              <fieldset>
                <SectionLabel as="legend">Start with values from</SectionLabel>
                <div className="space-y-1.5 text-[13px]">
                  <SeedOption checked={seedFrom === "item"} onChange={() => setSeedFrom("item")} label="This item" hint={item.name} />
                  <SeedOption checked={seedFrom === "target"} onChange={() => setSeedFrom("target")} label="Selected item" hint={selected.item.name} />
                </div>
                <p className="mt-2 text-2xs text-muted-foreground">Only fields the chosen side has filled in are copied; nothing is cleared.</p>
              </fieldset>
            </>
          )}
        </aside>
      </div>

      <DialogFooter className="flex-row items-center justify-end gap-2 border-t px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} disabled={!canSubmit} data-testid="link-submit">
          <Link2 /> {creating || link.isPending ? "Linking…" : draft ? "Make and link" : "Link items"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Same shape as the app sidebar's nav rows so the dialog reads as the boards the user already knows. */
function ScopeButton({ active, disabled, onClick, nested, children }: { active: boolean; disabled?: boolean; onClick: () => void; nested?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
        nested ? "h-7 font-normal" : "h-8 font-medium",
        active ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function BoardHeading({ board, group }: { board: Board; group: string | null }) {
  return (
    <span className="flex items-center gap-1.5">
      <SquareKanban className="size-3 text-muted-foreground/70" />
      <span className="truncate">{board.name}</span>
      {group && <span className="font-normal normal-case tracking-normal text-muted-foreground/80">· {group}</span>}
    </span>
  );
}

/** Just the name: the right-hand pane explains everything else once a row is picked. */
function CandidateRow({ hit, striped, selected, onSelect }: { hit: LinkCandidate; striped: boolean; selected: boolean; onSelect: () => void }) {
  return (
    <CommandItem
      value={hit.item.id}
      disabled={hit.linked}
      onSelect={onSelect}
      data-testid="link-candidate"
      aria-selected={selected}
      className={cn("h-9 gap-2.5 rounded-md px-2.5", striped && "bg-foreground/[0.04]", selected && "bg-accent", hit.parent && "pl-7")}
    >
      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-white" : "border-border text-transparent")}>
        <Check className="size-2.5 !text-current" strokeWidth={3} />
      </span>
      {hit.parent && <CornerDownRight className="size-3 shrink-0" />}
      <span className="min-w-0 flex-1 truncate text-[13px]">{hit.item.name}</span>
      {hit.linked && <Badge variant="muted">Linked</Badge>}
    </CommandItem>
  );
}

function SectionLabel({ children, as = "p" }: { children: React.ReactNode; as?: "p" | "legend" }) {
  const Tag = as;
  return <Tag className="mb-2 label-quiet">{children}</Tag>;
}

function PairRow({ name, boardName, color, icon }: { name: string; boardName: string; color: ColorToken; icon: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/70 px-3 py-2.5">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-white", colorClasses(color).solid)}>
        <DynamicIcon name={icon} className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="block truncate text-2xs text-muted-foreground">{boardName}</span>
      </span>
    </div>
  );
}

function SeedOption({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:bg-accent/60", checked && "border-ring/60 state-on")}>
      <input type="radio" name="seed-from" checked={checked} onChange={onChange} className="accent-primary" />
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block truncate text-2xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/** The groups a new task can go in: any but Task Allocation's Booked by Form, which takes bookings only. The first is picked to begin with. */
function DraftGroupSelect({ boardId, value, onChange }: { boardId: string; value: string | null; onChange: (groupId: string) => void }) {
  const services = useServices();
  const groups = useQuery({
    queryKey: ["link-new-task-groups", boardId],
    queryFn: async () => (await services.repos.boards.listGroups(boardId)).filter((g) => g.role !== "INTAKE").sort((a, b) => a.position - b.position),
  });
  const first = groups.data?.[0]?.id ?? null;
  React.useEffect(() => {
    if (!value && first) onChange(first);
  }, [value, first, onChange]);
  return (
    <label className="grid gap-1 text-2xs text-muted-foreground">
      Group
      <Select value={value ?? ""} onValueChange={onChange} disabled={!groups.data?.length}>
        <SelectTrigger className="h-8 text-[13px]" aria-label="Group for the new task" data-testid="link-new-group">
          <SelectValue placeholder={groups.isLoading ? "Loading…" : "No groups on this board"} />
        </SelectTrigger>
        <SelectContent>
          {(groups.data ?? []).map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
