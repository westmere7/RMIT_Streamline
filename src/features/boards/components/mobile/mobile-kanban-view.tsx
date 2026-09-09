"use client";

import { ChevronLeft, ChevronRight, MoveRight, Plus } from "lucide-react";
import * as React from "react";
import { MenuSheet } from "@/components/layout/menu-sheet";
import type { MenuAction } from "@/components/layout/row-menu";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Input } from "@/components/ui/input";
import type { Item } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { MobileItemCard } from "@/features/boards/components/mobile/mobile-item-card";
import { useMobileViewPref } from "@/features/boards/components/mobile/mobile-view-prefs";
import { useKanbanLanes, useLaneOptions, type LaneBy } from "@/features/boards/components/views/kanban-lanes";
import { ViewEmpty } from "@/features/boards/components/views/view-shell";
import { colorClasses } from "@/lib/colors";
import { isOverdue } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

/**
 * Kanban on a phone: one lane at a time.
 *
 * Side-by-side lanes need roughly 300px each, so a phone would show one and a
 * sliver — and reaching lane six would mean six swipes past cards that scroll
 * vertically at the same time. Instead the lanes are a strip of tabs and the
 * chosen one fills the screen, which is the same information with one axis of
 * scrolling instead of two.
 *
 * Dragging a card between lanes is a desktop gesture that fights vertical
 * scrolling on a touch screen, so every card carries a "Move to" control that
 * writes exactly what a drop would write — the lane's own `apply`, shared with
 * the desktop view.
 */
