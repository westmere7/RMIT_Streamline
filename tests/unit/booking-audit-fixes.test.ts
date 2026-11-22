import { beforeEach, describe, expect, it } from "vitest";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { Board, BookingRequest } from "@/domain";
import { RefusedError, serviceById } from "@/domain";
import { createServices } from "@/services";
import { bookingRequestSchema } from "@/services/booking";

/**
 * From the full audit of 22 Nov 2026: a booking sent twice is booked once, and
 * allocating refuses what is not a live request.
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

describe("booking and allocating, audit fixes", { timeout: 20_000 }, () => {
  let services: ReturnType<typeof createServices>;
  let allocation: Board;
  let target: Board;
  const key = async () => (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;

  beforeEach(async () => {
    services = createServices(createLocalRepositories({ databaseName: `booking-audit-${Date.now()}-${Math.random()}` }));
    allocation = (await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner)).board;
    target = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => !b.archivedAt && !b.system)!;
    // Every booking waits on Task Allocation.
    const template = fixtureBookingFormTemplate();
    serviceById(template, "svc-design")!.teamId = null;
    await services.booking.publishForm(SEED_WORKSPACE_ID, template, "Audit", { publishedBy: owner });
  });

  it("answers a retried submission with the first receipt and spends no second ticket", async () => {
    const itemId = crypto.randomUUID();
    const first = await services.booking.submit({ workspaceSlug: "rmit", key: await key(), request: request({ itemId }) });
    const again = await services.booking.submit({ workspaceSlug: "rmit", key: await key(), request: request({ itemId }) });
    expect(again.itemId).toBe(first.itemId);
    expect(again.ticket).toBe(first.ticket);
    const named = (await services.repos.items.listByBoard(allocation.id)).filter((i) => i.name === "Open Day posters");
    expect(named).toHaveLength(1);
  });

  it("refuses to allocate a subitem or an archived request, with the reason", async () => {
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: await key(), request: request() });
    const item = (await services.repos.items.getById(receipt.itemId))!;
    const sub = await services.items.createItem({ boardId: allocation.id, groupId: item.groupId, parentItemId: item.id, name: "Part" }, owner);
    await expect(services.booking.allocate(sub.id, target.id, owner)).rejects.toBeInstanceOf(RefusedError);
    await services.repos.items.update(item.id, { archivedAt: new Date().toISOString() });
    await expect(services.booking.allocate(item.id, target.id, owner)).rejects.toThrow("Restore the request before allocating it.");
  });

  it("refuses a due date that is not a day on the calendar", () => {
    expect(bookingRequestSchema.safeParse(request({ dueDate: "2026-02-31" })).success).toBe(false);
    expect(bookingRequestSchema.safeParse(request({ dueDate: "2028-02-29" })).success).toBe(true);
  });
});
