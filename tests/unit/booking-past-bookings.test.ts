import { beforeEach, describe, expect, it } from "vitest";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BookingFormTemplate, BookingRequest } from "@/domain";
import { bookingFormTemplateSchema } from "@/services/booking";
import { createServices } from "@/services";

/**
 * The receipt's list of other bookings made with the same email (v0.124.0):
 * off unless the published form switches it on, decided by the service rather
 * than the page, and only ever ticket, name, date and status.
 */

const owner = SEED_USER_IDS.danh;

const request = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  requesterName: "Priya Nair",
  requesterEmail: "priya.past@rmit.edu.au",
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
    "design-what": { kind: "text", text: "Six A1 posters for the campus." },
    "design-specs": { kind: "text", text: "A1 portrait." },
    "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
  },
  ...overrides,
});

describe("past bookings of the same email", { timeout: 20_000 }, () => {
  let services: ReturnType<typeof createServices>;
  const key = async () => (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;
  const publish = async (edit: (t: BookingFormTemplate) => void) => {
    const template = fixtureBookingFormTemplate();
    edit(template);
    await services.booking.publishForm(SEED_WORKSPACE_ID, template, "Past bookings test", { publishedBy: owner });
  };
  const book = async (overrides: Partial<BookingRequest> = {}) => services.booking.submit({ workspaceSlug: "rmit", key: await key(), request: request(overrides) });
  const past = async (email: string, k?: string | null) => services.booking.pastBookings({ workspaceSlug: "rmit", key: k === undefined ? await key() : k, email });

  beforeEach(async () => {
    services = createServices(createLocalRepositories({ databaseName: `past-${Date.now()}-${Math.random()}` }));
    await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
  });

  it("lists nothing while the form leaves it off (the default)", async () => {
    await publish(() => {});
    await book();
    expect(await past("priya.past@rmit.edu.au")).toEqual([]);
  });

  it("switched on: that email's bookings, newest first, with ticket, name, date and status only", async () => {
    await publish((t) => (t.review.showPastBookings = true));
    const first = await book({ title: "First" });
    const second = await book({ title: "Second" });
    await book({ title: "Someone else's", requesterEmail: "other.person@rmit.edu.au", requesterName: "Other Person" });
    const rows = await past("  Priya.Past@RMIT.edu.au ");
    expect(rows.map((r) => r.title).sort()).toEqual(["First", "Second"]);
    expect(rows.map((r) => r.itemId)).toEqual(expect.arrayContaining([first.itemId, second.itemId]));
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["bookedAt", "itemId", "portalPath", "status", "ticket", "title"]);
      expect(row.ticket).toMatch(/_\d+$/);
      expect(row.status?.name).toBeTruthy();
    }
    expect(rows[0]!.bookedAt >= rows[1]!.bookedAt).toBe(true);
  });

  it("an email the workspace does not know, or not an email, lists nothing", async () => {
    await publish((t) => (t.review.showPastBookings = true));
    await book();
    expect(await past("nobody.here@rmit.edu.au")).toEqual([]);
    expect(await past("not an email")).toEqual([]);
  });

  it("archived tasks are left out", async () => {
    await publish((t) => (t.review.showPastBookings = true));
    const kept = await book({ title: "Kept" });
    const gone = await book({ title: "Archived" });
    await services.repos.items.update(gone.itemId, { archivedAt: new Date().toISOString() });
    expect((await past("priya.past@rmit.edu.au")).map((r) => r.itemId)).toEqual([kept.itemId]);
  });

  it("each row opens the workspace's portal on that task, and only while the portal is on", async () => {
    await publish((t) => (t.review.showPastBookings = true));
    const booked = await book();
    const portal = await services.portals.ensurePortal(SEED_WORKSPACE_ID);
    await services.portals.setEnabled(SEED_WORKSPACE_ID, true);
    const [row] = await past("priya.past@rmit.edu.au");
    expect(row!.portalPath).toBe(`/portal/${encodeURIComponent(portal.token)}?task=${booked.itemId}`);
    await services.portals.setEnabled(SEED_WORKSPACE_ID, false);
    expect((await past("priya.past@rmit.edu.au"))[0]!.portalPath).toBeNull();
  });

  it("needs the link's key like booking does", async () => {
    await publish((t) => (t.review.showPastBookings = true));
    await book();
    await expect(past("priya.past@rmit.edu.au", "wrong-key")).rejects.toThrow(/no longer valid/);
  });

  it("the two switches survive the form's schema; absent reads as PDF on, past bookings off", () => {
    const template = fixtureBookingFormTemplate();
    expect(template.review.offerPdf).toBeUndefined();
    expect(template.review.showPastBookings).toBeUndefined();
    const parsed = bookingFormTemplateSchema.parse({ ...template, review: { ...template.review, offerPdf: false, showPastBookings: true } });
    expect(parsed.review.offerPdf).toBe(false);
    expect(parsed.review.showPastBookings).toBe(true);
  });
});