export function MobileKanbanView() {
  const { model, mutations, canEdit } = useBoardContext();
  const options = useLaneOptions();
  // Its own key, so choosing a lane grouping on a phone never rewrites the
  // desktop kanban's remembered settings for this board.
  const [chosen, setChosen] = useMobileViewPref<LaneBy | null>(`kanban-laneby:${model.snapshot.board.id}`, null);
  const laneBy: LaneBy = options.some((o) => o.value === chosen) ? chosen! : (options[0]?.value ?? "group");
  const lanes = useKanbanLanes(laneBy);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const stripRef = React.useRef<HTMLDivElement>(null);

  const index = Math.max(0, lanes.findIndex((l) => l.id === activeId));
  const lane = lanes[index] ?? lanes[0];

  // Keep the chosen lane's tab in view when it changes by button rather than tap.
  React.useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [lane?.id]);

  if (options.length === 0) return <ViewEmpty title="Kanban needs something to lane by" description="Add a Status, Priority or People column, or a group, to use the Kanban view." />;
  if (!lane) return <ViewEmpty title="No lanes" description="This board has nothing to lane by yet." />;

  const colors = lane.color ? colorClasses(lane.color) : null;
  const overdue = lane.items.filter((i) => !model.isDone(i.id) && isOverdue(model.dueDateOf(i.id))).length;

  const submit = () => {
    const name = draft.trim();
    if (name && lane.initial) void mutations.createItem({ groupId: lane.initial.groupId, name, values: lane.initial.values });
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="mobile-kanban">
      <div className="shrink-0 border-b border-border/60 px-3 py-2">
        <div role="radiogroup" aria-label="Lanes by" className="mb-2 flex items-center gap-1.5 text-2xs">
          <span className="shrink-0 text-muted-foreground">Lanes by</span>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={laneBy === option.value}
              onClick={() => {
                setChosen(option.value);
                setActiveId(null);
              }}
              className={cn("flex h-9 items-center rounded-full px-3 font-medium", laneBy === option.value ? "bg-foreground text-background" : "border border-border/70 text-muted-foreground")}
              data-testid={`mobile-kanban-laneby-${option.value}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* The lanes as tabs; the strip scrolls, never the page. */}
        <div ref={stripRef} className="-mx-3 overflow-x-auto overscroll-x-contain px-3" role="tablist" aria-label="Lanes">
          <div className="flex w-max items-center gap-1.5">
            {lanes.map((l) => {
              const active = l.id === lane.id;
              const tint = l.color ? colorClasses(l.color) : null;
              return (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveId(l.id)}
                  className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", active ? "border-ring bg-accent-soft/60 text-accent-soft-foreground" : "border-border/70 text-muted-foreground")}
                  data-testid={`mobile-lane-tab-${l.id}`}
                >
                  {l.user ? <UserAvatar user={l.user} size="sm" tooltip={false} /> : tint && <span aria-hidden className={cn("size-2.5 rounded-full", tint.dot)} />}
                  <span className="max-w-32 truncate">{l.name}</span>
                  <span className="tabular opacity-70">{l.items.length}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-2xs text-muted-foreground">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setActiveId(lanes[index - 1]?.id ?? null)}
          aria-label="Previous lane"
          className="flex size-9 items-center justify-center rounded-lg active:bg-accent/70 disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center font-medium text-foreground" aria-live="polite">
          {lane.name} · {lane.items.length} {lane.items.length === 1 ? "item" : "items"}
          {overdue > 0 && <span className="ml-1.5 text-red-600 dark:text-red-400">{overdue} overdue</span>}
        </span>
        <button
          type="button"
          disabled={index === lanes.length - 1}
          onClick={() => setActiveId(lanes[index + 1]?.id ?? null)}
          aria-label="Next lane"
          className="flex size-9 items-center justify-center rounded-lg active:bg-accent/70 disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-3 pb-8">
          <ul className={cn("divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card", colors && `border-l-[3px] ${colors.border}`)}>
            {lane.items.map((item) => (
              <LaneCard key={item.id} item={item} laneId={lane.id} laneBy={laneBy} />
            ))}
            {lane.items.length === 0 && <li className="px-3 py-4 text-[13px] text-muted-foreground">Nothing in this lane.</li>}
            {canEdit && lane.initial && (
              <li>
                {adding ? (
                  <div className="p-2">
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submit();
                        if (e.key === "Escape") {
                          setDraft("");
                          setAdding(false);
                        }
                      }}
                      onBlur={() => {
                        submit();
                        setAdding(false);
                      }}
                      placeholder="Item name"
                      aria-label={`New item in ${lane.name}`}
                      className="h-11 text-base"
                    />
                  </div>
                ) : (
                  <button type="button" onClick={() => setAdding(true)} className="flex min-h-12 w-full items-center gap-2 px-3 text-left text-[13px] text-muted-foreground active:bg-accent/70" data-testid="mobile-kanban-add">
                    <Plus className="size-4" aria-hidden /> Add item
                  </button>
                )}
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * A card in a lane, with the move control the desktop gets by dragging.
 *
 * The group the item belongs to is what the card needs for its own menu; when
 * the lanes are groups that is the lane itself, and otherwise it is whatever
 * group the item sits in.
 */
function LaneCard({ item, laneId, laneBy }: { item: Item; laneId: string; laneBy: LaneBy }) {
  const { model, canEdit } = useBoardContext();
  const lanes = useKanbanLanes(laneBy);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const group = model.groups.find((g) => g.id === item.groupId) ?? model.groups[0];
  if (!group) return null;

  const moveActions: MenuAction[] = lanes
    .filter((l) => l.id !== laneId)
    .map((l) => ({ type: "item", label: l.name, onSelect: () => l.apply(item) }));

  return (
    <>
      <MobileItemCard item={item} group={group} selectMode={false} />
      {canEdit && moveActions.length > 0 && (
        <div className="-mt-1 px-2.5 pb-2">
          <button
            type="button"
            onClick={() => setMoveOpen(true)}
            className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-2xs font-medium text-muted-foreground active:bg-accent/70"
            data-testid="mobile-kanban-move"
          >
            <MoveRight className="size-3.5" aria-hidden /> Move to…
          </button>
          <MenuSheet open={moveOpen} onOpenChange={setMoveOpen} title={`Move “${item.name}” to`} actions={moveActions} />
        </div>
      )}
    </>
  );
}
