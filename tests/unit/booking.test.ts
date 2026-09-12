import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BoardColumn, BookingChoiceBlock, BookingFormTemplate, BookingRequest, ColumnType, PriorityColumnSettings, TagsColumnSettings } from "@/domain";
import { bookingReference, defaultBookingFormTemplate, defaultSettingsFor, DEFAULT_COLUMN_WIDTHS, newBookingBlock, serviceById, standardFieldFor } from "@/domain";
import { boardRoleFor, buildPermissionContext, canViewBoard } from "@/lib/permissions/permissions";
import { createServices } from "@/services";
import {
  bookingRequestSchema,
  composeBrief,
  describeBooking,
  mapBookingToColumns,
  migrateLegacyTemplate,
  planStandardFields,
  resolveBookingDraft,
  resolveBookingTemplate,
  validateBookingAgainstTemplate,
  validateBookingStep,
} from "@/services/booking";
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

/** The built-in Design brief, answered: what a stakeholder who got to the end has. */
const DESIGN_ANSWERS: BookingRequest["answers"] = {
  "design-what": { kind: "text", text: "Six A1 posters for the Brunswick campus, brand compliant, print ready." },
  "design-specs": { kind: "text", text: "A1 portrait for print, plus 1080x1350 for Instagram." },
  "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
};

const request = (overrides: Partial<BookingRequest> = {}): BookingRequest => {
  const base: BookingRequest = {
    requesterName: "Priya Nair",
    requesterEmail: "priya@rmit.edu.au",
    department: "School of Design",
    title: "Open Day wayfinding posters",
    brief: "",
    assetTypes: ["Print"],
    assets: [
      { name: "A1 poster", quantity: 6, spec: "594×841 mm, CMYK, print ready", assetType: "Print" },
      { name: "Instagram tile", quantity: null, spec: null },
    ],
    serviceTypeId: "svc-design",
    subServices: ["Print"],
    teamId: null,
    dueDate: "2026-10-01",
    priority: "High",
    referenceUrl: "https://example.com/brief",
    answers: DESIGN_ANSWERS,
    ...overrides,
  };
  // The brief is composed, never typed; a caller may still override it outright.
  return overrides.brief === undefined ? { ...base, brief: composeBrief(base, defaultBookingFormTemplate()) } : base;
};

describe("the brief a service's answers compose", () => {
  it("leads with the service, numbers the questions as the form did, and leaves the blanks out", () => {
    const brief = composeBrief(request(), defaultBookingFormTemplate());
    expect(brief).toContain("Service: Design");
    expect(brief).toContain("Involves: Print");
    expect(brief).toContain("1. What are you asking for?");
    expect(brief).toContain("2. Sizes, formats and where it will run");
    expect(brief).toContain("3. Is the copy written?");
    expect(brief).toContain("Yes, final and approved");
    // The fourth block is the separator and the fifth an unanswered link: neither appears.
    expect(brief).not.toContain("Where are the assets?");
  });

  it("keeps a heading the team wrote in, and drops the instructions that were only for the person filling it in", () => {
    const template = defaultBookingFormTemplate();
    const design = serviceById(template, "svc-design")!;
    design.blocks = [
      { id: "h", kind: "text", level: "heading", text: "The work itself" },
      { id: "note", kind: "text", level: "body", text: "Take your time over this one." },
      { id: "q", kind: "short", label: "Audience", description: null, required: false },
    ];
    const brief = composeBrief(request({ answers: { q: { kind: "text", text: "Prospective students" } } }), template);
    expect(brief).toContain("The work itself");
    expect(brief).not.toContain("Take your time");
    expect(brief).toContain("1. Audience");
    expect(brief).toContain("Prospective students");
  });

  it("writes a link with the words that were given for it", () => {
    const template = defaultBookingFormTemplate();
    serviceById(template, "svc-design")!.blocks = [{ id: "l", kind: "link", label: "Assets", description: null, required: false }];
    expect(composeBrief(request({ answers: { l: { kind: "link", url: "https://x.test/a", label: "The folder" } } }), template)).toContain("The folder — https://x.test/a");
    expect(composeBrief(request({ answers: { l: { kind: "link", url: "https://x.test/a", label: "" } } }), template)).toContain("https://x.test/a");
  });
});

