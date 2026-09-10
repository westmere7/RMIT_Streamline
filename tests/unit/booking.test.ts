import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BoardColumn, BookingRequest, ColumnType, PriorityColumnSettings, TagsColumnSettings } from "@/domain";
import { bookingReference, customFields, defaultBookingFormTemplate, defaultSettingsFor, DEFAULT_COLUMN_WIDTHS, newCustomField, standardFieldFor } from "@/domain";
import { boardRoleFor, buildPermissionContext, canViewBoard } from "@/lib/permissions/permissions";
import { createServices } from "@/services";
import { bookingRequestSchema, describeBooking, extraFieldsFor, mapBookingToColumns, planStandardFields, resolveBookingTemplate, validateBookingAgainstTemplate } from "@/services/booking";
import { taskAllocationColumns } from "@/services/booking-service";

const column = (name: string, type: ColumnType, position: number, settings = defaultSettingsFor(type)): BoardColumn => ({
  id: `col-${position}`,
  boardId: "board",
  name,
  type,
  settings,
  position,
  width: DEFAULT_COLUMN_WIDTHS[type],
  hidden: false,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const request = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  requesterName: "Priya Nair",
  requesterEmail: "priya@rmit.edu.au",
  department: "School of Design",
  title: "Open Day wayfinding posters",
  brief: "Six A1 posters for the Brunswick campus, brand compliant, print ready by the due date.",
  assetTypes: ["Print"],
  assets: [
    { name: "A1 poster", quantity: 6, spec: "594×841 mm, CMYK, print ready" },
    { name: "Instagram tile", quantity: null, spec: null },
  ],
  teamId: null,
  dueDate: "2026-10-01",
  priority: "High",
  referenceUrl: "https://example.com/brief",
  extra: {},
  answers: {},
  ...overrides,
});

