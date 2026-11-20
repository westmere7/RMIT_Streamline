import { beforeEach, describe, expect, it } from "vitest";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { Board, BookingFormTemplate, BookingRequest, BookingRouting, Team } from "@/domain";
import { bookingDestination, serviceById } from "@/domain";
import { allocationRecap } from "@/features/booking/editor/published-form";
import { createServices } from "@/services";

/**
 * Routing a booking by the work types picked (v0.121.0), case by case, and the
 * booking link: nothing about publishing, re-publishing or routing changes it.
 *
 * Every booking goes through BookingService.book — the public link (with its
 * key), a signed-in member and the stakeholder portal — so each path is run.
 */

const owner = SEED_USER_IDS.danh;

const request = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  requesterName: "Priya Nair",
  requesterEmail: "priya@rmit.edu.au",
  department: "Comm.",
  title: "Open Day posters",
  brief: "",
  assetTypes: [],
  assets: [{ name: "A1 poster", quantity: 6, spec: "CMYK", assetType: null }],
  serviceTypeId: "svc-design",
  subServices: [],
  teamId: null,
  dueDate: "2026-12-01",
  priority: "High",
  referenceUrl: null,
  answers: {
    "design-what": { kind: "text", text: "Six A1 posters for the campus." },
    "design-specs": { kind: "text", text: "A1 portrait." },
    "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
  },
  ...overrides,
});

