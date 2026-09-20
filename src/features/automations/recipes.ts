import { AlarmClock, Archive, CalendarPlus, CalendarSync, CalendarX, CircleCheck, Hourglass, ListTree, TriangleAlert, UserPlus, type LucideIcon } from "lucide-react";
import type { AutomationAction, AutomationTrigger, BoardColumn, BoardGroup, ColumnLabel, StatusLabelRole } from "@/domain";
import { columnLabels, resolveColumnRoles, statusLabelRole } from "@/domain";

/**
 * Ready-made automations, offered as a row of cards.
 *
 * The builder is fine once somebody knows what they want to build, and useless
 * before that: an empty trigger picker does not tell you what a board could do
 * on its own. These are the half-dozen arrangements people actually ask for,
 * each one click from existing.
 *
 * The hard part is that a recipe cannot name a column, because every board
 * words its own differently. It asks for a *role* instead — the status column,
 * the due date, the person in charge — which `resolveColumnRoles` already
 * answers for any board in the workspace (src/domain/board/column-role.ts).
 * A recipe whose roles a board cannot fill is offered greyed out with the
 * reason, rather than left out: "this board has no date column" is a more
 * useful thing to read than a shorter list.
 */

export interface Recipe {
  id: string;
  /** The sentence on the card, with the board's own words already in it. */
  title: string;
  description: string;
  /**
   * The icon itself rather than its name: `DynamicIcon` draws from a curated set
   * chosen for boards and teams, and these eight have nothing to do with that
   * set. Adding them to it would put a clock in the board icon picker.
   */
  icon: LucideIcon;
  build: (board: RecipeBoard) => { trigger: AutomationTrigger; actions: AutomationAction[] } | null;
  /** Why it cannot be offered on this board, when it cannot. */
  unavailable?: (board: RecipeBoard) => string | null;
}

export interface RecipeBoard {
  columns: readonly BoardColumn[];
  groups: readonly BoardGroup[];
}

/**
 * The board's status column and the label that carries a given meaning.
 *
 * By role first, by wording second. Every board words these differently —
 * "Done" may be "Shipped", "Stuck" may be "Blocked" — and the role is a
 * property the board has already been asked about, so it is the truthful
 * answer. The name match is a fallback for boards nobody has labelled yet.
 */
function labelWithRole(board: RecipeBoard, role: StatusLabelRole, wording: RegExp): { column: BoardColumn; label: ColumnLabel } | null {
  const status = resolveColumnRoles(board.columns).status ?? board.columns.find((c) => c.type === "STATUS");
  if (!status || status.settings.kind !== "status") return null;
  const settings = status.settings;
  const labels = columnLabels(status);
  const label = labels.find((l) => statusLabelRole(settings, l.id) === role) ?? labels.find((l) => wording.test(l.name));
  return label ? { column: status, label } : null;
}

const done = (board: RecipeBoard) => labelWithRole(board, "done", /done|complete|ship/i);
const stuck = (board: RecipeBoard) => labelWithRole(board, "stuck", /stuck|block/i);

const dueDate = (board: RecipeBoard) =>
  resolveColumnRoles(board.columns).dueDate ?? board.columns.find((c) => c.type === "DATE" || c.type === "TIMELINE") ?? null;

const person = (board: RecipeBoard) =>
  resolveColumnRoles(board.columns).pic ?? board.columns.find((c) => c.type === "PERSON" || c.type === "PEOPLE") ?? null;