describe("placing a booking's answers on a board", () => {
  it("finds a home for every standard answer on the Task Allocation board", () => {
    const columns = taskAllocationColumns(["Digital", "Brand"]).map((c, i) => column(c.name, c.type, i, c.settings ?? defaultSettingsFor(c.type)));
    const plan = planStandardFields(columns);
    expect(plan.requesterName?.name).toBe("Requester");
    expect(plan.requesterEmail?.name).toBe("Email");
    expect(plan.department?.name).toBe("Department");
    expect(plan.service?.name).toBe("Service");
    expect(plan.assetTypes?.name).toBe("Asset type");
    expect(plan.brief?.name).toBe("Brief");
    expect(plan.assets?.name).toBe("Assets & specs");
    expect(plan.team?.name).toBe("Requested team");
    expect(plan.dueDate?.name).toBe("Due Date");
    expect(plan.priority?.name).toBe("Priority");
    expect(plan.referenceUrl?.name).toBe("Reference");

    const req = request();
    const placement = mapBookingToColumns(req, columns, { team: { id: "t", name: "Brand" }, template: defaultBookingFormTemplate() });
    expect(placement.leftover).toEqual([]);
    const byName = new Map(placement.values.map((v) => [columns.find((c) => c.id === v.columnId)!.name, v.value]));
    expect(byName.get("Requester")).toEqual({ type: "TEXT", text: "Priya Nair" });
    // One tag, and it is the service. The sub-services are chips in the brief.
    expect(byName.get("Service")).toEqual({ type: "TAGS", tags: ["Design"] });
    expect(byName.get("Asset type")).toEqual({ type: "TAGS", tags: ["Print"] });
    expect(byName.get("Brief")).toEqual({ type: "LONG_TEXT", text: req.brief });
    expect(byName.get("Assets & specs")).toEqual({ type: "LONG_TEXT", text: "1. A1 poster ×6 (Print) — 594×841 mm, CMYK, print ready\n2. Instagram tile" });
    expect(byName.get("Requested team")).toEqual({ type: "TAGS", tags: ["Brand"] });
    expect(byName.get("Due Date")).toEqual({ type: "DATE", date: "2026-10-01" });
    expect(byName.get("Priority")).toEqual({ type: "PRIORITY", labelId: "high" });
    expect(byName.get("Reference")).toEqual({ type: "LINK", url: "https://example.com/brief", text: null });
    // The brief is the description; it is never repeated under "Request details".
    expect(describeBooking(req, placement)).toBe(req.brief);
  });

  it("adapts to a team board with different columns and keeps the rest in the description", () => {
    // The "Creative Production" template: no requester, email, brief or link columns.
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
    // "Market" is the first free TAGS column and the service question has no
    // name to match, so nothing is written there by accident.
    expect(plan.service).toBeNull();
    expect(plan.assetTypes?.name).toBe("Format");
    expect(plan.brief).toBeNull();
    expect(plan.dueDate?.name).toBe("Due Date");
    expect(plan.priority?.name).toBe("Priority");
    expect(plan.referenceUrl).toBeNull();

    const req = request({ assetTypes: ["Print", "Digital"] });
    const placement = mapBookingToColumns(req, columns, { team: { id: "t", name: "Vietnam Creative" }, template: defaultBookingFormTemplate() });
    const byName = new Map(placement.values.map((v) => [columns.find((c) => c.id === v.columnId)!.name, v.value]));
    expect(byName.get("Format")).toEqual({ type: "TEXT", text: "Print, Digital" });
    expect(byName.has("Designer")).toBe(false);
    expect(placement.leftover.map((l) => l.label)).toEqual(["Requester", "Email", "Department", "Service", "Assets & specs", "Requested team", "Reference"]);

    const description = describeBooking(req, placement);
    // The brief leads, whatever the board could not hold follows it.
    expect(description.startsWith(req.brief)).toBe(true);
    expect(description).toContain("Requester: Priya Nair");
    expect(description).toContain("Service: Design");
    expect(description).toContain("Assets & specs:\n  1. A1 poster ×6 (Print) — 594×841 mm, CMYK, print ready\n  2. Instagram tile");
    expect(description).toContain("Email: priya@rmit.edu.au");
    expect(description).toContain("Reference: https://example.com/brief");
  });

  it("writes the brief into a column named for it, and never twice", () => {
    const columns = [column("Status", "STATUS", 0), column("Brief", "LONG_TEXT", 1), column("Notes", "LONG_TEXT", 2)];
    const req = request({ assets: [] });
    const placement = mapBookingToColumns(req, columns, { team: null, template: defaultBookingFormTemplate() });
    expect(placement.values).toContainEqual({ columnId: "col-1", value: { type: "LONG_TEXT", text: req.brief } });
    expect(placement.leftover.some((l) => l.field === "brief")).toBe(false);
    expect(describeBooking(req, placement)).toContain(req.brief);
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
    expect(bookingRequestSchema.safeParse(request({ title: "no" })).success).toBe(false);
    expect(bookingRequestSchema.safeParse(request({ referenceUrl: "javascript:alert(1)" })).success).toBe(false);
    expect(bookingRequestSchema.safeParse(request({ dueDate: "next week" })).success).toBe(false);
    const parsed = bookingRequestSchema.parse({ ...request(), department: undefined, answers: undefined, assetTypes: undefined, subServices: undefined });
    expect(parsed.department).toBeNull();
    expect(parsed.answers).toEqual({});
    expect(parsed.assetTypes).toEqual([]);
    expect(parsed.subServices).toEqual([]);
  });
});