describe("routing a booking by its work types", { timeout: 20_000 }, () => {
  let services: ReturnType<typeof createServices>;
  let teams: Team[];
  let boards: Board[];
  // Four ordinary boards: the team's own, and three a rule can name.
  let teamBoard: Board;
  let printBoard: Board;
  let socialBoard: Board;
  let otherBoard: Board;
  let team: Team;
  let allocation: Board;

  const key = async () => (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;
  const publish = async (edit: (t: BookingFormTemplate) => void) => {
    const template = fixtureBookingFormTemplate();
    edit(template);
    await services.booking.publishForm(SEED_WORKSPACE_ID, template, "Routing test", { publishedBy: owner });
  };
  const route = (routing: BookingRouting | null, teamId: string | null = team.id) =>
    publish((t) => {
      const design = serviceById(t, "svc-design")!;
      design.teamId = teamId;
      design.routing = routing;
    });
  const bookPublic = async (subServices: string[], extra: Partial<BookingRequest> = {}) =>
    services.booking.submit({ workspaceSlug: "rmit", key: await key(), request: request({ subServices, ...extra }) });

  beforeEach(async () => {
    services = createServices(createLocalRepositories({ databaseName: `routing-${Date.now()}-${Math.random()}` }));
    const system = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    allocation = system.board;
    teams = await services.repos.teams.listByWorkspace(SEED_WORKSPACE_ID);
    boards = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => !b.archivedAt && !b.system);
    team = teams.find((t) => !t.system && boards.filter((b) => b.teamId === t.id).length >= 1)!;
    teamBoard = boards.find((b) => b.teamId === team.id)!;
    [printBoard, socialBoard, otherBoard] = boards.filter((b) => b.id !== teamBoard.id) as [Board, Board, Board];
    await services.workspace.updateTeam(team.id, { bookingBoardId: teamBoard.id });
  });

  const rules = (): BookingRouting => ({
    enabled: true,
    rules: [
      { id: "r-print", workTypes: ["Print"], boardId: printBoard.id },
      { id: "r-social", workTypes: ["Digital / Social", "Key Visual"], boardId: socialBoard.id },
    ],
    otherwise: { kind: "board", boardId: otherBoard.id },
  });

  it("1. off, or never set: the team's nominated board, as before", async () => {
    await route(null);
    expect((await bookPublic(["Print"])).boardId).toBe(teamBoard.id);
    await route({ ...rules(), enabled: false });
    expect((await bookPublic(["Print"])).boardId).toBe(teamBoard.id);
  });

  it("2. one work type picked: the rule naming it", async () => {
    await route(rules());
    expect((await bookPublic(["Print"])).boardId).toBe(printBoard.id);
    expect((await bookPublic(["Key Visual"])).boardId).toBe(socialBoard.id);
  });

  it("3. several picked, two rules match: the first rule wins, whatever order they were picked in", async () => {
    await route(rules());
    expect((await bookPublic(["Digital / Social", "Print"])).boardId).toBe(printBoard.id);
    // Rules swapped round: now the other one is first.
    const swapped = rules();
    swapped.rules.reverse();
    await route(swapped);
    expect((await bookPublic(["Digital / Social", "Print"])).boardId).toBe(socialBoard.id);
  });

  it("3b. a rule can ask for exactly its work types, or just for any of them", async () => {
    // Exactly Print and Key Visual -> social; anything that includes Print -> print; the rest -> other.
    await route({
      enabled: true,
      rules: [
        { id: "exact", workTypes: ["Print", "Key Visual"], boardId: socialBoard.id, match: "exact" },
        { id: "any", workTypes: ["Print"], boardId: printBoard.id },
      ],
      otherwise: { kind: "board", boardId: otherBoard.id },
    });
    expect((await bookPublic(["Key Visual", "Print"])).boardId).toBe(socialBoard.id); // exactly the pair, any order
    expect((await bookPublic(["Print"])).boardId).toBe(printBoard.id); // fewer: not exact, but includes Print
    expect((await bookPublic(["Print", "Key Visual", "Publication"])).boardId).toBe(printBoard.id); // more: not exact
    expect((await bookPublic(["Key Visual"])).boardId).toBe(otherBoard.id); // neither rule
  });

  it("3c. a board picked directly, over the team's nominated one, and back to the team's when it has gone", async () => {
    await publish((t) => {
      const design = serviceById(t, "svc-design")!;
      design.teamId = team.id;
      design.boardId = socialBoard.id;
    });
    expect((await bookPublic(["Print"])).boardId).toBe(socialBoard.id);
    expect((await bookPublic(["Publication"])).boardId).toBe(socialBoard.id);
    const form = await services.booking.getForm({ workspaceSlug: "rmit", key: await key() });
    expect(form.boards?.map((b) => b.id)).toEqual([socialBoard.id]);
    expect(bookingDestination(serviceById(form.template, "svc-design")!, ["Print"], form)).toMatchObject({ kind: "board", boardName: socialBoard.name });
    // Auto-allocation on takes over from it.
    await publish((t) => {
      const design = serviceById(t, "svc-design")!;
      design.teamId = team.id;
      design.boardId = socialBoard.id;
      design.routing = rules();
    });
    expect((await bookPublic(["Print"])).boardId).toBe(printBoard.id);
    // Gone: the team's own board.
    await publish((t) => {
      const design = serviceById(t, "svc-design")!;
      design.teamId = team.id;
      design.boardId = socialBoard.id;
    });
    await services.repos.boards.update(socialBoard.id, { archivedAt: new Date().toISOString() });
    expect((await bookPublic(["Print"])).boardId).toBe(teamBoard.id);
  });

  it("4. nothing matches: the fallback, which may be a board, the team's board or the queue", async () => {
    await route(rules());
    expect((await bookPublic(["Publication"])).boardId).toBe(otherBoard.id);
    // A service that offers work types wants one: none picked is refused before it routes anywhere.
    await expect(bookPublic([])).rejects.toThrow(/pick at least one/);
    await route({ ...rules(), otherwise: { kind: "team" } });
    expect((await bookPublic(["Publication"])).boardId).toBe(teamBoard.id);
    // The queue even though the team has a board: that is what was asked for.
    await route({ ...rules(), otherwise: { kind: "allocation" } });
    const queued = await bookPublic(["Publication"]);
    expect(queued.boardId).toBe(allocation.id);
    expect(queued.teamName).toBeNull();
  });

  it("5. a work type the service does not offer, sent anyway, routes nowhere special", async () => {
    // A rule left naming one the service no longer offers, and a caller sending it.
    await route({ ...rules(), rules: [{ id: "stale", workTypes: ["Retired type"], boardId: printBoard.id }] });
    // Dropped before routing, so it cannot reach the rule; with a real one beside it, the fallback.
    expect((await bookPublic(["Retired type", "Publication"])).boardId).toBe(otherBoard.id);
    // On its own it is no work type at all.
    await expect(bookPublic(["Retired type"])).rejects.toThrow(/pick at least one/);
  });

  it("6. a rule's board that has gone falls back to the team's board, then the queue", async () => {
    await route(rules());
    await services.repos.boards.update(printBoard.id, { archivedAt: new Date().toISOString() });
    expect((await bookPublic(["Print"])).boardId).toBe(teamBoard.id);
    // A team with no board of its own: the queue, never an error.
    await services.workspace.updateTeam(team.id, { bookingBoardId: null });
    expect((await bookPublic(["Print"])).boardId).toBe(allocation.id);
    // A board id that never existed.
    await route({ ...rules(), rules: [{ id: "ghost", workTypes: ["Print"], boardId: "00000000-0000-4000-8000-00000000dead" }] });
    expect((await bookPublic(["Print"])).boardId).toBe(allocation.id);
  });

  it("7. a service with no team can still send bookings to a board, and the receipt names that board's team", async () => {
    await route(rules(), null);
    const receipt = await bookPublic(["Print"]);
    expect(receipt.boardId).toBe(printBoard.id);
    const printTeam = teams.find((t) => t.id === printBoard.teamId);
    expect(receipt.teamName).toBe(printTeam?.name ?? printBoard.name);
    // Its fallback of "the team" with no team is the queue.
    await route({ ...rules(), otherwise: { kind: "team" } }, null);
    expect((await bookPublic(["Publication"])).boardId).toBe(allocation.id);
  });

  it("8. the task lands whole on the routed board: values in its columns, assets with it", async () => {
    await route(rules());
    const receipt = await bookPublic(["Print"]);
    const item = (await services.repos.items.getById(receipt.itemId))!;
    expect(item.boardId).toBe(printBoard.id);
    const columns = await services.repos.boards.listColumns(printBoard.id);
    const values = await services.repos.items.listValuesByItem(item.id);
    expect(values.every((v) => columns.some((c) => c.id === v.columnId))).toBe(true);
    const assets = await services.repos.itemAssets.listByItem(item.id);
    expect(assets.map((a) => a.name)).toEqual(["A1 poster"]);
    expect(assets.every((a) => a.boardId === printBoard.id)).toBe(true);
  });

  it("9. every way in routes the same: a signed-in member, and the stakeholder portal", async () => {
    await route(rules());
    const member = await services.booking.book(SEED_WORKSPACE_ID, request({ subServices: ["Print"] }), owner);
    expect(member.boardId).toBe(printBoard.id);
    const portal = await services.booking.book(SEED_WORKSPACE_ID, request({ subServices: ["Key Visual"] }), null, "Comm.");
    expect(portal.boardId).toBe(socialBoard.id);
  });

  it("10. the form says beforehand where it will go, and agrees with where it went", async () => {
    await route(rules());
    const form = await services.booking.getForm({ workspaceSlug: "rmit", key: await key() });
    const design = serviceById(form.template, "svc-design")!;
    for (const picked of [["Print"], ["Key Visual", "Print"], ["Publication"], ["Installation", "Others"]]) {
      const said = bookingDestination(design, picked, form);
      const went = await bookPublic(picked);
      expect(said.kind).toBe("board");
      if (said.kind === "board") expect(said.boardName).toBe(went.boardName);
    }
    // Only the boards the routing names are listed for a public form.
    expect(form.boards?.map((b) => b.id).sort()).toEqual([printBoard.id, socialBoard.id, otherBoard.id].sort());
  });

  it("11. the booking link never changes: publishing, re-publishing, resetting and routing keep the key, and the old link still books", async () => {
    const before = await key();
    await route(rules());
    await route({ ...rules(), enabled: false });
    const past = await services.booking.listPublications(SEED_WORKSPACE_ID);
    await services.booking.republish(SEED_WORKSPACE_ID, past[past.length - 1]!.id, owner);
    await services.booking.resetForm(SEED_WORKSPACE_ID, owner);
    await services.booking.saveDraft(SEED_WORKSPACE_ID, fixtureBookingFormTemplate());
    expect(await key()).toBe(before);
    // The link handed out before all of that still books.
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: before, request: request({ serviceTypeId: "svc-design", answers: request().answers }) });
    expect(receipt.ticket).toBeTruthy();
    // Only regenerating it does, on purpose.
    await services.workspace.regenerateBookingKey(SEED_WORKSPACE_ID);
    expect(await key()).not.toBe(before);
  });
});

describe("the published form's allocation recap", () => {
  it("counts services by where they send bookings", () => {
    const template = fixtureBookingFormTemplate();
    expect(allocationRecap(template)).toBe("3 to Task Allocation");
    serviceById(template, "svc-design")!.routing = { enabled: true, rules: [], otherwise: { kind: "team" } };
    serviceById(template, "svc-brand")!.teamId = "00000000-0000-4000-8000-000000000001";
    expect(allocationRecap(template)).toBe("1 auto-allocated · 1 to a team · 1 to Task Allocation");
    serviceById(template, "svc-production")!.boardId = "00000000-0000-4000-8000-000000000002";
    expect(allocationRecap(template)).toBe("1 auto-allocated · 1 to a board · 1 to a team");
  });
});
