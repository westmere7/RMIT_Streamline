import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { EVERY_PORTAL_RANGE } from "@/domain";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BoardColumn, Item, PortalScope, StakeholderDepartment } from "@/domain";
import { defaultSettingsFor } from "@/domain";
import { createServices, PortalAccessError, type Services } from "@/services";
import type { ResolvedPortal } from "@/services";

let counter = 0;
const WS = SEED_WORKSPACE_ID;
const BOARD = SEED_BOARD_IDS.rmitinerary;
const ACTOR = SEED_USER_IDS.danh;

/**
 * What the portal shows, and for whom.
 *
 * Two things put a task in front of a stakeholder: a booking made through the
 * portal, and the team's own STAKEHOLDER label. The label is the important half
 * — it is how a stakeholder sees the work they already had — and these pin how
 * it behaves at the edges: a renamed column, a renamed stakeholder, links,
 * subitems, archived work, and the boundary with the stakeholder next door.
 *
 * One portal serves every stakeholder now, so what used to be "this
 * department's link" is "the selector set to this stakeholder". The rules about
 * what may be seen are the ones they always were, which is the point of keeping
 * these: the filter must not have widened anything.
 */
describe("what the portal is allowed to show", () => {
  let services: Services;
  let comm: StakeholderDepartment;
  let event: StakeholderDepartment;
  let column: BoardColumn;
  let items: Item[];

  beforeEach(async () => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `portal-scope-${Date.now()}-${counter}` }));
    const departments = await services.portals.ensureDepartments(WS);
    comm = departments.find((d) => d.name === "Comm.")!;
    event = departments.find((d) => d.name === "Event")!;

    // The seed has no stakeholder column; give the board one, as a workspace would.
    column = await services.repos.boards.createColumn({
      boardId: BOARD,
      name: "Stakeholder",
      type: "STAKEHOLDER",
      settings: defaultSettingsFor("STAKEHOLDER"),
      position: 99,
      width: 124,
      hidden: false,
    });
    items = (await services.repos.items.listByBoard(BOARD)).filter((i) => i.parentItemId === null);
  });

  const label = (item: Item, group: string | null) => services.repos.items.setValue(item.id, column.id, { type: "STAKEHOLDER", group });

  /**
   * The one portal, opened, and read as one stakeholder.
   *
   * The link is the workspace's; the stakeholder is a filter on top of it. Both
   * travel together so a test reads the way the screen does.
   */
  async function open(department: StakeholderDepartment): Promise<PortalReader> {
    const portal = await services.portals.setEnabled(WS, true);
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    return reader(resolved, department);
  }

  interface PortalReader {
    portal: ResolvedPortal;
    scope: PortalScope;
    tasks(): ReturnType<Services["portals"]["tasks"]>;
    board(): ReturnType<Services["portals"]["board"]>;
    task(itemId: string): ReturnType<Services["portals"]["task"]>;
  }

  function reader(portal: ResolvedPortal, department: StakeholderDepartment | null): PortalReader {
    const scope: PortalScope = { stakeholderId: department?.id ?? null, range: EVERY_PORTAL_RANGE };
    return {
      portal,
      scope,
      tasks: () => services.portals.tasks(portal, { scope }),
      board: () => services.portals.board(portal, scope),
      // A task is looked up across everything the link may see: one opened from
      // a search or a pasted address is still this portal's, whichever
      // stakeholder happens to be selected.
      task: (itemId: string) => services.portals.task(portal, itemId, null),
    };
  }

  it("shows every task labelled with the department, not only what was booked", async () => {
    await label(items[0]!, "Comm.");
    await label(items[1]!, "Comm.");
    const resolved = await open(comm);

    const page = await resolved.tasks();
    expect(page.tasks.map((t) => t.id).sort()).toEqual([items[0]!.id, items[1]!.id].sort());
    expect(page.totals.requests).toBe(2);
  });

  it("keeps the two sources in one list, without counting a booking twice", async () => {
    const resolved = await open(comm);
    const receipt = await services.portals.book(resolved.portal, {
      departmentId: comm.id,
      submissionKey: "key-scope-00001",
      request: {
        requesterName: "Priya",
        requesterEmail: "priya@rmit.edu.vn",
        department: null,
        title: "Booked through the portal",
        brief: "The requester's own words.",
        assetTypes: [],
        assets: [],
        teamId: null,
        dueDate: null,
        priority: null,
        referenceUrl: null,
        serviceTypeId: "svc-design",
        subServices: ["Print"],
        answers: {
          "design-what": { kind: "text", text: "Six A1 posters for the Brunswick campus, print ready." },
          "design-specs": { kind: "text", text: "A1 portrait, CMYK." },
          "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
        },
      },
      booking: services.booking,
    });
    // The booked task also picks up the label; it must still list once.
    const booked = (await services.repos.items.getById(receipt.itemId))!;
    await services.repos.items.setValue(booked.id, column.id, { type: "STAKEHOLDER", group: "Comm." });
    await label(items[0]!, "Comm.");

    const page = await resolved.tasks();
    expect(page.tasks).toHaveLength(2);
    expect(page.totals.requests).toBe(2);
  });

  it("finds the column by type, so renaming it changes nothing", async () => {
    await label(items[0]!, "Comm.");
    await services.repos.boards.updateColumn(column.id, { name: "Requested by" });
    const resolved = await open(comm);
    expect((await resolved.tasks()).tasks).toHaveLength(1);
  });

  it("keeps the stakeholders apart in the list, and together in the total", async () => {
    await label(items[0]!, "Comm.");
    await label(items[1]!, "Event");
    const commPortal = await open(comm);
    const eventPortal = await open(event);

    expect((await commPortal.tasks()).tasks.map((t) => t.id)).toEqual([items[0]!.id]);
    expect((await eventPortal.tasks()).tasks.map((t) => t.id)).toEqual([items[1]!.id]);

    // One portal now, so the filter is what separates them rather than the
    // link: with nobody selected both are on screen, and each row says who it
    // is for.
    const everyone = await services.portals.tasks(commPortal.portal);
    expect(everyone.tasks.map((t) => t.id).sort()).toEqual([items[0]!.id, items[1]!.id].sort());
    expect(everyone.tasks.find((t) => t.id === items[1]!.id)?.stakeholder?.name).toBe("Event");
  });

  it("refuses a task that no stakeholder has a claim on, whatever the filter says", async () => {
    await label(items[0]!, "Comm.");
    const portal = await open(comm);
    // Unlabelled, unbooked, and on a board the team runs: nothing about the
    // portal reaches it, and asking for it by id says so.
    const stranger = items.find((item) => item.id !== items[0]!.id)!;
    await expect(portal.task(stranger.id)).rejects.toBeInstanceOf(PortalAccessError);
  });

  it("follows a department through a rename, because the cells come with it", async () => {
    await label(items[0]!, "Comm.");
    const resolved = await open(comm);
    expect((await resolved.tasks()).tasks).toHaveLength(1);

    const lists = await services.lists.lists(WS);
    await services.lists.save(
      WS,
      "STAKEHOLDER_GROUPS",
      lists.STAKEHOLDER_GROUPS.map((o) => (o.name === "Comm." ? { ...o, name: "Communications" } : o)),
      { "Comm.": "Communications" },
    );

    // Same portal, same link, same task — the label was carried along, and the
    // stakeholder kept its id through the rename.
    const renamed = (await services.portals.departments(WS)).find((d) => d.id === comm.id)!;
    expect(renamed.name).toBe("Communications");
    const after = reader(resolved.portal, renamed);
    expect((await after.tasks()).tasks.map((t) => t.id)).toEqual([items[0]!.id]);
  });

  it("leaves out subitems, archived work and cleared labels", async () => {
    await label(items[0]!, "Comm.");
    await label(items[1]!, "Comm.");
    const subitem = await services.repos.items.create({ boardId: BOARD, groupId: items[0]!.groupId, name: "A step", parentItemId: items[0]!.id, createdBy: ACTOR, position: 0 });
    await services.repos.items.setValue(subitem.id, column.id, { type: "STAKEHOLDER", group: "Comm." });

    const resolved = await open(comm);
    // The subitem belongs inside its parent, not beside it.
    expect((await resolved.tasks()).tasks.map((t) => t.id).sort()).toEqual([items[0]!.id, items[1]!.id].sort());

    await services.repos.items.update(items[1]!.id, { archivedAt: new Date().toISOString() });
    expect((await resolved.tasks()).tasks.map((t) => t.id)).toEqual([items[0]!.id]);

    await label(items[0]!, null);
    expect((await resolved.tasks()).tasks).toHaveLength(0);
  });

  it("moves a task when its stakeholder is changed", async () => {
    await label(items[0]!, "Comm.");
    const commPortal = await open(comm);
    const eventPortal = await open(event);
    expect((await commPortal.tasks()).tasks.map((t) => t.id)).toEqual([items[0]!.id]);

    // The board reassigns it. Changing the cell plainly means "this is Event's
    // now", so it appears there and stops appearing under Comm.
    await label(items[0]!, "Event");
    expect((await commPortal.tasks()).tasks).toHaveLength(0);
    expect((await eventPortal.tasks()).tasks.map((t) => t.id)).toEqual([items[0]!.id]);
    // The task is still the portal's — one link covers every stakeholder — so
    // it opens by id and names its new owner.
    expect((await commPortal.task(items[0]!.id)).stakeholder?.name).toBe("Event");
  });

  it("moves a booked request too, but keeps it when nothing is labelled", async () => {
    const resolved = await open(comm);
    const receipt = await services.portals.book(resolved.portal, {
      departmentId: comm.id,
      submissionKey: "key-scope-00002",
      request: {
        requesterName: "Priya",
        requesterEmail: "priya@rmit.edu.vn",
        department: null,
        title: "Booked with Comm.",
        brief: "The requester's own words.",
        assetTypes: [],
        assets: [],
        teamId: null,
        dueDate: null,
        priority: null,
        referenceUrl: null,
        serviceTypeId: "svc-design",
        subServices: ["Print"],
        answers: {
          "design-what": { kind: "text", text: "Six A1 posters for the Brunswick campus, print ready." },
          "design-specs": { kind: "text", text: "A1 portrait, CMYK." },
          "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
        },
      },
      booking: services.booking,
    });

    // Unlabelled, the booking stays with the department that took it.
    expect((await resolved.tasks()).tasks.map((t) => t.id)).toEqual([receipt.itemId]);

    // Labelled elsewhere, it goes there — the cell is the team's own statement
    // about who the work is for, and it outranks where the form was filled in.
    //
    // The cell to edit is the one on the request's own board. A portal booking
    // fills in the receiving board's STAKEHOLDER column itself, so relabelling
    // means overwriting that value; writing to some other board's column would
    // leave the original standing and the request would answer to both.
    const booked = (await services.repos.items.getById(receipt.itemId))!;
    const ownColumn = (await services.repos.boards.listColumns(booked.boardId)).find((c) => c.type === "STAKEHOLDER")!;
    expect(ownColumn).toBeDefined();
    await services.repos.items.setValue(booked.id, ownColumn.id, { type: "STAKEHOLDER", group: "Event" });
    expect((await resolved.tasks()).tasks).toHaveLength(0);
    const eventPortal = await open(event);
    expect((await eventPortal.tasks()).tasks.map((t) => t.id)).toEqual([receipt.itemId]);
  });

  it("refuses a booking on a link the team has set to reading only", async () => {
    const resolved = await open(comm);
    await services.portals.setPresentation(WS, { allowBooking: false });
    const closed = reader(await services.portals.resolve({ token: resolved.portal.portal.token, password: null }), comm);

    const attempt = services.portals.book(closed.portal, {
      departmentId: comm.id,
      submissionKey: "key-scope-00003",
      request: {
        requesterName: "Priya",
        requesterEmail: "priya@rmit.edu.vn",
        department: null,
        title: "Should not land",
        brief: "The link is for reading.",
        assetTypes: [],
        assets: [],
        teamId: null,
        dueDate: null,
        priority: null,
        referenceUrl: null,
        serviceTypeId: "svc-design",
        subServices: ["Print"],
        answers: {
          "design-what": { kind: "text", text: "Six A1 posters for the Brunswick campus, print ready." },
          "design-specs": { kind: "text", text: "A1 portrait, CMYK." },
          "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
        },
      },
      booking: services.booking,
    });
    // Refused on the server, not by hiding a button.
    await expect(attempt).rejects.toBeInstanceOf(PortalAccessError);
    // And reading still works: this setting is about requests, not access.
    expect((await closed.tasks()).tasks).toHaveLength(0);
  });

  it("keeps the presentation to presentation, and trims what it stores", async () => {
    const portal = await services.portals.setPresentation(WS, {
      description: `   ${"x".repeat(400)}   `,
      hiddenColumns: ["priority", "priority", "not-a-column" as never],
      defaultView: "kanban",
    });

    expect(portal.description).toHaveLength(280);
    // Deduplicated, and anything that is not a column of this board is dropped.
    expect(portal.hiddenColumns).toEqual(["priority"]);
    expect(portal.defaultView).toBe("kanban");
    // An unknown view is ignored rather than stored and rendered as nothing.
    expect((await services.portals.setPresentation(WS, { defaultView: "spreadsheet" as never })).defaultView).toBe("kanban");
    // Emptying the description clears it rather than storing a blank line.
    expect((await services.portals.setPresentation(WS, { description: "  " })).description).toBeNull();
  });

  it("lists a linked pair once, and prefers the booked side", async () => {
    const [a, b] = [items[0]!, items[1]!];
    await label(a, "Comm.");
    await label(b, "Comm.");
    await services.repos.links.create({ workspaceId: WS, itemIds: [a.id, b.id], createdBy: ACTOR });
    // One of them was booked here, so that is the one the department knows.
    await services.portals.associate({ workspaceId: WS, departmentId: comm.id, itemId: b.id, source: "PORTAL_BOOKING", publicBrief: "Booked." });

    const resolved = await open(comm);
    const page = await resolved.tasks();
    expect(page.tasks).toHaveLength(1);
    expect(page.tasks[0]!.id).toBe(b.id);
    expect(page.totals.requests).toBe(1);
  });

  it("gives a labelled task no brief, and never borrows the description for one", async () => {
    await services.repos.items.update(items[0]!.id, { description: "Internal notes.\n\nRequest details\nEmail: someone@rmit.edu.vn" });
    await label(items[0]!, "Comm.");
    const resolved = await open(comm);

    const detail = await resolved.task(items[0]!.id);
    expect(detail.brief).toBeNull();
    expect(JSON.stringify(detail)).not.toContain("someone@rmit.edu.vn");
    expect(JSON.stringify(detail)).not.toContain("Request details");
  });

  it("lists one portal and every stakeholder behind it, and creates the portal shut", async () => {
    await label(items[0]!, "Comm.");
    await label(items[1]!, "Comm.");

    const overview = await services.portals.overview(WS);
    expect(overview.departments.map((row) => row.department.name)).toContain("Comm.");
    // One portal, and shut is the state it starts in: the screen exists to
    // change that, and making a workspace must never publish anything.
    expect(overview.portal.departmentId).toBeNull();
    expect(overview.portal.enabled).toBe(false);
  });
});
