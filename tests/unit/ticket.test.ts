import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { DEFAULT_TICKET_PREFIX, LINK_FIELD_TICKET, formatTicket, normaliseTicket, normaliseTicketPrefix, parseTicket, withTicketPrefix } from "@/domain";
import { createServices, TicketError } from "@/services";

let counter = 0;
function freshServices() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `ticket-db-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

const DANH = SEED_USER_IDS.danh;

async function firstGroup(services: ReturnType<typeof freshServices>["services"], boardId: string) {
  return (await services.repos.boards.listGroups(boardId))[0]!.id;
}

/** A task on a board, with no ticket until something gives it one. */
async function task(services: ReturnType<typeof freshServices>["services"], boardId: string, name: string) {
  return services.items.createItem({ boardId, groupId: await firstGroup(services, boardId), name }, DANH);
}

/**
 * The number the next ticket will carry.
 *
 * The demo workspace arrives already ticketed, the way a real one would be by
 * the time anybody changes anything, so these tests read the series rather than
 * assuming it starts at one.
 */
async function nextNumber(services: ReturnType<typeof freshServices>["services"]): Promise<number> {
  const workspace = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!;
  return (workspace.ticketCounter ?? 0) + 1;
}

/** Tickets nothing in the demo data holds: their own prefix, well clear of the series. */
const SPARE = "QA_901";
const SPARE_TWO = "QA_902";

describe("the shape of a ticket", () => {
  it("is a prefix, an underscore and a number padded to three", () => {
    expect(formatTicket("CP", 1)).toBe("CP_001");
    expect(formatTicket("CP", 14)).toBe("CP_014");
    expect(formatTicket("CP", 999)).toBe("CP_999");
    // Past the padding it simply keeps counting rather than wrapping or stopping.
    expect(formatTicket("CP", 1000)).toBe("CP_1000");
    expect(formatTicket("PROD", 7)).toBe("PROD_007");
  });

  it("falls back to the default prefix when a workspace has never chosen one", () => {
    expect(formatTicket(null, 3)).toBe(`${DEFAULT_TICKET_PREFIX}_003`);
    expect(formatTicket("", 3)).toBe(`${DEFAULT_TICKET_PREFIX}_003`);
  });

  it("reads a ticket back into the two things it is made of", () => {
    expect(parseTicket("CP_014")).toEqual({ prefix: "CP", number: 14 });
    expect(parseTicket("PROD_1000")).toEqual({ prefix: "PROD", number: 1000 });
    expect(parseTicket("CP_000")).toBeNull();
    expect(parseTicket("hello")).toBeNull();
    expect(parseTicket(null)).toBeNull();
  });

  it("is lenient about how somebody types it, and refuses what is not one", () => {
    expect(normaliseTicket("cp_14")).toBe("CP_014");
    expect(normaliseTicket("  cp-14 ")).toBe("CP_014");
    expect(normaliseTicket("cp 14")).toBe("CP_014");
    // Not a ticket is null, rather than something invented that would collide later.
    expect(normaliseTicket("hello")).toBeNull();
    expect(normaliseTicket("CP_")).toBeNull();
    expect(normaliseTicket("")).toBeNull();
    expect(normaliseTicket(null)).toBeNull();
  });

  it("tidies a prefix to letters and digits, and keeps the number when one is swapped in", () => {
    expect(normaliseTicketPrefix(" cp ")).toBe("CP");
    expect(normaliseTicketPrefix("c-p")).toBe("CP");
    expect(normaliseTicketPrefix("!!!")).toBeNull();
    expect(normaliseTicketPrefix("abcdefghijkl")).toBe("ABCDEFGH");
    expect(withTicketPrefix("CP_014", "PROD")).toBe("PROD_014");
    expect(withTicketPrefix(null, "PROD")).toBeNull();
  });
});

describe("handing out tickets", () => {
  it("counts up, in the order they are asked for", async () => {
    const { services } = freshServices();
    const n = await nextNumber(services);
    expect(await services.tickets.issue(SEED_WORKSPACE_ID)).toBe(formatTicket("CP", n));
    expect(await services.tickets.issue(SEED_WORKSPACE_ID)).toBe(formatTicket("CP", n + 1));
    expect(await services.tickets.issueMany(SEED_WORKSPACE_ID, 3)).toEqual([formatTicket("CP", n + 2), formatTicket("CP", n + 3), formatTicket("CP", n + 4)]);
  });

  it("never hands the same number to two askers, however they overlap", async () => {
    const { services } = freshServices();
    // The whole point of the counter: fifty at once, and fifty different answers.
    const issued = await Promise.all(Array.from({ length: 50 }, () => services.tickets.issue(SEED_WORKSPACE_ID)));
    expect(new Set(issued).size).toBe(50);
  });

  it("gives a task that arrived some other way the next one in the series", async () => {
    const { services } = freshServices();
    const item = await task(services, SEED_BOARD_IDS.rmitinerary, "Added straight to the board");
    expect(item.ticket ?? null).toBeNull();

    const n = await nextNumber(services);
    const ticketed = await services.tickets.assign(SEED_WORKSPACE_ID, item.id, DANH);
    expect(ticketed.ticket).toBe(formatTicket("CP", n));
  });

  it("does not burn a number on a task that already has one", async () => {
    const { services } = freshServices();
    const item = await task(services, SEED_BOARD_IDS.rmitinerary, "Already ticketed");
    const n = await nextNumber(services);
    await services.tickets.assign(SEED_WORKSPACE_ID, item.id, DANH);

    const again = await services.tickets.assign(SEED_WORKSPACE_ID, item.id, DANH);
    expect(again.ticket).toBe(formatTicket("CP", n));
    expect(await services.tickets.issue(SEED_WORKSPACE_ID)).toBe(formatTicket("CP", n + 1));
  });
});

describe("no two tasks with the same ticket", () => {
  it("refuses a ticket another task already holds", async () => {
    const { services } = freshServices();
    const a = await task(services, SEED_BOARD_IDS.rmitinerary, "First");
    const b = await task(services, SEED_BOARD_IDS.dooh, "Second");
    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, SPARE, DANH);

    await expect(services.tickets.setTicket(SEED_WORKSPACE_ID, b.id, SPARE, DANH)).rejects.toBeInstanceOf(TicketError);
    expect((await services.repos.items.getById(b.id))!.ticket ?? null).toBeNull();
  });

  it("names the task holding it, because that is what the person needs to know", async () => {
    const { services } = freshServices();
    const a = await task(services, SEED_BOARD_IDS.rmitinerary, "Open Day posters");
    const b = await task(services, SEED_BOARD_IDS.dooh, "Second");
    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, SPARE, DANH);

    await expect(services.tickets.setTicket(SEED_WORKSPACE_ID, b.id, SPARE, DANH)).rejects.toThrow(/Open Day posters/);
  });

  it("refuses something that is not a ticket rather than storing it", async () => {
    const { services } = freshServices();
    const a = await task(services, SEED_BOARD_IDS.rmitinerary, "First");

    await expect(services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, "not a ticket", DANH)).rejects.toBeInstanceOf(TicketError);
    expect((await services.repos.items.getById(a.id))!.ticket ?? null).toBeNull();
  });

  it("lets a task keep its own ticket when it is set again", async () => {
    const { services } = freshServices();
    const a = await task(services, SEED_BOARD_IDS.rmitinerary, "First");
    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, SPARE, DANH);

    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, "qa-901", DANH);
    expect((await services.repos.items.getById(a.id))!.ticket).toBe(SPARE);
  });

  it("frees the ticket when a task gives it up", async () => {
    const { services } = freshServices();
    const a = await task(services, SEED_BOARD_IDS.rmitinerary, "First");
    const b = await task(services, SEED_BOARD_IDS.dooh, "Second");
    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, SPARE, DANH);
    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, null, DANH);

    await services.tickets.setTicket(SEED_WORKSPACE_ID, b.id, SPARE, DANH);
    expect((await services.repos.items.getById(b.id))!.ticket).toBe(SPARE);
  });

  it("keeps a ticket typed in above the series from being handed out again", async () => {
    const { services } = freshServices();
    const a = await task(services, SEED_BOARD_IDS.rmitinerary, "Imported from the old spreadsheet");
    const ahead = (await nextNumber(services)) + 9;
    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, formatTicket("CP", ahead), DANH);

    // Nothing has moved the counter, so the series would walk straight into it.
    expect(await services.tickets.reconcileCounter(SEED_WORKSPACE_ID)).toBe(10);
    expect(await services.tickets.issue(SEED_WORKSPACE_ID)).toBe(formatTicket("CP", ahead + 1));
  });
});

describe("linked tasks and the ticket they share", () => {
  async function twoTasks() {
    const { services } = freshServices();
    const a = await task(services, SEED_BOARD_IDS.rmitinerary, "Poster set");
    const b = await task(services, SEED_BOARD_IDS.dooh, "Poster set");
    return { services, a, b };
  }

  it("carries the ticket to a task that has none", async () => {
    const { services, a, b } = await twoTasks();
    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, SPARE, DANH);

    await services.links.link(a.id, b.id, DANH, { seedFrom: "item" });

    expect((await services.repos.items.getById(b.id))!.ticket).toBe(SPARE);
  });

  it("fills in the empty side from the other, whichever way round it is", async () => {
    const { services, a, b } = await twoTasks();
    await services.tickets.setTicket(SEED_WORKSPACE_ID, b.id, SPARE, DANH);

    await services.links.link(a.id, b.id, DANH, { seedFrom: "item" });

    expect((await services.repos.items.getById(a.id))!.ticket).toBe(SPARE);
  });

  it("leaves both alone when the link is told not to carry the ticket", async () => {
    const { services, a, b } = await twoTasks();
    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, SPARE, DANH);
    await services.tickets.setTicket(SEED_WORKSPACE_ID, b.id, SPARE_TWO, DANH);

    await services.links.link(a.id, b.id, DANH, { seedFrom: "item", excluded: [LINK_FIELD_TICKET] });

    expect((await services.repos.items.getById(a.id))!.ticket).toBe(SPARE);
    expect((await services.repos.items.getById(b.id))!.ticket).toBe(SPARE_TWO);
  });

  it("is the one case where two tasks may hold one ticket", async () => {
    const { services, a, b } = await twoTasks();
    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, SPARE, DANH);
    await services.links.link(a.id, b.id, DANH, { seedFrom: "item" });

    // Setting it again on the far side is agreement, not a collision.
    await expect(services.tickets.setTicket(SEED_WORKSPACE_ID, b.id, SPARE, DANH)).resolves.toBeTruthy();
    expect(await services.tickets.heldBy(SEED_WORKSPACE_ID, b.id, SPARE)).toBeNull();
  });

  it("stops at a link that does not carry it, so what lies beyond needs its own", async () => {
    const { services, a, b } = await twoTasks();
    const c = await task(services, SEED_BOARD_IDS.sem1, "Poster set");
    await services.tickets.setTicket(SEED_WORKSPACE_ID, a.id, SPARE, DANH);
    await services.links.link(a.id, b.id, DANH, { seedFrom: "item" });
    await services.links.link(b.id, c.id, DANH, { seedFrom: "item", excluded: [LINK_FIELD_TICKET] });

    await expect(services.tickets.setTicket(SEED_WORKSPACE_ID, c.id, SPARE, DANH)).rejects.toBeInstanceOf(TicketError);
  });
});

describe("changing the workspace's prefix", () => {
  it("applies to new tickets and leaves the ones already out alone", async () => {
    const { services } = freshServices();
    const a = await task(services, SEED_BOARD_IDS.rmitinerary, "Booked last week");
    const n = await nextNumber(services);
    await services.tickets.assign(SEED_WORKSPACE_ID, a.id, DANH);

    const change = await services.tickets.setPrefix(SEED_WORKSPACE_ID, "prod", { rewriteExisting: false });
    expect(change).toEqual({ prefix: "PROD", rewritten: 0 });
    expect((await services.repos.items.getById(a.id))!.ticket).toBe(formatTicket("CP", n));
    expect(await services.tickets.issue(SEED_WORKSPACE_ID)).toBe(formatTicket("PROD", n + 1));
  });

  it("rewrites the old ones when asked, keeping every number", async () => {
    const { services } = freshServices();
    const a = await task(services, SEED_BOARD_IDS.rmitinerary, "First");
    const b = await task(services, SEED_BOARD_IDS.dooh, "Second");
    const n = await nextNumber(services);
    await services.tickets.assign(SEED_WORKSPACE_ID, a.id, DANH);
    await services.tickets.assign(SEED_WORKSPACE_ID, b.id, DANH);
    const held = await services.tickets.countTicketed(SEED_WORKSPACE_ID);

    const change = await services.tickets.setPrefix(SEED_WORKSPACE_ID, "PROD", { rewriteExisting: true });
    expect(change).toEqual({ prefix: "PROD", rewritten: held });
    expect((await services.repos.items.getById(a.id))!.ticket).toBe(formatTicket("PROD", n));
    expect((await services.repos.items.getById(b.id))!.ticket).toBe(formatTicket("PROD", n + 1));
  });

  it("keeps a linked pair sharing one ticket through the rewrite", async () => {
    const { services } = freshServices();
    const a = await task(services, SEED_BOARD_IDS.rmitinerary, "Poster set");
    const b = await task(services, SEED_BOARD_IDS.dooh, "Poster set");
    const n = await nextNumber(services);
    await services.tickets.assign(SEED_WORKSPACE_ID, a.id, DANH);
    await services.links.link(a.id, b.id, DANH, { seedFrom: "item" });

    await services.tickets.setPrefix(SEED_WORKSPACE_ID, "PROD", { rewriteExisting: true });

    const after = await Promise.all([services.repos.items.getById(a.id), services.repos.items.getById(b.id)]);
    expect(after[0]!.ticket).toBe(formatTicket("PROD", n));
    expect(after[1]!.ticket).toBe(formatTicket("PROD", n));
  });

  it("refuses a prefix that is not one", async () => {
    const { services } = freshServices();
    await expect(services.tickets.setPrefix(SEED_WORKSPACE_ID, "!!", { rewriteExisting: false })).rejects.toBeInstanceOf(TicketError);
  });
});

describe("booking a task", () => {
  it("takes the next ticket in the workspace's series, and gives the asset lines none", async () => {
    const { services } = freshServices();
    await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, DANH);
    const receipt = await services.booking.book(
      SEED_WORKSPACE_ID,
      {
        title: "Open Day pull-up banners",
        brief: "Three banners for the city campus.",
        requesterName: "Priya Nair",
        requesterEmail: "priya@example.com",
        department: "Marketing",
        assetTypes: ["Print"],
        assets: [
          { name: "Banner A", quantity: 2, spec: null },
          { name: "Banner B", quantity: 1, spec: null },
        ],
        priority: "HIGH",
        dueDate: "2026-10-01",
        referenceUrl: null,
        serviceTypeId: "svc-design",
        subServices: ["Print"],
        answers: {
          "design-what": { kind: "text", text: "Six A1 posters for the Brunswick campus, print ready." },
          "design-specs": { kind: "text", text: "A1 portrait, CMYK." },
          "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
        },
        teamId: null,
        itemId: null,
      },
      null,
    );

    const item = (await services.repos.items.getById(receipt.itemId))!;
    expect(item.ticket).toBe(receipt.ticket);
    expect(item.ticket).toMatch(/^CP_\d{3,}$/);

    // The asset lines are deliverables on the item, not items of their own, so
    // the booking leaves one ticket behind rather than three.
    expect((await services.repos.items.listByBoard(item.boardId)).filter((i) => i.parentItemId === item.id)).toHaveLength(0);
    const lines = await services.repos.itemAssets.listByItem(item.id);
    expect(lines.map((l) => l.name)).toEqual(["Banner A", "Banner B"]);
  });
});
