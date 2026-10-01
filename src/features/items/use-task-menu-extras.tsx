"use client";

import { Bell, BellRing, Check, Eye, Route, Star } from "lucide-react";
import * as React from "react";
import type { MenuAction } from "@/components/layout/row-menu";
import { DEFAULT_ITEM_EVENTS, SUBSCRIPTION_EVENTS, SUBSCRIPTION_EVENT_LABELS, type Item } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { TaskJourneyDialog } from "@/features/journey/task-journey-dialog";
import { useStar, useStarredIds } from "@/features/my-work/hooks";
import { useFollow, useMySubscriptions } from "@/features/notifications/follow-control";
import { useWorkspace } from "@/features/workspace/workspace-context";

/**
 * What the task panel's header and its menu offer that a row's own menu did
 * not: the journey, the star, following, and the columns the panel is keeping
 * back. Shared by the table row and the Kanban card, so a right-click reaches
 * everything the panel does without opening it.
 *
 * `dialogs` mounts the journey only once it is asked for: a board renders
 * hundreds of rows, and none of them needs a dialog until then.
 */
export function useTaskMenuExtras(item: Item, canEdit: boolean): { reading: MenuAction[]; columns: MenuAction[]; dialogs: React.ReactNode } {
  const ws = useWorkspace();
  const { model, mutations } = useBoardContext();
  const starred = useStarredIds(ws.currentUser.id);
  const star = useStar(ws.currentUser.id);
  const subscriptions = useMySubscriptions();
  const follow = useFollow();
  const [journey, setJourney] = React.useState(false);

  const isStarred = starred.data?.has(item.id) ?? false;
  const target = { boardId: item.boardId, itemId: item.id };
  const events = subscriptions.data?.find((s) => s.boardId === item.boardId && s.itemId === item.id)?.events ?? [];
  const following = events.length > 0;

  const reading: MenuAction[] = [
    { type: "item", label: "Task journey", icon: <Route />, onSelect: () => setJourney(true), testId: "menu-task-journey" },
    { type: "item", label: isStarred ? "Unstar" : "Star", icon: <Star className={isStarred ? "fill-amber-400 text-amber-400" : undefined} />, onSelect: () => star.mutate({ items: [item], on: !isStarred }), testId: "menu-star-task" },
    {
      type: "sub",
      label: following ? "Following" : "Follow",
      icon: following ? <BellRing /> : <Bell />,
      contentClassName: "w-56",
      items: [
        following
          ? { type: "item", label: "Stop following", onSelect: () => follow.mutate({ target, events: [] }), testId: "menu-follow-stop" }
          : { type: "item", label: "Follow this task", onSelect: () => follow.mutate({ target, events: DEFAULT_ITEM_EVENTS }), testId: "menu-follow-start" },
        { type: "separator" },
        // Each tick saves at once and keeps the menu open, as the panel's bell does.
        ...SUBSCRIPTION_EVENTS.map(
          (event): MenuAction => ({
            type: "item",
            label: SUBSCRIPTION_EVENT_LABELS[event],
            icon: events.includes(event) ? <Check /> : <span aria-hidden className="size-4" />,
            keepOpen: true,
            onSelect: () => follow.mutate({ target, events: events.includes(event) ? events.filter((e) => e !== event) : [...events, event] }),
            testId: `menu-follow-event-${event}`,
          }),
        ),
      ],
    },
  ];

  // The way back for a column hidden from the panel or the board, as the panel's menu has it.
  const hiddenHere = model.columns.filter((c) => c.hiddenInPanel);
  const hiddenOnBoard = model.columns.filter((c) => c.hidden);
  const columns: MenuAction[] =
    canEdit && (hiddenHere.length > 0 || hiddenOnBoard.length > 0)
      ? [
          {
            type: "sub",
            label: "Hidden columns",
            icon: <Eye />,
            contentClassName: "w-56",
            items: [
              ...hiddenHere.map((column): MenuAction => ({ type: "item", label: column.name, hint: "panel", icon: <Eye />, onSelect: () => void mutations.updateColumn(column.id, { hiddenInPanel: false }) })),
              ...hiddenOnBoard.map((column): MenuAction => ({ type: "item", label: column.name, hint: "board", icon: <Eye />, onSelect: () => void mutations.updateColumn(column.id, { hidden: false }) })),
              { type: "separator" },
              {
                type: "item",
                label: "Show all columns",
                icon: <Eye />,
                onSelect: () => {
                  for (const column of new Set([...hiddenHere, ...hiddenOnBoard])) void mutations.updateColumn(column.id, { hidden: false, hiddenInPanel: false });
                },
              },
            ],
          },
        ]
      : [];

  const dialogs = journey ? <TaskJourneyDialog item={item} open onOpenChange={setJourney} /> : null;
  return { reading, columns, dialogs };
}
