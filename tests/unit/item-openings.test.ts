import { beforeEach, describe, expect, it } from "vitest";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BookingRequest } from "@/domain";
import { createServices } from "@/services";

/**
 * Where a task behind a shared link also opens (v0.170.0): its board for
 * somebody who can see it (the board's archive once archived), the portal
 * while it is open and shows the task. Both of a task's links give the same
 * answer.
 */

const owner = SEED_USER_IDS.danh;

const request = (): BookingRequest => ({
  requesterName: "Priya Nair",
  requesterEmail: "priya.openings@rmit.edu.au",
  department: "Comm.",
  title: "Open Day posters",
  brief: "",
  assetTypes: [],
  assets: [],
  serviceTypeId: "svc-design",
  subServices: ["Print"],
  teamId: null,
  dueDate: "2026-12-01",
  priority: "High",
  referenceUrl: null,
  answers: {
    "design-what": { kind: "text", text: "Six A1 posters." },
    "design-specs": { kind: "text", text: "A1 portrait." },
    "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
  },
});

describe("where a shared task also opens", { timeout: 30_000 }, () => {
  let services: ReturnType<typeof createServices>;

  const bookWithLink = async () => {
    const template = fixtureBookingFormTemplate();
    template.review.shareTaskLink = true;
    await services.booking.publishForm(SEED_WORKSPACE_ID, template, "Openings test", { publishedBy: owner });
    const key = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key, request: request() });
    return { itemId: receipt.itemId, token: receipt.taskLink!.split("/booking/t/")[1]! };
  };

  beforeEach(async () => {
    services = createServices(createLocalRepositories({ databaseName: `openings-${Date.now()}-${Math.random()}` }));
    await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
  });

  it("gives the task's board, and the portal only while it is open", async () => {
    const { itemId, token } = await bookWithLink();
    const board = (await services.repos.boards.getById((await services.repos.items.getById(itemId))!.boardId))!;
    await services.portals.ensurePortal(SEED_WORKSPACE_ID);
    await services.portals.setEnabled(SEED_WORKSPACE_ID, false);
    const closed = await services.taskLinks.openings(token);
    expect(closed.board).toBe(`/workspace/rmit/boards/${board.slug}?item=${itemId}`);
    expect(closed.portal).toBeNull();

    await services.portals.setEnabled(SEED_WORKSPACE_ID, true);
    expect((await services.taskLinks.openings(token)).portal).toBe(`/rmit/portal?task=${itemId}`);
  });

  it("an archived task opens in the board's archive, and not on the portal", async () => {
    const { itemId, token } = await bookWithLink();
    await services.portals.ensurePortal(SEED_WORKSPACE_ID);
    await services.portals.setEnabled(SEED_WORKSPACE_ID, true);
    await services.repos.items.update(itemId, { archivedAt: new Date().toISOString() });
    const archived = await services.taskLinks.openings(token);
    expect(archived.board).toMatch(new RegExp(`^/workspace/rmit/boards/[^/]+/archive\\?item=${itemId}$`));
    expect(archived.portal).toBeNull();
  });

  it("nobody signed in, or somebody who cannot see the board, gets no board", async () => {
    const { itemId } = await bookWithLink();
    const item = (await services.repos.items.getById(itemId))!;
    const board = (await services.repos.boards.getById(item.boardId))!;
    expect((await services.itemOpenings.for(item, board, null)).board).toBeNull();
    expect((await services.itemOpenings.for(item, board, async () => false)).board).toBeNull();
  });

  it("a task's Share by link gives the same answer as its task link", async () => {
    const { itemId, token } = await bookWithLink();
    const share = await services.itemShares.save(itemId, owner, { enabled: true, access: "PUBLIC" });
    expect(await services.itemShares.openings(share.token, null)).toEqual(await services.taskLinks.openings(token));
  });
});