describe("placing a booking's answers on a board", () => {
  it("finds a home for every standard answer on the Task Allocation board", () => {
    const columns = taskAllocationColumns(["Digital", "Brand"]).map((c, i) => column(c.name, c.type, i, c.settings ?? defaultSettingsFor(c.type)));
    const plan = planStandardFields(columns);
    expect(plan.requesterName?.name).toBe("Requester");
    expect(plan.requesterEmail?.name).toBe("Email");
    expect(plan.department?.name).toBe("Department");
    expect(plan.assetTypes?.name).toBe("Asset type");
    expect(plan.assets?.name).toBe("Assets & specs");
    expect(plan.team?.name).toBe("Requested team");
    expect(plan.dueDate?.name).toBe("Due Date");
    expect(plan.priority?.name).toBe("Priority");
    expect(plan.referenceUrl?.name).toBe("Reference");
    // "Allocated to" is the manager's; the form never asks about it.
    expect(extraFieldsFor(columns)).toEqual([]);

    const placement = mapBookingToColumns(request(), columns, { team: { id: "t", name: "Brand" } });
    expect(placement.leftover).toEqual([]);
    const byName = new Map(placement.values.map((v) => [columns.find((c) => c.id === v.columnId)!.name, v.value]));
    expect(byName.get("Requester")).toEqual({ type: "TEXT", text: "Priya Nair" });
    expect(byName.get("Asset type")).toEqual({ type: "TAGS", tags: ["Print"] });
    expect(byName.get("Assets & specs")).toEqual({ type: "LONG_TEXT", text: "1. A1 poster ×6 — 594×841 mm, CMYK, print ready\n2. Instagram tile" });
    expect(byName.get("Requested team")).toEqual({ type: "TAGS", tags: ["Brand"] });
    expect(byName.get("Due Date")).toEqual({ type: "DATE", date: "2026-10-01" });
    expect(byName.get("Priority")).toEqual({ type: "PRIORITY", labelId: "high" });
    expect(byName.get("Reference")).toEqual({ type: "LINK", url: "https://example.com/brief", text: null });
    expect(describeBooking(request(), placement)).toBe(request().brief);
  });

  it("adapts to a team board with different columns and keeps the rest in the description", () => {
    // The "Creative Production" template: no requester, email or link columns.
    const columns = [
      column("Designer", "PERSON", 0),
      column("Status", "STATUS", 1),
      column("Priority", "PRIORITY", 2),
      column("Due Date", "DATE", 3),
      column("Format", "TEXT", 4),
      column("Market", "TAGS", 5, { kind: "tags", options: [{ name: "Vietnam", color: "red" }, { name: "Melbourne", color: "navy" }] }),
    ];
    const plan = planStandardFields(columns);
    expect(plan.requesterName).toBeNull();
    expect(plan.assetTypes?.name).toBe("Format");
    expect(plan.dueDate?.name).toBe("Due Date");
    expect(plan.priority?.name).toBe("Priority");
    expect(plan.referenceUrl).toBeNull();

    // Market is the one column the standard questions leave untouched: the form asks about it.
    const extras = extraFieldsFor(columns);
    expect(extras.map((f) => f.name)).toEqual(["Market"]);
    expect(extras[0]!.options?.map((o) => o.name)).toEqual(["Vietnam", "Melbourne"]);

    const req = request({ assetTypes: ["Print", "Digital"], extra: { "col-5": { type: "TAGS", tags: ["Vietnam"] }, "col-4": { type: "TEXT", text: "ignored: Format is spoken for" } } });
    const placement = mapBookingToColumns(req, columns, { team: { id: "t", name: "Vietnam Creative" } });
    const byName = new Map(placement.values.map((v) => [columns.find((c) => c.id === v.columnId)!.name, v.value]));
    expect(byName.get("Format")).toEqual({ type: "TEXT", text: "Print, Digital" });
    expect(byName.get("Market")).toEqual({ type: "TAGS", tags: ["Vietnam"] });
    expect(byName.has("Designer")).toBe(false);
    expect(placement.leftover.map((l) => l.label)).toEqual(["Requester", "Email", "Department", "Assets & specs", "Requested team", "Reference"]);

    const description = describeBooking(req, placement);
    expect(description).toContain(req.brief);
    expect(description).toContain("Requester: Priya Nair");
    expect(description).toContain("Assets & specs:\n  1. A1 poster ×6 — 594×841 mm, CMYK, print ready\n  2. Instagram tile");
    expect(description).toContain("Email: priya@rmit.edu.au");
    expect(description).toContain("Reference: https://example.com/brief");
  });

  it("matches priorities by label name and writes a due date into a lone timeline", () => {
    const priority = column("Urgency", "PRIORITY", 0, { kind: "priority", labels: [{ id: "p1", name: "Rush", color: "red" }, { id: "p2", name: "high", color: "orange" }] } satisfies PriorityColumnSettings);
    const timeline = column("Schedule", "TIMELINE", 1);
    const placement = mapBookingToColumns(request({ priority: "High" }), [priority, timeline], { team: null });
    expect(placement.values).toContainEqual({ columnId: priority.id, value: { type: "PRIORITY", labelId: "p2" } });
    expect(placement.values).toContainEqual({ columnId: timeline.id, value: { type: "TIMELINE", start: null, end: "2026-10-01" } });
    // A priority the board does not know goes to the description rather than nowhere.
    const unknown = mapBookingToColumns(request({ priority: "Whenever" }), [priority], { team: null });
    expect(unknown.leftover.find((l) => l.field === "priority")?.text).toBe("Whenever");
  });

  it("validates what a stakeholder sends", () => {
    expect(bookingRequestSchema.safeParse(request()).success).toBe(true);
    expect(bookingRequestSchema.safeParse(request({ requesterEmail: "not-an-email" })).success).toBe(false);
    expect(bookingRequestSchema.safeParse(request({ brief: "short" })).success).toBe(false);
    expect(bookingRequestSchema.safeParse(request({ referenceUrl: "javascript:alert(1)" })).success).toBe(false);
    expect(bookingRequestSchema.safeParse(request({ dueDate: "next week" })).success).toBe(false);
    const parsed = bookingRequestSchema.parse({ ...request(), department: undefined, extra: undefined, assetTypes: undefined });
    expect(parsed.department).toBeNull();
    expect(parsed.extra).toEqual({});
    expect(parsed.assetTypes).toEqual([]);
  });
});

