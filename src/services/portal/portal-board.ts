import type {
  Board,
  BoardColumn,
  BoardGroup,
  ColorToken,
  ColumnValue,
  EntityId,
  Item,
  ItemAsset,
  ItemColumnValue,
  ItemLink,
  PortalDeliverable,
  PortalStatus,
  PortalSubitem,
  PortalTask,
  PublicBoardPayload,
  StakeholderDepartment,
  User,
} from "@/domain";
import { slugify } from "@/lib/slug";

/**
 * A department's requests, shaped as a board.
 *
 * The portal used to be a list because a department's work is not a board: it
 * is spread across as many boards as the team happens to run, each with its own
 * columns, its own status words and its own idea of what a priority is. A list
 * sidestepped that by publishing a fixed handful of fields.
 *
 * The trouble is that a list is the one thing the app is not good at. Every
 * view the workspace uses — kanban, calendar, timeline, gantt, workload, chart
 * — and the whole item panel already exist, already handle a few hundred rows,
 * and are already exercised on the shared-board link. Giving the portal a
 * *synthetic* board lets it have all of them for free.
 *
 * So this reconciles the boards into one. Statuses that mean the same thing
 * across two boards become one label, priorities become one scale, and the
 * board a request came from becomes the group it sits in. The result is a
 * `PublicBoardPayload` — the same shape the public board link produces — which
 * the read-only memory provider turns into something the real board components
 * can render.
 *
 * **Everything here is built by hand from the portal's own DTOs**, which are
 * themselves an allowlist. No repository row reaches this function, so a column
 * added to `items` later cannot arrive by accident:
 *
 *  · `comments` and `activities` are empty, always. A shared board publishes
 *    both because somebody chose to share that board; a portal task is an
 *    internal task that happens to carry a label, and its thread is internal.
 *  · `description` carries the requester's own brief, never `item.description`
 *    — that field holds the contact details the booking writer appended.
 *  · `createdBy` is nobody. Who opened a task internally is not published.
 *  · Only links between two in-scope requests travel. A link reaching work this
 *    department cannot see would name it.
 */

/** Nobody. Used where a row needs an author and the portal will not name one. */
const NOBODY = "00000000-0000-0000-0000-000000000000";

/** A task, with the parts of it the detail panel needs. */
export interface PortalBoardTask {
  task: PortalTask;
  /** The requester's own words, for tasks that were booked here. */
  brief: string | null;
  deliverables: PortalDeliverable[];
  subitems: PortalSubitem[];
}

export interface PortalBoardInput {
  department: StakeholderDepartment;
  tasks: readonly PortalBoardTask[];
  /** Links whose two ends are both in scope. Anything else is left out. */
  links: readonly ItemLink[];
  workspaceName: string;
  now: string;
}

/** Column ids are derived from the department, so a visitor's widths and view settings persist. */
export function portalColumnId(departmentId: EntityId, key: string): EntityId {
  return `${departmentId}:${key}`;
}

/**
 * The order statuses are shown in.
 *
 * Boards word their statuses differently but they agree on what the words are
 * for, and `role` is that agreement carried across. Ordering by role gives a
 * kanban whose columns read left to right the way work moves, whichever board
 * each request came from.
 */
const ROLE_ORDER: Record<PortalStatus["role"], number> = { pending: 0, working: 1, stuck: 2, done: 3 };

