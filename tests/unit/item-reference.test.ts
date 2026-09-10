import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { ITEM_REFERENCE_MAX, LINK_FIELD_REFERENCE, bookingReference, normaliseItemReference } from "@/domain";
import { createServices } from "@/services";

let counter = 0;
function freshServices() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `reference-db-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

const DANH = SEED_USER_IDS.danh;

describe("the booking code", () => {
  it("is seven characters, so it fits the column and can be read out", () => {
    for (let i = 0; i < 50; i++) {
      const code = bookingReference(crypto.randomUUID());
      expect(code).toMatch(/^TA-[0-9A-F]{4}$/);
      expect(code.length).toBe(ITEM_REFERENCE_MAX);
    }
  });

  it("is stored upper case, trimmed and never longer than the column allows", () => {
    expect(normaliseItemReference("  ta-4f2k  ")).toBe("TA-4F2K");
    expect(normaliseItemReference("abcdefghij")).toBe("ABCDEFG");
    expect(normaliseItemReference("")).toBeNull();
    expect(normaliseItemReference(null)).toBeNull();
  });
});

describe("booking a task", () => {
  it("gives the task and every asset line a code of its own", async () => {
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
        answers: {},
        extra: {},
        teamId: null,
        itemId: null,
      },
      null,
    );

    const item = (await services.repos.items.getById(receipt.itemId))!;
    expect(item.reference).toBe(receipt.reference);
    expect(item.reference).toMatch(/^TA-[0-9A-F]{4}$/);

    // The asset lines are deliverables on the item, not items of their own, so
    // the booking leaves one code behind rather than three.
    expect((await services.repos.items.listByBoard(item.boardId)).filter((i) => i.parentItemId === item.id)).toHaveLength(0);
    const lines = await services.repos.itemAssets.listByItem(item.id);
    expect(lines.map((l) => l.name)).toEqual(["Banner A", "Banner B"]);
  });
});

describe("linking two tasks", () => {
  async function twoItems() {
    const { services } = freshServices();
    const a = await services.items.createItem({ boardId: SEED_BOARD_IDS.rmitinerary, groupId: (await services.repos.boards.listGroups(SEED_BOARD_IDS.rmitinerary))[0]!.id, name: "Poster set" }, DANH);
    const b = await services.items.createItem({ boardId: SEED_BOARD_IDS.dooh, groupId: (await services.repos.boards.listGroups(SEED_BOARD_IDS.dooh))[0]!.id, name: "Poster set" }, DANH);
    return { services, a, b };
  }

  it("carries the code to a task that has none", async () => {
    const { services, a, b } = await twoItems();
    await services.repos.items.update(a.id, { reference: "TA-AAAA" });

    await services.links.link(a.id, b.id, DANH, { seedFrom: "item" });

    expect((await services.repos.items.getById(b.id))!.reference).toBe("TA-AAAA");
  });

  it("fills in the empty side from the other, whichever way round it is", async () => {
    const { services, a, b } = await twoItems();
    await services.repos.items.update(b.id, { reference: "TA-BBBB" });

    await services.links.link(a.id, b.id, DANH, { seedFrom: "item" });

    expect((await services.repos.items.getById(a.id))!.reference).toBe("TA-BBBB");
  });

  it("leaves both codes alone when the link is told not to carry them", async () => {
    const { services, a, b } = await twoItems();
    await services.repos.items.update(a.id, { reference: "TA-AAAA" });
    await services.repos.items.update(b.id, { reference: "TA-BBBB" });

    await services.links.link(a.id, b.id, DANH, { seedFrom: "item", excluded: [LINK_FIELD_REFERENCE] });

    expect((await services.repos.items.getById(a.id))!.reference).toBe("TA-AAAA");
    expect((await services.repos.items.getById(b.id))!.reference).toBe("TA-BBBB");
  });

  it("replaces the other code when it is asked to, which is what the dialog warns about", async () => {
    const { services, a, b } = await twoItems();
    await services.repos.items.update(a.id, { reference: "TA-AAAA" });
    await services.repos.items.update(b.id, { reference: "TA-BBBB" });

    await services.links.link(a.id, b.id, DANH, { seedFrom: "item" });

    expect((await services.repos.items.getById(b.id))!.reference).toBe("TA-AAAA");
  });
});