describe("the built-in Admin team and Task Allocation board", () => {
  let services: ReturnType<typeof createServices>;
  const owner = SEED_USER_IDS.danh;
  beforeEach(() => {
    services = createServices(createLocalRepositories({ databaseName: `booking-${Date.now()}-${Math.random()}` }));
  });

  it("are created once, with a booking key, and never twice", async () => {
    const first = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    expect(first.team.name).toBe("Admin");
    expect(first.team.system).toBe("ADMIN");
    expect(first.board.name).toBe("Task Allocation");
    expect(first.board.system).toBe("TASK_ALLOCATION");
    expect(first.board.teamId).toBe(first.team.id);
    expect(first.workspace.bookingKey).toMatch(/^[a-z0-9]{24}$/);

    const second = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    expect(second.team.id).toBe(first.team.id);
    expect(second.board.id).toBe(first.board.id);
    expect(second.workspace.bookingKey).toBe(first.workspace.bookingKey);
    const teams = await services.repos.teams.listByWorkspace(SEED_WORKSPACE_ID);
    expect(teams.filter((t) => t.system).length).toBe(1);

    const columns = await services.repos.boards.listColumns(first.board.id);
    expect(columns.map((c) => c.name)).toEqual(["Requester", "Email", "Department", "Stakeholder", "Asset type", "Assets & specs", "Requested team", "Status", "Priority", "Due Date", "Reference", "Assets recap", "Allocated to"]);
    const teamTags = columns.find((c) => c.name === "Requested team")!.settings as TagsColumnSettings;
    expect(teamTags.options.map((o) => o.name)).toContain("Digital");
    expect(teamTags.options.map((o) => o.name)).not.toContain("Admin");
  });

  it("can be renamed but not archived or deleted", async () => {
    const { team, board } = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    const renamedTeam = await services.workspace.updateTeam(team.id, { name: "Creative management" });
    expect(renamedTeam.name).toBe("Creative management");
    const renamedBoard = await services.boards.updateBoard(board.id, { name: "Intake" }, owner);
    expect(renamedBoard.name).toBe("Intake");
    await expect(services.workspace.archiveTeam(team.id, true)).rejects.toThrow(/built in/);
    await expect(services.boards.archiveBoard(board.id, owner)).rejects.toThrow(/built in/);
    await expect(services.boards.deleteBoard(board.id)).rejects.toThrow(/built in/);
    await expect(services.boards.updateBoard(board.id, { teamId: null }, owner)).rejects.toThrow(/built in/);
    // Still there, still theirs.
    const again = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    expect(again.board.id).toBe(board.id);
    expect(again.board.name).toBe("Intake");
  });

  it("are visible to workspace admins only", async () => {
    const { board } = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    const [members, teamMembers, boardMembers] = await Promise.all([
      services.repos.workspaces.listMembers(SEED_WORKSPACE_ID),
      services.repos.teams.listMembersByWorkspace(SEED_WORKSPACE_ID),
      services.repos.boards.listMembersByWorkspace(SEED_WORKSPACE_ID),
    ]);
    const ctxFor = (userId: string) => buildPermissionContext({ userId, workspaceMembers: members, teamMembers, boardMembers });
    expect(canViewBoard(ctxFor(SEED_USER_IDS.danh), board)).toBe(true);
    expect(boardRoleFor(ctxFor(SEED_USER_IDS.emily), board)).toBe("EDITOR"); // ADMIN
    expect(canViewBoard(ctxFor(SEED_USER_IDS.jun), board)).toBe(false); // MEMBER, even though the board is TEAM-visible
    expect(canViewBoard(ctxFor(SEED_USER_IDS.jane), board)).toBe(false); // GUEST
  });
});