describe("what a step will not let a stakeholder past", () => {
  const template = defaultBookingFormTemplate();

  it("insists on the questions step one marks required, and on a service", () => {
    expect(validateBookingStep("basics", request(), template)).toEqual({});
    expect(validateBookingStep("basics", request({ requesterName: "  " }), template)).toEqual({ "std-requesterName": "Your name is required" });
    expect(validateBookingStep("basics", request({ serviceTypeId: null }), template)).toEqual({ service: "Pick the kind of work this is" });
    // The three about the requester, the task name and both "when" questions
    // are all required; nothing on step one is optional.
    expect(validateBookingStep("basics", request({ dueDate: null, priority: null }), template)).toEqual({
      "std-dueDate": "Needed by is required",
      "std-priority": "How urgent? is required",
    });
    // A service offering sub-services wants one of them.
    expect(validateBookingStep("basics", request({ subServices: [] }), template)).toEqual({ subServices: "What does it involve? — pick at least one" });
    // A question the caller never shows cannot be required of anybody.
    expect(validateBookingStep("basics", request({ department: null }), template, ["department"])).toEqual({});
  });

  it("insists on the required questions of the service that was picked, and on answers of the right shape", () => {
    expect(validateBookingStep("brief", request(), template)).toEqual({});
    const missing = validateBookingStep("brief", request({ answers: { ...DESIGN_ANSWERS, "design-specs": { kind: "text", text: "" } } }), template);
    expect(missing).toEqual({ "design-specs": "Sizes, formats and where it will run is required" });
    const wrong = validateBookingStep("brief", request({ answers: { ...DESIGN_ANSWERS, "design-copy": { kind: "text", text: "yes" } } }), template);
    expect(wrong).toEqual({ "design-copy": "Is the copy written? has an answer of the wrong kind" });
    // Production asks other questions entirely, so Design's answers do not satisfy it.
    const production = validateBookingStep("brief", request({ serviceTypeId: "svc-production" }), template);
    expect(Object.keys(production).sort()).toEqual(["prod-people", "prod-what", "prod-when", "prod-where"]);
  });

  it("never holds anybody on the deliverables or the recap", () => {
    const bare = request({ assets: [], assetTypes: [], referenceUrl: null });
    expect(validateBookingStep("assets", bare, template)).toEqual({});
    expect(validateBookingStep("review", bare, template)).toEqual({});
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
    expect(columns.map((c) => c.name)).toEqual([
      "Requester",
      "Email",
      "Department",
      "Stakeholder",
      "Service",
      "Asset type",
      "Brief",
      "Assets & specs",
      "Requested team",
      "Status",
      "Priority",
      "Due Date",
      "Reference",
      "Assets recap",
      "Allocated to",
    ]);
    const serviceTags = columns.find((c) => c.name === "Service")!.settings as TagsColumnSettings;
    expect(serviceTags.options.map((o) => o.name)).toEqual(["Brand", "Design", "Production"]);
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

  const keyFor = async () => (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;

  it("offers the built-in services and lands on Task Allocation when none names a team", async () => {
    const form = await services.booking.getForm({ workspaceSlug: "rmit", key: null });
    expect(form.template.services.map((s) => s.name)).toEqual(["Brand", "Design", "Production"]);
    expect(form.template.services.every((s) => s.teamId === null)).toBe(true);
    expect(form.teams.map((t) => t.name)).not.toContain("Admin");
    expect(form.priorities.map((p) => p.name)).toEqual(["Critical", "High", "Medium", "Low"]);
    expect(form.assetTypes.map((a) => a.name)).toContain("Print assets");

    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: await keyFor(), request: request() });
    expect(receipt.boardName).toBe("Task Allocation");
    expect(receipt.teamName).toBeNull();
    expect(receipt.reference).toMatch(/^TA-[0-9A-F]{4}$/);

    const { board } = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    const items = await services.repos.items.listByBoard(board.id);
    const item = items.find((i) => i.parentItemId === null && i.name === "Open Day wayfinding posters")!;
    expect(item.createdBy).toBe(owner);
    // The asset lines are deliverables on the Assets tab, and nothing on the
    // board: a booking arrives as one task, not a task with a fold-out of rows
    // saying the same thing.
    expect(items.filter((i) => i.parentItemId === item.id)).toHaveLength(0);
    const lines = await services.repos.itemAssets.listByItem(item.id);
    expect(lines.map((l) => l.name)).toEqual(["A1 poster", "Instagram tile"]);
    expect(lines[0]!.quantity).toBe(6);
    // The row's own type lands on the deliverable; a row without one takes the
    // one type the request named as a whole, as it always did.
    expect(lines[0]!.assetType).toBe("Print");
    expect(lines[1]!.assetType).toBe("Print");
    expect(receipt.assetCount).toBe(2);
    expect(item.description).toContain("Service: Design");
    expect(item.description).toContain("1. What are you asking for?");

    const columns = await services.repos.boards.listColumns(board.id);
    const values = await services.repos.items.listValuesByItem(item.id);
    const valueOf = (name: string) => values.find((v) => v.columnId === columns.find((c) => c.name === name)!.id)?.value;
    expect(valueOf("Requester")).toEqual({ type: "TEXT", text: "Priya Nair" });
    expect(valueOf("Service")).toEqual({ type: "TAGS", tags: ["Design"] });
    expect(valueOf("Brief")).toEqual({ type: "LONG_TEXT", text: item.description });
    expect(valueOf("Status")).toEqual({ type: "STATUS", labelId: "not_started" });
    expect(valueOf("Priority")).toEqual({ type: "PRIORITY", labelId: "high" });

    // Admins hear about it; a plain member does not.
    const adminInbox = await services.repos.notifications.listByUser(SEED_USER_IDS.emily);
    expect(adminInbox.some((n) => n.type === "TASK_BOOKED" && n.entityId === item.id)).toBe(true);
    const memberInbox = await services.repos.notifications.listByUser(SEED_USER_IDS.jun);
    expect(memberInbox.some((n) => n.type === "TASK_BOOKED")).toBe(false);
  });

  it("composes the brief itself, and keeps only the answers and sub-services the service offers", async () => {
    const receipt = await services.booking.submit({
      workspaceSlug: "rmit",
      key: null,
      request: request({
        brief: "Something the caller made up.",
        subServices: ["Print", "Not a sub-service of anything"],
        answers: { ...DESIGN_ANSWERS, stray: { kind: "text", text: "should never appear" } },
      }),
    });
    const item = (await services.repos.items.getById(receipt.itemId))!;
    expect(item.description).not.toContain("Something the caller made up");
    expect(item.description).toContain("Involves: Print");
    expect(item.description).not.toContain("Not a sub-service");
    expect(item.description).not.toContain("should never appear");
  });

  it("refuses a booking that leaves a required question of its service blank", async () => {
    await expect(
      services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ answers: { ...DESIGN_ANSWERS, "design-what": { kind: "text", text: "" } } }) }),
    ).rejects.toThrow(/What are you asking for\? is required/);
  });

  it("records a signed-in member as the requester, and ignores a stranger's id", async () => {
    const mine = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ assets: [] }), actorId: SEED_USER_IDS.jun });
    expect((await services.repos.items.getById(mine.itemId))!.createdBy).toBe(SEED_USER_IDS.jun);
    const stranger = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ assets: [] }), actorId: "00000000-0000-4000-8000-000000009999" });
    expect((await services.repos.items.getById(stranger.itemId))!.createdBy).toBe(owner);
  });

  it("rejects a stale key and a service the form has dropped", async () => {
    await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    await expect(services.booking.getForm({ workspaceSlug: "rmit", key: "wrong-key-wrong-key-wrong" })).rejects.toThrow(/no longer valid/);
    await expect(services.booking.getForm({ workspaceSlug: "nowhere", key: null })).rejects.toThrow(/does not point/);
    await expect(services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ serviceTypeId: "svc-gone" }) })).rejects.toThrow(/no longer on the form/);
  });

  it("routes by the service, not by anything the caller sends, and lands on the team's own board", async () => {
    const teams = await services.repos.teams.listByWorkspace(SEED_WORKSPACE_ID);
    const boards = await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    const team = teams.find((t) => !t.system && boards.some((b) => b.teamId === t.id && !b.archivedAt && !b.system))!;
    const board = boards.find((b) => b.teamId === team.id && !b.archivedAt && !b.system)!;
    await services.workspace.updateTeam(team.id, { bookingBoardId: board.id });

    const template = defaultBookingFormTemplate();
    serviceById(template, "svc-design")!.teamId = team.id;
    await services.booking.publishForm(SEED_WORKSPACE_ID, template);

    // A caller naming some other team is simply ignored: the service decides.
    const other = teams.find((t) => !t.system && t.id !== team.id)!;
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ teamId: other.id }) });
    expect(receipt.boardId).toBe(board.id);
    expect(receipt.teamName).toBe(team.name);

    const item = (await services.repos.items.getById(receipt.itemId))!;
    const columns = await services.repos.boards.listColumns(board.id);
    const values = await services.repos.items.listValuesByItem(item.id);
    const plan = planStandardFields(columns);
    if (plan.dueDate) expect(values.find((v) => v.columnId === plan.dueDate!.id)?.value).toEqual({ type: "DATE", date: "2026-10-01" });
    // Whatever found no column is still on the record.
    expect(item.description).toContain("Service: Design");
    if (!plan.requesterEmail) expect(item.description).toContain("priya@rmit.edu.au");
  });

  it("falls back to the allocation queue when the service names a team that has gone", async () => {
    const teams = await services.repos.teams.listByWorkspace(SEED_WORKSPACE_ID);
    const events = teams.find((t) => t.name === "Events")!;
    const template = defaultBookingFormTemplate();
    serviceById(template, "svc-design")!.teamId = events.id;
    await services.booking.publishForm(SEED_WORKSPACE_ID, template);
    await services.workspace.archiveTeam(events.id, true);

    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request() });
    expect(receipt.boardName).toBe("Task Allocation");
    expect(receipt.teamName).toBeNull();
  });

  it("moves an allocated request onto the team board rather than copying it", async () => {
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request() });
    const boards = await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    const target = boards.find((b) => b.slug === "rmitinerary-2026")!;
    const allocation = boards.find((b) => b.system === "TASK_ALLOCATION")!;

    const { item, board } = await services.booking.allocate(receipt.itemId, target.id, owner);
    expect(board.id).toBe(target.id);
    // The same row, on the new board: the id is what provenance and links hold.
    expect(item.id).toBe(receipt.itemId);
    expect(item.boardId).toBe(target.id);
    expect(item.name).toBe("Open Day wayfinding posters");
    expect(item.description).toContain("Service: Design");

    // Nothing was copied and nothing was linked.
    expect(await services.repos.links.listByItem(receipt.itemId)).toHaveLength(0);
    const onTarget = await services.repos.items.listByBoard(target.id);
    expect(onTarget.filter((i) => i.name === "Open Day wayfinding posters")).toHaveLength(1);

    // The request has left the queue, and it never had subitems to leave behind.
    const onAllocation = await services.repos.items.listByBoard(allocation.id);
    expect(onAllocation.some((i) => i.id === receipt.itemId)).toBe(false);
    expect(onTarget.some((i) => i.parentItemId === item.id)).toBe(false);

    // The deliverables came too, and answer to the board they landed on.
    const assets = await services.repos.itemAssets.listByItem(item.id);
    expect(assets).toHaveLength(2);
    expect(assets.every((a) => a.boardId === target.id)).toBe(true);

    const values = await services.repos.items.listValuesByItem(item.id);
    const targetColumnIds = new Set((await services.repos.boards.listColumns(target.id)).map((c) => c.id));
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((v) => targetColumnIds.has(v.columnId))).toBe(true);

    // Only requests on Task Allocation can be allocated, and only onto ordinary boards.
    await expect(services.booking.allocate(item.id, allocation.id, owner)).rejects.toThrow(/Task Allocation/);
  });
});