export const RECIPES: Recipe[] = [
  {
    id: "notify-on-done",
    title: "Tell everybody when a task is finished",
    description: "When the status becomes done, the people on the task hear about it.",
    icon: CircleCheck,
    unavailable: (board) => (done(board) ? null : "This board has no status column with a “done” label."),
    build: (board) => {
      const it = done(board);
      if (!it) return null;
      return {
        trigger: { kind: "column_set_to", columnId: it.column.id, labelId: it.label.id },
        actions: [{ kind: "notify", audience: "people_on_item", message: "{item} is {column:" + it.column.name + "}" }],
      };
    },
  },
  {
    id: "deadline-reminder",
    title: "Remind people two days before a deadline",
    description: "At nine in the morning, two days out, everybody on the task is told.",
    icon: AlarmClock,
    unavailable: (board) => (dueDate(board) ? null : "This board has no date column."),
    build: (board) => {
      const due = dueDate(board);
      if (!due) return null;
      return {
        trigger: { kind: "date_arrives", columnId: due.id, offsetDays: -2, atHour: 9 },
        actions: [{ kind: "notify", audience: "people_on_item", message: "{item} is due in two days" }],
      };
    },
  },
  {
    id: "overdue-chase",
    title: "Chase anything that runs past its date",
    description: "The morning after a deadline passes, the task's people get a nudge.",
    icon: CalendarX,
    unavailable: (board) => (dueDate(board) ? null : "This board has no date column."),
    build: (board) => {
      const due = dueDate(board);
      if (!due) return null;
      return {
        trigger: { kind: "date_arrives", columnId: due.id, offsetDays: 1, atHour: 9 },
        actions: [{ kind: "notify", audience: "people_on_item", message: "{item} was due yesterday" }],
      };
    },
  },
  {
    id: "stuck-escalation",
    title: "Raise anything that gets stuck",
    description: "The moment a task is marked stuck, the board's owners are told.",
    icon: TriangleAlert,
    unavailable: (board) => (stuck(board) ? null : "This board has no status label meaning “stuck”."),
    build: (board) => {
      const it = stuck(board);
      if (!it) return null;
      return {
        trigger: { kind: "column_set_to", columnId: it.column.id, labelId: it.label.id },
        actions: [{ kind: "notify", audience: "board_owners", message: "{item} is stuck — {actor} just said so" }],
      };
    },
  },
  {
    id: "welcome-new-task",
    title: "Give every new task a deadline",
    description: "Anything added to the board gets a date a week out, so nothing sits undated.",
    icon: CalendarPlus,
    unavailable: (board) => (dueDate(board) ? null : "This board has no date column."),
    build: (board) => {
      const due = dueDate(board);
      if (!due) return null;
      return {
        trigger: { kind: "item_created" },
        actions: [{ kind: "set_date_relative", columnId: due.id, days: 7 }],
      };
    },
  },
  {
    id: "assign-on-create",
    title: "Put whoever adds a task on it",
    description: "The person who creates a task becomes the person in charge of it.",
    icon: UserPlus,
    unavailable: (board) => (person(board) ? null : "This board has no people column."),
    build: (board) => {
      const who = person(board);
      if (!who) return null;
      return {
        trigger: { kind: "item_created" },
        actions: [{ kind: "assign_person", columnId: who.id, userIds: [], useActor: true }],
      };
    },
  },
  {
    id: "weekly-review",
    title: "Create a weekly review task",
    description: "Every Monday at nine, a task appears in the board's first group.",
    icon: CalendarSync,
    unavailable: (board) => (board.groups.length > 0 ? null : "This board has no groups to put a task in."),
    build: (board) => {
      const group = board.groups[0];
      if (!group) return null;
      return {
        trigger: { kind: "recurring", recurrence: "weekly", weekday: 1, atHour: 9 },
        actions: [{ kind: "create_item", groupId: group.id, name: "Weekly review — {today}" }],
      };
    },
  },
  {
    id: "stale-flag",
    title: "Flag anything that sits still for a week",
    description: "When a task's status has not moved in seven days, the people on it are asked about it at nine.",
    icon: Hourglass,
    unavailable: (board) => (board.columns.some((c) => c.type === "STATUS") ? null : "This board has no status column."),
    build: (board) => {
      const status = resolveColumnRoles(board.columns).status ?? board.columns.find((c) => c.type === "STATUS");
      if (!status) return null;
      return {
        trigger: { kind: "column_unchanged_for", columnId: status.id, days: 7, atHour: 9 },
        actions: [{ kind: "notify", audience: "people_on_item", message: "{item} has not moved in a week — still on track?" }],
      };
    },
  },
  {
    id: "subitems-follow-parent",
    title: "Finish the subitems with the task",
    description: "When a task is marked done, every subitem under it is marked done too.",
    icon: ListTree,
    unavailable: (board) => (done(board) ? null : "This board has no status column with a “done” label."),
    build: (board) => {
      const it = done(board);
      if (!it) return null;
      return {
        trigger: { kind: "column_set_to", columnId: it.column.id, labelId: it.label.id },
        actions: [{ kind: "set_subitems_value", columnId: it.column.id, value: { type: "STATUS", labelId: it.label.id } }],
      };
    },
  },
  {
    id: "archive-done",
    title: "Tidy finished work away",
    description: "A task marked done is archived, so the board only shows live work.",
    icon: Archive,
    unavailable: (board) => (done(board) ? null : "This board has no status column with a “done” label."),
    build: (board) => {
      const it = done(board);
      if (!it) return null;
      return {
        trigger: { kind: "column_set_to", columnId: it.column.id, labelId: it.label.id },
        actions: [{ kind: "archive_item" }],
      };
    },
  },
];