describe("booking a task", () => {
  let services: ReturnType<typeof createServices>;
  const owner = SEED_USER_IDS.danh;
  beforeEach(() => {
    services = createServices(createLocalRepositories({ databaseName: `booking-${Date.now()}-${Math.random()}` }));
  });

  it("offers every ordinary team and lands on Task Allocation when no team takes bookings directly", async () => {
    const form = await services.booking.getForm({ workspaceSlug: "rmit", key: null });
    expect(form.teams.map((t) => t.name)).not.toContain("Admin");
    expect(form.teams.length).toBeGreaterThan(3);
    expect(form.teams.every((t) => t.boardName === null && t.fields.length === 0)).toBe(true);
    expect(form.priorities.map((p) => p.name)).toEqual(["Critical", "High", "Medium", "Low"]);
    expect(form.assetTypes.map((a) => a.name)).toContain("Print");

    const digital = form.teams.find((t) => t.name === "Digital")!;
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: form.workspaceId && (await services.repos.workspaces.getById(form.workspaceId))!.bookingKey!, request: request({ teamId: digital.id }) });
    expect(receipt.boardName).toBe("Task Allocation");
    expect(receipt.teamName).toBeNull();
    expect(receipt.reference).toMatch(/^TA-[0-9A-F]{4}$/);

    const { board } = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    const items = await services.repos.items.listByBoard(board.id);
    // The seed already has bookings on the board; the new one joins them.
    expect(items.filter((i) => i.parentItemId === null).map((i) => i.name)).toContain("Open Day wayfinding posters");
    const item = items.find((i) => i.parentItemId === null && i.name === "Open Day wayfinding posters")!;
    expect(item.createdBy).toBe(owner);
    // Each asset line is a subitem, carrying its spec.
    const subitems = items.filter((i) => i.parentItemId === item.id).sort((a, b) => a.position - b.position);
    expect(subitems.map((i) => i.name)).toEqual(["A1 poster ×6", "Instagram tile"]);
    expect(subitems[0]!.description).toBe("594×841 mm, CMYK, print ready");
    expect(receipt.assetCount).toBe(2);
    expect(item.description).toBe(request().brief);
    const columns = await services.repos.boards.listColumns(board.id);
    const values = await services.repos.items.listValuesByItem(item.id);
    const valueOf = (name: string) => values.find((v) => v.columnId === columns.find((c) => c.name === name)!.id)?.value;
    expect(valueOf("Requester")).toEqual({ type: "TEXT", text: "Priya Nair" });
    expect(valueOf("Requested team")).toEqual({ type: "TAGS", tags: ["Digital"] });
    expect(valueOf("Status")).toEqual({ type: "STATUS", labelId: "not_started" });
    expect(valueOf("Priority")).toEqual({ type: "PRIORITY", labelId: "high" });
    expect(valueOf("Assets & specs")).toEqual({ type: "LONG_TEXT", text: "1. A1 poster ×6 — 594×841 mm, CMYK, print ready\n2. Instagram tile" });

    // Admins hear about it; a plain member does not.
    const adminInbox = await services.repos.notifications.listByUser(SEED_USER_IDS.emily);
    expect(adminInbox.some((n) => n.type === "TASK_BOOKED" && n.entityId === item.id)).toBe(true);
    const memberInbox = await services.repos.notifications.listByUser(SEED_USER_IDS.jun);
    expect(memberInbox.some((n) => n.type === "TASK_BOOKED")).toBe(false);
  });

  it("records a signed-in member as the requester, and ignores a stranger's id", async () => {
    const mine = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ assets: [] }), actorId: SEED_USER_IDS.jun });
    expect((await services.repos.items.getById(mine.itemId))!.createdBy).toBe(SEED_USER_IDS.jun);
    const stranger = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ assets: [] }), actorId: "00000000-0000-4000-8000-000000009999" });
    expect((await services.repos.items.getById(stranger.itemId))!.createdBy).toBe(owner);
  });

  it("rejects a stale key and an archived team", async () => {
    await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    await expect(services.booking.getForm({ workspaceSlug: "rmit", key: "wrong-key-wrong-key-wrong" })).rejects.toThrow(/no longer valid/);
    await expect(services.booking.getForm({ workspaceSlug: "nowhere", key: null })).rejects.toThrow(/does not point/);
    const teams = await services.repos.teams.listByWorkspace(SEED_WORKSPACE_ID);
    const events = teams.find((t) => t.name === "Events")!;
    await services.workspace.archiveTeam(events.id, true);
    await expect(services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ teamId: events.id }) })).rejects.toThrow(/no longer taking bookings/);
  });

  it("goes straight to a team's chosen board, mapping answers to its columns and asking its extra questions", async () => {
    const teams = await services.repos.teams.listByWorkspace(SEED_WORKSPACE_ID);
    const boards = await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    // An ordinary team with an ordinary board: the built-in Admin team and Task Allocation cannot take bookings.
    const team = teams.find((t) => !t.system && boards.some((b) => b.teamId === t.id && !b.archivedAt && !b.system))!;
    const board = boards.find((b) => b.teamId === team.id && !b.archivedAt && !b.system)!;
    await services.workspace.updateTeam(team.id, { bookingBoardId: board.id });

    const form = await services.booking.getForm({ workspaceSlug: "rmit", key: null });
    const option = form.teams.find((t) => t.id === team.id)!;
    expect(option.boardName).toBe(board.name);
    const columns = await services.repos.boards.listColumns(board.id);
    expect(option.fields.map((f) => f.columnId)).toEqual(extraFieldsFor(columns).map((f) => f.columnId));

    const textExtra = option.fields.find((f) => f.type === "TEXT");
    const extra = textExtra ? { [textExtra.columnId]: { type: "TEXT" as const, text: "From the form" } } : {};
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ teamId: team.id, extra }) });
    expect(receipt.boardId).toBe(board.id);
    expect(receipt.teamName).toBe(team.name);

    const item = (await services.repos.items.getById(receipt.itemId))!;
    const values = await services.repos.items.listValuesByItem(item.id);
    const plan = planStandardFields(columns);
    if (plan.dueDate) expect(values.find((v) => v.columnId === plan.dueDate!.id)?.value).toEqual({ type: "DATE", date: "2026-10-01" });
    if (textExtra) expect(values.find((v) => v.columnId === textExtra.columnId)?.value).toEqual({ type: "TEXT", text: "From the form" });
    // Whatever found no column is still on the record.
    expect(item.description).toContain(request().brief);
    if (!plan.requesterEmail) expect(item.description).toContain("priya@rmit.edu.au");
  });

  it("lets a manager allocate a request to a team board as a linked item", async () => {
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request() });
    const boards = await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    const target = boards.find((b) => b.slug === "rmitinerary-2026")!;
    const { item, created, board } = await services.booking.allocate(receipt.itemId, target.id, owner);
    expect(board.id).toBe(target.id);
    expect(created.boardId).toBe(target.id);
    expect(created.name).toBe("Open Day wayfinding posters");
    expect(created.description).toContain(request().brief);
    const links = await services.repos.links.listByItem(receipt.itemId);
    expect(links).toHaveLength(1);
    // The asset subitems came along.
    const copies = (await services.repos.items.listByBoard(target.id)).filter((i) => i.parentItemId === created.id);
    expect(copies.map((i) => i.name).sort()).toEqual(["A1 poster ×6", "Instagram tile"]);

    const allocation = boards.find((b) => b.system === "TASK_ALLOCATION")!;
    const groups = await services.repos.boards.listGroups(allocation.id);
    expect(groups.find((g) => g.id === item.groupId)?.name).toBe("Allocated");
    // …and its asset subitems moved with it rather than staying behind in Incoming.
    const ownSubitems = (await services.repos.items.listByBoard(allocation.id)).filter((i) => i.parentItemId === item.id);
    expect(ownSubitems).toHaveLength(2);
    expect(ownSubitems.every((s) => s.groupId === item.groupId)).toBe(true);
    const columns = await services.repos.boards.listColumns(allocation.id);
    const allocatedTo = columns.find((c) => c.name === "Allocated to")!;
    const values = await services.repos.items.listValuesByItem(item.id);
    expect(values.find((v) => v.columnId === allocatedTo.id)?.value).toEqual({ type: "TEXT", text: target.name });

    // Only requests on Task Allocation can be allocated, and only onto ordinary boards.
    await expect(services.booking.allocate(created.id, allocation.id, owner)).rejects.toThrow(/Task Allocation/);
  });
});

