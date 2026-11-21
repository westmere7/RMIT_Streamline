import { beforeEach, describe, expect, it } from "vitest";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { Board, BookingRequest, Item, Team } from "@/domain";
import { intakeGroupOf, serviceById } from "@/domain";
import { createServices } from "@/services";

/**
 * When a booked task reached a team (items.allocated_at, v0.141.1), case by
 * case: straight to a team's board, allocated off Task Allocation, moved,
 * re-allocated and allocated again, a booking that falls back to the queue,
 * and the tasks that never get one.
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
  subServices: ["Print"],
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

describe("allocation time", { timeout: 30_000 }, () => {
  let services: ReturnType<typeof createServices>;
  let team: Team;
  let teamBoard: Board;
  let otherBoard: Board;
  let queue: Board;

  const key = async () => (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;
  /** Publishes the form with the design service going to the team (its nominated board) or, with null, to Task Allocation. */
  const designGoesTo = async (teamId: string | null) => {
    const template = fixtureBookingFormTemplate();
    const design = serviceById(template, "svc-design")!;
    design.teamId = teamId;
    design.routing = null;
    await services.booking.publishForm(SEED_WORKSPACE_ID, template, "Allocation time", { publishedBy: owner });
  };
  const book = async () => services.booking.submit({ workspaceSlug: "rmit", key: await key(), request: request() });
  const item = async (id: string) => (await services.repos.items.getById(id))!;
  const queueGroup = async () => {
    const groups = await services.repos.boards.listGroups(queue.id);
    const intake = intakeGroupOf(groups)!;
    return groups.find((g) => g.id !== intake.id)!;
  };
  const within = (iso: string | null | undefined, before: number, after: number) => {
    expect(iso).toBeTruthy();
    const t = new Date(iso!).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  };

  beforeEach(async () => {
    services = createServices(createLocalRepositories({ databaseName: `alloc-time-${Date.now()}-${Math.random()}` }));
    queue = (await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner)).board;
    const teams = await services.repos.teams.listByWorkspace(SEED_WORKSPACE_ID);
    const boards = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => !b.archivedAt && !b.system);
    team = teams.find((t) => !t.system && boards.some((b) => b.teamId === t.id))!;
    teamBoard = boards.find((b) => b.teamId === team.id)!;
    otherBoard = boards.find((b) => b.id !== teamBoard.id)!;
    await services.workspace.updateTeam(team.id, { bookingBoardId: teamBoard.id });
  });

  it("a booking straight to a team's board is allocated as it arrives", async () => {
    await designGoesTo(team.id);
    const receipt = await book();
    expect(receipt.boardId).toBe(teamBoard.id);
    const task = await item(receipt.itemId);
    expect(task).toMatchObject({ bookedVia: "booking", allocatedAt: task.createdAt });
  });

  it("a booking waiting on Task Allocation has none; allocating it sets it; moving it on keeps it", async () => {
    await designGoesTo(null);
    const receipt = await book();
    expect(receipt.boardId).toBe(queue.id);
    expect(await item(receipt.itemId)).toMatchObject({ bookedVia: "booking", allocatedAt: null });

    const before = Date.now();
    const { item: allocated } = await services.booking.allocate(receipt.itemId, teamBoard.id, owner);
    within(allocated.allocatedAt, before, Date.now());
    expect((await item(receipt.itemId)).allocatedAt).toBe(allocated.allocatedAt);

    const { item: moved } = await services.itemMoves.moveToBoard(receipt.itemId, otherBoard.id, owner);
    expect(moved.allocatedAt).toBe(allocated.allocatedAt);
    expect((await item(receipt.itemId)).allocatedAt).toBe(allocated.allocatedAt);
  });

  it("re-allocating clears it, and allocating again sets it again, later", async () => {
    await designGoesTo(team.id);
    const receipt = await book();
    const first = (await item(receipt.itemId)).allocatedAt!;
    expect(first).toBeTruthy();

    const { item: back } = await services.reallocation.reallocate(receipt.itemId, owner, { groupId: (await queueGroup()).id });
    expect(back).toMatchObject({ boardId: queue.id, allocatedAt: null, bookedVia: "booking" });

    await new Promise((r) => setTimeout(r, 5));
    const before = Date.now();
    const { item: again } = await services.booking.allocate(receipt.itemId, otherBoard.id, owner);
    within(again.allocatedAt, before, Date.now());
    expect(new Date(again.allocatedAt!).getTime()).toBeGreaterThan(new Date(first).getTime());
  });

  it("a booking whose board has gone waits on Task Allocation, without one", async () => {
    await designGoesTo(team.id);
    await services.repos.boards.update(teamBoard.id, { archivedAt: new Date().toISOString() });
    const receipt = await book();
    expect(receipt.boardId).toBe(queue.id);
    expect((await item(receipt.itemId)).allocatedAt).toBeNull();
  });

  it("a portal request straight to a team's board is allocated as it arrives", async () => {
    const group = (await services.repos.boards.listGroups(teamBoard.id))[0]!;
    const task = await services.items.createItem({ boardId: teamBoard.id, groupId: group.id, name: "Portal ask", activity: { via: "portal" } }, owner);
    expect(task).toMatchObject({ bookedVia: "portal", allocatedAt: task.createdAt });
  });

  it("never: a team's own task, its copy, a subitem of a booking, or a copy of a booked task", async () => {
    const group = (await services.repos.boards.listGroups(teamBoard.id))[0]!;
    const own: Item = await services.items.createItem({ boardId: teamBoard.id, groupId: group.id, name: "Team's own" }, owner);
    expect(own).toMatchObject({ bookedVia: null, allocatedAt: null });

    await designGoesTo(team.id);
    const receipt = await book();
    const sub = await services.items.createItem({ boardId: teamBoard.id, groupId: group.id, parentItemId: receipt.itemId, name: "A step", activity: { via: "booking" } }, owner);
    expect(sub).toMatchObject({ bookedVia: null, allocatedAt: null });
    const copy = await services.items.duplicateItem(receipt.itemId, owner);
    expect(copy.bookedVia ?? null).toBeNull();
    expect(copy.allocatedAt ?? null).toBeNull();
  });
});
