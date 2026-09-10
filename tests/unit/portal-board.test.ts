import { describe, expect, it } from "vitest";
import type { Comment, ItemLink, PortalPerson, PortalTask, StakeholderDepartment } from "@/domain";
import { buildPortalBoard, type PortalBoardTask } from "@/services/portal/portal-board";

const DEPARTMENT: StakeholderDepartment = {
  id: "dept-1",
  workspaceId: "ws-1",
  name: "Comm.",
  color: "blue",
  position: 0,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function task(overrides: Partial<PortalTask> & { id: string }): PortalTask {
  return {
    reference: null,
    name: `Task ${overrides.id}`,
    status: null,
    priority: null,
    dueDate: null,
    timeline: null,
    people: [],
    sourceName: "Creative Request VN",
    assetTypes: [],
    deliverables: { total: 0, done: 0 },
    subitems: { total: 0, done: 0 },
    linkedCount: 0,
    bookedAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

const entry = (t: PortalTask, extra: Partial<PortalBoardTask> = {}): PortalBoardTask => ({
  task: t,
  brief: null,
  deliverables: [],
  subitems: [],
  ...extra,
});

const build = (tasks: PortalBoardTask[], links: ItemLink[] = [], comments: Comment[] = [], commentAuthors: PortalPerson[] = []) =>
  buildPortalBoard({ department: DEPARTMENT, tasks, links, comments, commentAuthors, workspaceName: "RMIT Marketing Team", now: "2026-09-09T00:00:00.000Z" });


const comment = (id: string, itemId: string, authorId: string, body: string): Comment => ({
  id,
  itemId,
  authorId,
  body,
  mentionUserIds: ["someone-internal"],
  sharedId: null,
  createdAt: `2026-09-0${id.length}T00:00:00.000Z`,
  updatedAt: "2026-09-09T00:00:00.000Z",
});

/**
 * A department's requests, shaped as a board.
 *
 * Two things are being checked. That the reconciliation is right — several
 * boards' statuses becoming one set of labels, several boards becoming groups —
 * and that the allowlist survives the change of shape, because a board payload
 * has a great many more fields to fill in than a list did.
 */
describe("a department's requests as a board", () => {
  const inProgress = { name: "In Progress", color: "orange" as const, role: "working" as const };
  const shipped = { name: "Shipped", color: "green" as const, role: "done" as const };
  const blocked = { name: "Blocked", color: "red" as const, role: "stuck" as const };

  it("makes one label set out of statuses that came from different boards", () => {
    const payload = build([
      entry(task({ id: "a", status: inProgress, sourceName: "Board A" })),
      entry(task({ id: "b", status: shipped, sourceName: "Board B" })),
      entry(task({ id: "c", status: inProgress, sourceName: "Board B" })),
    ]);

    const status = payload.columns.find((c) => c.type === "STATUS")!;
    expect(status.settings.kind).toBe("status");
    if (status.settings.kind !== "status") throw new Error("unreachable");
    // Once each, and the meanings carried across rather than the label ids.
    expect(status.settings.labels.map((l) => l.name)).toEqual(["In Progress", "Shipped"]);
    expect(status.settings.doneLabelIds).toHaveLength(1);
    expect(status.settings.progressLabelIds).toHaveLength(1);

    const done = status.settings.doneLabelIds[0];
    const forB = payload.values.find((v) => v.itemId === "b" && v.columnId === status.id)!;
    expect(forB.value).toEqual({ type: "STATUS", labelId: done });
  });

  it("orders the labels the way work moves, not the way it arrived", () => {
    const payload = build([entry(task({ id: "a", status: shipped })), entry(task({ id: "b", status: blocked })), entry(task({ id: "c", status: inProgress }))]);
    const status = payload.columns.find((c) => c.type === "STATUS")!;
    if (status.settings.kind !== "status") throw new Error("unreachable");
    expect(status.settings.labels.map((l) => l.name)).toEqual(["In Progress", "Blocked", "Shipped"]);
  });

  it("maps priority onto the scale the app actually renders", () => {
    // columnLabels() returns DEFAULT_PRIORITY_LABELS for any PRIORITY column,
    // whatever the column stores, so a label id invented here renders as an
    // empty cell. This is that regression, pinned.
    const payload = build([
      entry(task({ id: "a", priority: { name: "High", color: "orange", strength: 2 } })),
      entry(task({ id: "b", priority: { name: "Critical", color: "rose", strength: 3 } })),
      // A board that words it differently still lands on the right step.
      entry(task({ id: "c", priority: { name: "Nice to have", color: "gray", strength: 0 } })),
      entry(task({ id: "d" })),
    ]);

    const priority = payload.columns.find((c) => c.type === "PRIORITY")!;
    if (priority.settings.kind !== "priority") throw new Error("unreachable");
    expect(priority.settings.labels.map((l) => l.id)).toEqual(["critical", "high", "medium", "low"]);

    const labelOf = (id: string) => {
      const value = payload.values.find((v) => v.itemId === id && v.columnId === priority.id)!.value;
      return value.type === "PRIORITY" ? value.labelId : "wrong type";
    };
    expect(labelOf("a")).toBe("high");
    expect(labelOf("b")).toBe("critical");
    expect(labelOf("c")).toBe("low");
    expect(labelOf("d")).toBeNull();
  });

  it("groups by the board the work is being run on", () => {
    const payload = build([
      entry(task({ id: "a", sourceName: "Open Day 2026" })),
      entry(task({ id: "b", sourceName: "Creative Request VN" })),
      entry(task({ id: "c", sourceName: "Open Day 2026" })),
      entry(task({ id: "d", sourceName: null })),
    ]);

    expect(payload.groups.map((g) => g.name)).toEqual(["Creative Request VN", "Open Day 2026", "Requests"]);
    const byName = new Map(payload.groups.map((g) => [g.name, g.id]));
    const groupOf = (id: string) => payload.items.find((i) => i.id === id)!.groupId;
    expect(groupOf("a")).toBe(byName.get("Open Day 2026"));
    expect(groupOf("c")).toBe(byName.get("Open Day 2026"));
    expect(groupOf("d")).toBe(byName.get("Requests"));
  });

  it("leaves out the columns nothing would fill", () => {
    const bare = build([entry(task({ id: "a" }))]);
    expect(bare.columns.map((c) => c.name)).toEqual(["Requested", "Status", "Priority", "Working on it", "Due"]);

    const rich = build([
      entry(task({ id: "a", timeline: { start: "2026-09-01", end: "2026-09-30" }, deliverables: { total: 2, done: 1 } }), {
        deliverables: [
          { id: "d1", name: "Poster", assetType: "Print", quantity: 1, dueDate: null, done: false, assignees: [] },
          { id: "d2", name: "Tile", assetType: "Social", quantity: 1, dueDate: null, done: true, assignees: [] },
        ],
      }),
    ]);
    expect(rich.columns.map((c) => c.name)).toContain("Timeline");
    expect(rich.columns.map((c) => c.name)).toContain("Deliverables");
    const types = rich.columns.find((c) => c.name === "Asset types")!;
    expect(types.type).toBe("TAGS");
    if (types.settings.kind !== "tags") throw new Error("unreachable");
    expect(types.settings.options.map((o) => o.name)).toEqual(["Print", "Social"]);
    const value = rich.values.find((v) => v.columnId === types.id)!.value;
    expect(value).toEqual({ type: "TAGS", tags: ["Print", "Social"] });
  });

  it("shows when the request arrived, as plain text and first", () => {
    // First column, and never a DATE: a DATE cell marks any past date on
    // unfinished work as overdue, and every request was made in the past.
    const payload = build([entry(task({ id: "a", bookedAt: "2026-09-01T00:00:00.000Z" }))]);
    expect(payload.columns[0]!.name).toBe("Requested");
    expect(payload.columns[0]!.type).toBe("TEXT");
    const value = payload.values.find((v) => v.columnId === payload.columns[0]!.id)!.value;
    expect(value.type).toBe("TEXT");
    if (value.type !== "TEXT") throw new Error("unreachable");
    expect(value.text).toMatch(/Sep/);
  });

  it("carries the requester's brief as the description, and nothing else", () => {
    const payload = build([entry(task({ id: "a" }), { brief: "Six A1 posters, print ready." }), entry(task({ id: "b" }))]);
    expect(payload.items.find((i) => i.id === "a")!.description).toBe("Six A1 posters, print ready.");
    // A labelled task was never booked here, so it has no brief and must not
    // borrow items.description for one.
    expect(payload.items.find((i) => i.id === "b")!.description).toBeNull();
  });

  it("publishes nothing internal", () => {
    const payload = build([
      entry(task({ id: "a", people: [{ id: "u1", displayName: "Jane Morrison", initials: "JM", color: "pink" }] }), {
        brief: "A brief.",
        deliverables: [{ id: "d1", name: "A1 poster", assetType: "Print", quantity: 6, dueDate: "2026-09-20", done: false, assignees: [] }],
      }),
    ]);

    // The activity log is an audit trail of who changed which field; it never
    // travels. Updates do — see the test below.
    expect(payload.activities).toEqual([]);
    // Nobody is named as the author of anything.
    expect(payload.items.every((i) => i.createdBy === "00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(payload.board.ownerId).toBe("00000000-0000-0000-0000-000000000000");
    // A person is a name and a face; their email is not published.
    expect(payload.users.map((u) => u.email)).toEqual([""]);
    expect(payload.users[0]!.displayName).toBe("Jane Morrison");
    // Production notes on a deliverable stay internal.
    expect(payload.assets.every((a) => a.notes === null)).toBe(true);
  });

  it("publishes the update thread on a published task, and only there", () => {
    const author: PortalPerson = { id: "u9", displayName: "Minh Hoang", initials: "MH", color: "sky" };
    const payload = build(
      [entry(task({ id: "a" }))],
      [],
      [comment("c1", "a", "u9", "Proofs are with the printer."), comment("c22", "somewhere-else", "u9", "Not this department's business.")],
      [author],
    );

    expect(payload.comments.map((c) => c.body)).toEqual(["Proofs are with the printer."]);
    // The author is named the same way an assignee is, and nothing more.
    expect(payload.users.find((u) => u.id === "u9")?.displayName).toBe("Minh Hoang");
    expect(payload.users.find((u) => u.id === "u9")?.email).toBe("");
    // Mentions are internal routing and would name people who are not on the work.
    expect(payload.comments[0]!.mentionUserIds).toEqual([]);
  });

  it("keeps a link only when it names two requests this department can see", () => {
    const link = (id: string, a: string, b: string): ItemLink => ({ id, workspaceId: "ws-1", itemAId: a, itemBId: b, excluded: [], createdBy: "u1", createdAt: "" });
    const payload = build([entry(task({ id: "a" })), entry(task({ id: "b" }))], [link("l1", "a", "b"), link("l2", "a", "secret-item-on-another-board")]);

    expect(payload.links.map((l) => l.id)).toEqual(["l1"]);
  });

  it("leaves out the columns the team has hidden, and their values with them", () => {
    const rich = () =>
      entry(task({ id: "a", priority: { name: "High", color: "orange", strength: 2 }, dueDate: "2026-09-20", deliverables: { total: 1, done: 0 } }), {
        deliverables: [{ id: "d1", name: "Poster", assetType: "Print", quantity: 1, dueDate: null, done: false, assignees: [] }],
      });

    const all = build([rich()]);
    expect(all.columns.map((c) => c.name)).toContain("Priority");

    const trimmed = buildPortalBoard({
      department: DEPARTMENT,
      tasks: [rich()],
      links: [],
      comments: [],
      commentAuthors: [],
      hiddenColumns: ["priority", "requested", "asset-types"],
      workspaceName: "RMIT Marketing Team",
      now: "2026-09-09T00:00:00.000Z",
    });
    expect(trimmed.columns.map((c) => c.name)).not.toContain("Priority");
    expect(trimmed.columns.map((c) => c.name)).not.toContain("Requested");
    expect(trimmed.columns.map((c) => c.name)).not.toContain("Asset types");
    expect(trimmed.columns.map((c) => c.name)).toContain("Due");
    // A value with no column is dead weight, and the panel reads its fields
    // from the columns, so the two have to agree.
    const columnIds = new Set(trimmed.columns.map((c) => c.id));
    expect(trimmed.values.every((v) => columnIds.has(v.columnId))).toBe(true);
  });

  it("gives the same department the same ids every time, so a visitor's settings stick", () => {
    const once = build([entry(task({ id: "a", status: inProgress }))]);
    const twice = build([entry(task({ id: "a", status: inProgress }))]);
    expect(twice.board.id).toBe(once.board.id);
    expect(twice.columns.map((c) => c.id)).toEqual(once.columns.map((c) => c.id));
    expect(twice.groups.map((g) => g.id)).toEqual(once.groups.map((g) => g.id));
  });

  it("shows the asset types a request asked for, not only the ones its deliverables carry", () => {
    const payload = build([
      // Two kinds named on the request: the booking writer cannot put both on a
      // deliverable, so the request is the only place they exist.
      entry(task({ id: "a", assetTypes: ["Print", "Social"] })),
      // One kind, which did reach the deliverable.
      entry(task({ id: "b", assetTypes: ["Digital"], deliverables: { total: 1, done: 0 } }), {
        deliverables: [{ id: "d1", name: "Tile", assetType: "Digital", quantity: 1, dueDate: null, done: false, assignees: [] }],
      }),
    ]);

    const column = payload.columns.find((c) => c.name === "Asset types")!;
    expect(column).toBeDefined();
    if (column.settings.kind !== "tags") throw new Error("unreachable");
    expect(column.settings.options.map((o) => o.name)).toEqual(["Digital", "Print", "Social"]);

    const tagsOf = (id: string) => {
      const value = payload.values.find((v) => v.itemId === id && v.columnId === column.id)!.value;
      return value.type === "TAGS" ? value.tags : ["wrong type"];
    };
    expect(tagsOf("a")).toEqual(["Print", "Social"]);
    expect(tagsOf("b")).toEqual(["Digital"]);
  });

  it("hangs subitems off their request rather than beside it", () => {
    const payload = build([
      entry(task({ id: "a", subitems: { total: 2, done: 1 } }), {
        subitems: [
          { id: "s1", name: "Draft", done: true },
          { id: "s2", name: "Print", done: false },
        ],
      }),
    ]);

    expect(payload.items.filter((i) => i.parentItemId === "a").map((i) => i.name)).toEqual(["Draft", "Print"]);
    expect(payload.items.filter((i) => i.parentItemId === null)).toHaveLength(1);
  });
});