describe("shaping the booking form", () => {
  let services: ReturnType<typeof createServices>;
  const owner = SEED_USER_IDS.danh;
  beforeEach(() => {
    services = createServices(createLocalRepositories({ databaseName: `booking-form-${Date.now()}-${Math.random()}` }));
  });

  it("starts from the built-in form and refuses to lose what a booking cannot do without", async () => {
    const form = await services.booking.getForm({ workspaceSlug: "rmit", key: null });
    expect(form.template).toEqual(defaultBookingFormTemplate());

    const noEmail = defaultBookingFormTemplate();
    noEmail.basics.fields = noEmail.basics.fields.filter((f) => f.key !== "requesterEmail");
    await expect(services.booking.saveDraft(SEED_WORKSPACE_ID, noEmail)).rejects.toThrow(/requester's email/);

    const noDepartment = defaultBookingFormTemplate();
    noDepartment.basics.fields = noDepartment.basics.fields.filter((f) => f.key !== "department");
    await expect(services.booking.saveDraft(SEED_WORKSPACE_ID, noDepartment)).rejects.toThrow(/school or department/);

    const noServices = defaultBookingFormTemplate();
    noServices.services = [];
    await expect(services.booking.saveDraft(SEED_WORKSPACE_ID, noServices)).rejects.toThrow(/at least one type of service/);
  });

  it("keeps a draft to itself until it is published", async () => {
    const draft = defaultBookingFormTemplate();
    draft.review.submitLabel = "Send the request";
    draft.basics.title = "Who are you?";
    await services.booking.saveDraft(SEED_WORKSPACE_ID, draft);

    // Nobody booking sees any of it.
    const live = await services.booking.getForm({ workspaceSlug: "rmit", key: null });
    expect(live.template.review.submitLabel).toBe("Book this task");
    expect((await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingForm ?? null).toBeNull();
    // The editor picks it up exactly where it was left.
    expect((await services.booking.getDraft(SEED_WORKSPACE_ID)).basics.title).toBe("Who are you?");

    await services.booking.publishForm(SEED_WORKSPACE_ID, draft);
    expect((await services.booking.getForm({ workspaceSlug: "rmit", key: null })).template.review.submitLabel).toBe("Send the request");
    // Published, so there is nothing left in progress.
    expect((await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingFormDraft ?? null).toBeNull();
  });

  it("throws a draft away without touching what is live", async () => {
    const published = defaultBookingFormTemplate();
    published.review.submitLabel = "Send it";
    await services.booking.publishForm(SEED_WORKSPACE_ID, published);

    const wip = defaultBookingFormTemplate();
    wip.review.submitLabel = "Half-written";
    await services.booking.saveDraft(SEED_WORKSPACE_ID, wip);
    expect((await services.booking.discardDraft(SEED_WORKSPACE_ID)).review.submitLabel).toBe("Send it");
    expect((await services.booking.getDraft(SEED_WORKSPACE_ID)).review.submitLabel).toBe("Send it");
    expect((await services.booking.getForm({ workspaceSlug: "rmit", key: null })).template.review.submitLabel).toBe("Send it");
  });

  it("saves a service of the workspace's own, with its own questions, and asks them of nobody else", async () => {
    const template = defaultBookingFormTemplate();
    template.services = [
      {
        ...template.services[1]!,
        id: "svc-web",
        name: "Web",
        subServices: [{ name: "Landing page", color: "blue" }],
        blocks: [
          { id: "url", kind: "link", label: "Which page?", description: "Paste the address", required: true },
          { id: "sep", kind: "separator" },
          { ...(newBookingBlock("multi") as BookingChoiceBlock), id: "who", label: "Who is it for?", required: false, options: [{ name: "Students", color: "blue" }] },
        ],
      },
    ];
    template.basics.fields = template.basics.fields.filter((f) => f.key !== "dueDate");
    await services.booking.publishForm(SEED_WORKSPACE_ID, template);

    const form = await services.booking.getForm({ workspaceSlug: "rmit", key: null });
    expect(form.template.services.map((s) => s.name)).toEqual(["Web"]);
    expect(standardFieldFor(form.template, "dueDate")).toBeNull();
    // The three about the requester cannot be dropped, whatever is saved.
    expect(standardFieldFor(form.template, "department")).not.toBeNull();

    const key = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;
    const bare = request({ serviceTypeId: "svc-web", subServices: ["Landing page"], answers: {} });
    await expect(services.booking.submit({ workspaceSlug: "rmit", key, request: bare })).rejects.toThrow(/Which page\? is required/);

    const receipt = await services.booking.submit({
      workspaceSlug: "rmit",
      key,
      request: request({ serviceTypeId: "svc-web", subServices: ["Landing page"], answers: { url: { kind: "link", url: "https://rmit.test/open-day", label: "Open Day" }, who: { kind: "choice", values: ["Students"] } } }),
    });
    const item = (await services.repos.items.getById(receipt.itemId))!;
    expect(item.description).toContain("Service: Web");
    expect(item.description).toContain("1. Which page?");
    expect(item.description).toContain("Open Day — https://rmit.test/open-day");
    expect(item.description).toContain("2. Who is it for?");
  });

  it("keeps forms by name with what they are for, replaces on the same name, and swaps them back in", async () => {
    const lean = defaultBookingFormTemplate();
    lean.services = lean.services.slice(0, 1);
    const saved = await services.booking.saveTemplate(SEED_WORKSPACE_ID, { name: "Lean", description: "Brand only, for the shutdown.", template: lean }, owner);
    expect(saved.name).toBe("Lean");
    expect(saved.description).toBe("Brand only, for the shutdown.");
    expect(saved.template.services).toHaveLength(1);

    const again = await services.booking.saveTemplate(SEED_WORKSPACE_ID, { name: " lean ", description: null, template: defaultBookingFormTemplate() }, owner);
    expect(again.id).toBe(saved.id);
    expect(again.description).toBeNull();
    expect(again.template.services).toHaveLength(3);
    expect((await services.booking.listTemplates(SEED_WORKSPACE_ID)).map((t) => t.name)).toEqual(["lean"]);

    await expect(services.booking.saveTemplate(SEED_WORKSPACE_ID, { name: "  ", template: lean }, owner)).rejects.toThrow(/name/);
    await services.booking.deleteTemplate(saved.id);
    expect(await services.booking.listTemplates(SEED_WORKSPACE_ID)).toEqual([]);
  });

  it("keeps blocks by name, replaces on the same name, and leaves out one that no longer reads", async () => {
    const block = { ...(newBookingBlock("single") as BookingChoiceBlock), label: "Has this been through brand?", display: "dropdown" as const };
    const saved = await services.booking.saveBlock(SEED_WORKSPACE_ID, { name: "Brand history", block }, owner);
    expect(saved.name).toBe("Brand history");
    expect(saved.block).toMatchObject({ kind: "single", label: "Has this been through brand?", display: "dropdown" });

    const again = await services.booking.saveBlock(SEED_WORKSPACE_ID, { name: " brand history ", block: newBookingBlock("short") }, owner);
    expect(again.id).toBe(saved.id);
    expect(again.block.kind).toBe("short");
    expect((await services.booking.listSavedBlocks(SEED_WORKSPACE_ID)).map((b) => b.name)).toEqual(["brand history"]);

    await expect(services.booking.saveBlock(SEED_WORKSPACE_ID, { name: "  ", block }, owner)).rejects.toThrow(/name/);
    // A choice question with no choices is not a block anybody can answer.
    await expect(services.booking.saveBlock(SEED_WORKSPACE_ID, { name: "Broken", block: { ...block, options: [] } }, owner)).rejects.toThrow();
    // One that got into storage in a shape the app no longer reads is skipped, not fatal.
    await services.repos.bookingSavedBlocks.create({ workspaceId: SEED_WORKSPACE_ID, name: "Rubbish", block: { kind: "nope" } as never, createdBy: owner });
    expect((await services.booking.listSavedBlocks(SEED_WORKSPACE_ID)).map((b) => b.name)).toEqual(["brand history"]);

    await services.booking.deleteSavedBlock(saved.id);
    expect((await services.booking.listSavedBlocks(SEED_WORKSPACE_ID)).map((b) => b.name)).toEqual([]);
  });

  it("stores nothing when the form published is the built-in one, so it keeps up with the app", async () => {
    await services.booking.publishForm(SEED_WORKSPACE_ID, defaultBookingFormTemplate());
    expect((await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingForm ?? null).toBeNull();

    const own = defaultBookingFormTemplate();
    own.review.submitLabel = "Send it";
    await services.booking.publishForm(SEED_WORKSPACE_ID, own);
    expect((await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingForm?.review.submitLabel).toBe("Send it");
  });

  it("goes back to the built-in form on reset, draft and all", async () => {
    const custom = defaultBookingFormTemplate();
    custom.review.submitLabel = "Go";
    await services.booking.publishForm(SEED_WORKSPACE_ID, custom);
    await services.booking.saveDraft(SEED_WORKSPACE_ID, { ...custom, review: { ...custom.review, submitLabel: "Still going" } });
    expect((await services.booking.getForm({ workspaceSlug: "rmit", key: null })).template.review.submitLabel).toBe("Go");
    await services.booking.resetForm(SEED_WORKSPACE_ID);
    expect((await services.booking.getForm({ workspaceSlug: "rmit", key: null })).template.review.submitLabel).toBe("Book this task");
    expect((await services.booking.getDraft(SEED_WORKSPACE_ID)).review.submitLabel).toBe("Book this task");
  });
});

describe("reading whatever a workspace has stored", () => {
  it("falls back to the built-in form rather than breaking the page", () => {
    expect(resolveBookingTemplate({ bookingForm: { version: 9 } as never })).toEqual(defaultBookingFormTemplate());
    expect(resolveBookingTemplate({ bookingForm: null })).toEqual(defaultBookingFormTemplate());
    expect(resolveBookingDraft({ bookingForm: null, bookingFormDraft: null })).toEqual(defaultBookingFormTemplate());
  });

  it("carries a form written for the old single-page version forward instead of losing it", () => {
    const legacy = {
      version: 1,
      requestTabLabel: "Request",
      sections: [
        { id: "a", title: "About you", hint: null, fields: [{ kind: "standard", id: "std-requesterName", key: "requesterName", label: "Who are you?", hint: "Your full name", required: true, width: "half" }] },
        {
          id: "b",
          title: "The task",
          hint: "Plain language is perfect.",
          fields: [
            { kind: "standard", id: "std-requesterEmail", key: "requesterEmail", label: "Email", hint: null, required: true, width: "half" },
            { kind: "standard", id: "std-title", key: "title", label: "What is it?", hint: null, required: true, width: "full" },
            { kind: "standard", id: "std-brief", key: "brief", label: "Tell us more", hint: null, placeholder: "What do you need, and what should it achieve?", required: true, width: "full" },
            { kind: "custom", id: "cost", type: "TEXT", label: "Cost centre", hint: "Ask your finance officer", required: true, options: [], destination: "brief", width: "full" },
            { kind: "custom", id: "campus", type: "TAGS", label: "Campus", hint: null, required: false, options: [{ name: "Melbourne", color: "navy" }], destination: "brief", width: "full" },
          ],
        },
      ],
      assets: { enabled: false, tabLabel: "Assets", title: "Assets and specs", hint: "Optional." },
      submitLabel: "Send the request",
      submitNote: "",
    };
    const migrated = migrateLegacyTemplate(legacy) as BookingFormTemplate;
    expect(migrated.version).toBe(2);
    // The wording survives.
    expect(standardFieldFor(migrated, "requesterName")?.label).toBe("Who are you?");
    expect(standardFieldFor(migrated, "requesterName")?.description).toBe("Your full name");
    expect(standardFieldFor(migrated, "title")?.label).toBe("What is it?");
    expect(migrated.review.submitLabel).toBe("Send the request");
    expect(migrated.assets.enabled).toBe(false);
    // The old form asked everybody the same questions, which is one service.
    expect(migrated.services).toHaveLength(1);
    // The old form's one free-text brief leads step two, because step two has
    // no standard questions of its own and it would otherwise be lost.
    expect(migrated.services[0]!.blocks.map((b) => b.id)).toEqual(["legacy-brief", "cost", "campus"]);
    expect(migrated.services[0]!.blocks[0]).toMatchObject({ kind: "long", label: "Tell us more", description: "What do you need, and what should it achieve?", required: true });
    expect(migrated.services[0]!.blocks[1]).toMatchObject({ kind: "short", label: "Cost centre", description: "Ask your finance officer", required: true });
    expect(migrated.services[0]!.blocks[2]).toMatchObject({ kind: "multi", label: "Campus" });

    // And it is read straight off a workspace that still has one stored.
    expect(resolveBookingTemplate({ bookingForm: legacy as never }).version).toBe(2);
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

describe("everything a request validates against at once", () => {
  it("gathers the problems of every step, keyed by the question that has one", () => {
    const template = defaultBookingFormTemplate();
    const broken = request({ title: "", answers: {} });
    const problems = validateBookingAgainstTemplate(broken, template);
    expect(problems["std-title"]).toBe("What should we call this? is required");
    expect(problems["design-what"]).toBe("What are you asking for? is required");
    expect(validateBookingAgainstTemplate(request(), template)).toEqual({});
  });
});