export function buildPortalBoard(input: PortalBoardInput): PublicBoardPayload {
  const { department, tasks, links, workspaceName, now } = input;
  const boardId = department.id;

  // ---- the labels the department's boards between them use --------------------
  const statuses = new Map<string, PortalStatus>();
  const priorities = new Map<string, { name: string; color: ColorToken; strength: number }>();
  for (const { task } of tasks) {
    if (task.status && !statuses.has(task.status.name)) statuses.set(task.status.name, task.status);
    if (task.priority && !priorities.has(task.priority.name)) priorities.set(task.priority.name, task.priority);
  }
  const statusLabels = [...statuses.values()]
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name))
    .map((status) => ({ id: `st-${slugify(status.name)}`, name: status.name, color: status.color, role: status.role }));
  const priorityLabels = [...priorities.values()]
    .sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name))
    .map((priority) => ({ id: `pr-${slugify(priority.name)}`, name: priority.name, color: priority.color }));
  const statusIdByName = new Map(statusLabels.map((label) => [label.name, label.id]));
  const priorityIdByName = new Map(priorityLabels.map((label) => [label.name, label.id]));

  // ---- columns ----------------------------------------------------------------
  const hasTimeline = tasks.some(({ task }) => task.timeline?.start || task.timeline?.end);
  const hasDeliverables = tasks.some(({ task }) => task.deliverables.total > 0);
  const columns: BoardColumn[] = [];
  const column = (key: string, name: string, type: BoardColumn["type"], settings: BoardColumn["settings"], width: number) => {
    columns.push({ id: portalColumnId(boardId, key), boardId, name, type, settings, position: columns.length, width, hidden: false, createdAt: now });
  };

  column(
    "status",
    "Status",
    "STATUS",
    {
      kind: "status",
      labels: statusLabels.map(({ id, name, color }) => ({ id, name, color })),
      doneLabelIds: statusLabels.filter((l) => l.role === "done").map((l) => l.id),
      stuckLabelIds: statusLabels.filter((l) => l.role === "stuck").map((l) => l.id),
      progressLabelIds: statusLabels.filter((l) => l.role === "working").map((l) => l.id),
      defaultLabelId: null,
    },
    150,
  );
  column("priority", "Priority", "PRIORITY", { kind: "priority", labels: priorityLabels }, 120);
  column("people", "Working on it", "PERSON", { kind: "person", allowMultiple: true }, 150);
  column("due", "Due", "DATE", { kind: "none" }, 130);
  if (hasTimeline) column("timeline", "Timeline", "TIMELINE", { kind: "none" }, 190);
  if (hasDeliverables) column("assets", "Deliverables", "ASSETS_RECAP", { kind: "none" }, 150);
  // No "requested" date column. A DATE cell reads a past date as a missed
  // deadline and marks it in red, and every request was made in the past.
  // When it arrived is on the card and in the sort, not flagged as a problem.

  // ---- groups: the board each request is being run on --------------------------
  const sourceNames = [...new Set(tasks.map(({ task }) => task.sourceName ?? "Requests"))].sort((a, b) => a.localeCompare(b));
  const groups: BoardGroup[] = sourceNames.map((name, position) => ({
    id: `${boardId}:g-${slugify(name) || position}`,
    boardId,
    name,
    color: department.color,
    position,
    collapsed: false,
    createdAt: now,
  }));
  const groupIdBySource = new Map(sourceNames.map((name, i) => [name, groups[i]!.id]));

  // ---- items, their values, their deliverables and their steps -----------------
  const items: Item[] = [];
  const values: ItemColumnValue[] = [];
  const assets: ItemAsset[] = [];
  const people = new Map<EntityId, User>();

  const value = (itemId: EntityId, key: string, v: ColumnValue, updatedAt: string) => {
    values.push({ id: `${itemId}:${key}`, itemId, columnId: portalColumnId(boardId, key), value: v, updatedAt });
  };

  tasks.forEach(({ task, brief, deliverables, subitems }, position) => {
    const groupId = groupIdBySource.get(task.sourceName ?? "Requests")!;
    items.push({
      id: task.id,
      boardId,
      groupId,
      parentItemId: null,
      name: task.name,
      // The brief, or nothing. Never the internal description.
      description: brief,
      position,
      createdBy: NOBODY,
      archivedAt: null,
      reference: task.reference,
      createdAt: task.bookedAt,
      updatedAt: task.updatedAt,
    });

    value(task.id, "status", { type: "STATUS", labelId: task.status ? (statusIdByName.get(task.status.name) ?? null) : null }, task.updatedAt);
    value(task.id, "priority", { type: "PRIORITY", labelId: task.priority ? (priorityIdByName.get(task.priority.name) ?? null) : null }, task.updatedAt);
    value(task.id, "people", { type: "PERSON", userIds: task.people.map((person) => person.id) }, task.updatedAt);
    value(task.id, "due", { type: "DATE", date: task.dueDate }, task.updatedAt);
    if (hasTimeline) value(task.id, "timeline", { type: "TIMELINE", start: task.timeline?.start ?? null, end: task.timeline?.end ?? null }, task.updatedAt);
    if (hasDeliverables) {
      const outstanding = deliverables.filter((d) => !d.done);
      const dues = outstanding.map((d) => d.dueDate).filter((d): d is string => !!d).sort();
      value(
        task.id,
        "assets",
        {
          type: "ASSETS_RECAP",
          lines: task.deliverables.total,
          quantity: deliverables.reduce((sum, d) => sum + (d.quantity || 1), 0),
          types: new Set(deliverables.map((d) => d.assetType).filter(Boolean)).size,
          people: new Set(deliverables.flatMap((d) => d.assignees.map((a) => a.id))).size,
          nextDue: dues[0] ?? null,
          overdue: dues.filter((due) => due < now.slice(0, 10)).length,
        },
        task.updatedAt,
      );
    }

    for (const person of task.people) rememberPerson(people, person);

    deliverables.forEach((deliverable, index) => {
      for (const assignee of deliverable.assignees) rememberPerson(people, assignee);
      assets.push({
        id: deliverable.id,
        itemId: task.id,
        boardId,
        name: deliverable.name,
        assetType: deliverable.assetType,
        quantity: deliverable.quantity,
        assigneeIds: deliverable.assignees.map((a) => a.id),
        dueDate: deliverable.dueDate,
        completedAt: deliverable.done ? task.updatedAt : null,
        // Free text on a deliverable is where production notes live.
        notes: null,
        position: index,
        createdBy: NOBODY,
        createdAt: task.bookedAt,
        updatedAt: task.updatedAt,
      });
    });

    subitems.forEach((subitem, index) => {
      items.push({
        id: subitem.id,
        boardId,
        groupId,
        parentItemId: task.id,
        name: subitem.name,
        description: null,
        position: index,
        createdBy: NOBODY,
        archivedAt: null,
        reference: null,
        createdAt: task.bookedAt,
        updatedAt: task.updatedAt,
      });
      const done = statusLabels.find((label) => label.role === "done");
      if (done) value(subitem.id, "status", { type: "STATUS", labelId: subitem.done ? done.id : null }, task.updatedAt);
    });
  });

  const inScope = new Set(items.map((item) => item.id));
  return {
    board: {
      id: boardId,
      workspaceId: department.workspaceId,
      teamId: null,
      name: department.name,
      slug: slugify(department.name) || "portal",
      description: null,
      type: "SHAREABLE",
      visibility: "WORKSPACE",
      ownerId: NOBODY,
      color: department.color,
      icon: "inbox",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    } satisfies Board,
    groups,
    columns,
    items,
    values,
    links: links.filter((link) => inScope.has(link.itemAId) && inScope.has(link.itemBId)),
    assets,
    comments: [],
    activities: [],
    users: [...people.values()],
    workspaceName,
    expiresAt: null,
  };
}

/**
 * A person as an avatar and a name.
 *
 * The board components take a `User`, so one is assembled from the two things
 * the portal publishes about somebody. Their avatar colour is derived from
 * their id (`avatarColorFor`) exactly as it is everywhere else, so nothing has
 * to be carried across for the faces to match. The rest is blank on purpose:
 * no email, no job title, no department.
 */
function rememberPerson(into: Map<EntityId, User>, person: { id: EntityId; displayName: string }): void {
  if (into.has(person.id)) return;
  const [firstName, ...rest] = person.displayName.split(" ");
  into.set(person.id, {
    id: person.id,
    email: "",
    firstName: firstName ?? person.displayName,
    lastName: rest.join(" "),
    displayName: person.displayName,
    avatarUrl: null,
    jobTitle: null,
    department: null,
    timezone: "",
    deactivatedAt: null,
    createdAt: "",
    updatedAt: "",
  });
}