describe("shaping the booking form", () => {
  let services: ReturnType<typeof createServices>;
  const owner = SEED_USER_IDS.danh;
  beforeEach(() => {
    services = createServices(createLocalRepositories({ databaseName: `booking-form-${Date.now()}-${Math.random()}` }));
  });

  it("starts from the built-in form and refuses to lose the questions a booking cannot do without", async () => {
    const form = await services.booking.getForm({ workspaceSlug: "rmit", key: null });
    expect(form.template).toEqual(defaultBookingFormTemplate());
    const broken = defaultBookingFormTemplate();
    broken.sections[0]!.fields = broken.sections[0]!.fields.filter((f) => f.kind !== "standard" || f.key !== "requesterEmail");
    await expect(services.booking.saveForm(SEED_WORKSPACE_ID, broken)).rejects.toThrow(/requester's email/);
  });

  it("saves the admin's wording, drops a question, adds its own, and gives a column question its column", async () => {
    const draft = defaultBookingFormTemplate();
    const about = draft.sections[0]!;
    about.title = "Who are you?";
    about.fields = about.fields.filter((f) => f.kind !== "standard" || f.key !== "department");
    const task = draft.sections[1]!;
    const due = task.fields.find((f) => f.kind === "standard" && f.key === "dueDate")!;
    due.required = true;
    due.label = "Deadline";
    task.fields.push(newCustomField("cost", "Cost centre", "TEXT", "column"));
    task.fields.push(newCustomField("campus", "Campus", "TAGS", "brief", [{ name: "Melbourne", color: "navy" }, { name: "Hanoi", color: "red" }]));
    draft.assets.enabled = false;
    draft.submitLabel = "Send the request";

    const saved = await services.booking.saveForm(SEED_WORKSPACE_ID, draft);
    const cost = customFields(saved).find((f) => f.id === "cost")!;
    expect(cost.columnId).toBeTruthy();
    const { board } = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    const columns = await services.repos.boards.listColumns(board.id);
    expect(columns.find((c) => c.id === cost.columnId)).toMatchObject({ name: "Cost centre", type: "TEXT" });

    const form = await services.booking.getForm({ workspaceSlug: "rmit", key: null });
    expect(form.template.sections[0]!.title).toBe("Who are you?");
    expect(standardFieldFor(form.template, "department")).toBeNull();
    expect(form.template.submitLabel).toBe("Send the request");
    expect(form.template.assets.enabled).toBe(false);

    // Saving again reuses the column rather than making a twin.
    await services.booking.saveForm(SEED_WORKSPACE_ID, saved);
    expect((await services.repos.boards.listColumns(board.id)).filter((c) => c.name === "Cost centre")).toHaveLength(1);

    // Booking: the deadline the form made required is enforced; custom answers land where the form said; strays are dropped.
    const key = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;
    await expect(services.booking.submit({ workspaceSlug: "rmit", key, request: request({ dueDate: null }) })).rejects.toThrow(/Deadline is required/);
    const receipt = await services.booking.submit({
      workspaceSlug: "rmit",
      key,
      request: request({ answers: { cost: { type: "TEXT", text: "CC-4410" }, campus: { type: "TAGS", tags: ["Hanoi"] }, stray: { type: "TEXT", text: "ignored" } } }),
    });
    const values = await services.repos.items.listValuesByItem(receipt.itemId);
    expect(values.find((v) => v.columnId === cost.columnId)?.value).toEqual({ type: "TEXT", text: "CC-4410" });
    const item = await services.repos.items.getById(receipt.itemId);
    expect(item!.description).toContain("Campus: Hanoi");
    expect(item!.description).not.toContain("ignored");
  });

  it("puts a column-bound answer in the brief on a board that has no such column", () => {
    const template = defaultBookingFormTemplate();
    template.sections[1]!.fields.push({ ...newCustomField("cost", "Cost centre", "TEXT", "column"), columnId: "elsewhere" });
    const columns = [column("Status", "STATUS", 0), column("Cost centre", "NUMBER", 1)];
    const placement = mapBookingToColumns(request({ answers: { cost: { type: "TEXT", text: "CC-1" } } }), columns, { team: null, template });
    expect(placement.values.some((v) => v.columnId === "col-1")).toBe(false);
    expect(placement.leftover).toContainEqual({ field: "custom", label: "Cost centre", text: "CC-1" });
    // The same name and type is good enough when the id is not there.
    const matched = mapBookingToColumns(request({ answers: { cost: { type: "TEXT", text: "CC-1" } } }), [column("cost centre", "TEXT", 2)], { team: null, template });
    expect(matched.values).toContainEqual({ columnId: "col-2", value: { type: "TEXT", text: "CC-1" } });
  });

  it("validates a request against the form it answered", () => {
    const template = defaultBookingFormTemplate();
    template.sections[1]!.fields.push({ ...newCustomField("q", "Cost centre", "NUMBER", "brief"), required: true });
    expect(validateBookingAgainstTemplate(request(), template)).toEqual({ q: "Cost centre is required" });
    expect(validateBookingAgainstTemplate(request({ answers: { q: { type: "TEXT", text: "x" } } }), template)).toEqual({ q: "Cost centre has an answer of the wrong kind" });
    expect(validateBookingAgainstTemplate(request({ answers: { q: { type: "NUMBER", number: 4410 } } }), template)).toEqual({});
    // A stored form that no longer parses falls back to the built-in one rather than breaking the page.
    expect(resolveBookingTemplate({ bookingForm: { version: 1 } as never })).toEqual(defaultBookingFormTemplate());
    expect(resolveBookingTemplate({ bookingForm: null })).toEqual(defaultBookingFormTemplate());
  });

  it("keeps forms by name, replaces on the same name, and swaps them back in", async () => {
    const lean = defaultBookingFormTemplate();
    lean.sections = lean.sections.slice(0, 2);
    const saved = await services.booking.saveTemplate(SEED_WORKSPACE_ID, "Lean", lean, owner);
    expect(saved.name).toBe("Lean");
    expect(saved.template.sections).toHaveLength(2);
    const again = await services.booking.saveTemplate(SEED_WORKSPACE_ID, " lean ", defaultBookingFormTemplate(), owner);
    expect(again.id).toBe(saved.id);
    expect(again.template.sections).toHaveLength(3);
    expect((await services.booking.listTemplates(SEED_WORKSPACE_ID)).map((t) => t.name)).toEqual(["lean"]);
    await expect(services.booking.saveTemplate(SEED_WORKSPACE_ID, "  ", lean, owner)).rejects.toThrow(/name/);
    await services.booking.deleteTemplate(saved.id);
    expect(await services.booking.listTemplates(SEED_WORKSPACE_ID)).toEqual([]);
  });

  it("stores nothing when the form saved is the built-in one, so it keeps up with the app", async () => {
    await services.booking.saveForm(SEED_WORKSPACE_ID, defaultBookingFormTemplate());
    expect((await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingForm ?? null).toBeNull();

    // Anything of the workspace's own is stored as it is.
    const own = defaultBookingFormTemplate();
    own.submitLabel = "Send it";
    await services.booking.saveForm(SEED_WORKSPACE_ID, own);
    expect((await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingForm?.submitLabel).toBe("Send it");
  });

  it("goes back to the built-in form on reset", async () => {
    const custom = defaultBookingFormTemplate();
    custom.submitLabel = "Go";
    await services.booking.saveForm(SEED_WORKSPACE_ID, custom);
    expect((await services.booking.getForm({ workspaceSlug: "rmit", key: null })).template.submitLabel).toBe("Go");
    await services.booking.resetForm(SEED_WORKSPACE_ID);
    expect((await services.booking.getForm({ workspaceSlug: "rmit", key: null })).template.submitLabel).toBe("Book this task");
  });
});

describe("the reference a booking carries", () => {
  let services: ReturnType<typeof createServices>;
  beforeEach(() => {
    services = createServices(createLocalRepositories({ databaseName: `booking-ref-${Date.now()}-${Math.random()}` }));
  });

  it("uses the id the form settled on, so the code shown before sending is the code that sticks", async () => {
    const key = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;
    const itemId = "1f0a2b3c-4d5e-4f60-8a91-b2c3d4e5f607";
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key, request: request({ itemId }) });
    expect(receipt.itemId).toBe(itemId);
    expect(receipt.reference).toBe(bookingReference(itemId));

    // The same id a second time is already taken, so that booking gets its own.
    const second = await services.booking.submit({ workspaceSlug: "rmit", key, request: request({ itemId }) });
    expect(second.itemId).not.toBe(itemId);
    expect(second.reference).toBe(bookingReference(second.itemId));
  });
});
