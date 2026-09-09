import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BookingRequest, StakeholderDepartment } from "@/domain";
import { createServices, type Services } from "@/services";
import type { ResolvedPortal } from "@/services";

let counter = 0;
const WS = SEED_WORKSPACE_ID;

const request = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  requesterName: "Priya Nair",
  requesterEmail: "priya@rmit.edu.au",
  department: "School of Design",
  title: "Open Day wayfinding posters",
  brief: "Six A1 posters for the Brunswick campus, print ready by the due date.",
  assetTypes: ["Print"],
  assets: [{ name: "A1 poster", quantity: 6, spec: "594x841 mm, CMYK" }],
  teamId: null,
  dueDate: "2026-10-01",
  priority: "High",
  referenceUrl: null,
  extra: {},
  answers: {},
  ...overrides,
});

describe("booking through a portal", () => {
  let services: Services;
  let department: StakeholderDepartment;
  let other: StakeholderDepartment;
  let resolved: ResolvedPortal;

  beforeEach(async () => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `portal-booking-${Date.now()}-${counter}` }));
    const departments = await services.portals.ensureDepartments(WS);
    department = departments[0]!;
    other = departments[1]!;
    const portal = await services.portals.setEnabled(WS, department.id, true);
    resolved = await services.portals.resolve({ token: portal.token, password: null });
  });

  const book = (submissionKey: string, overrides: Partial<BookingRequest> = {}) =>
    services.portals.book(resolved, { submissionKey, request: request(overrides), booking: services.booking });

  it("creates the task, its provenance and a receipt the stakeholder can quote", async () => {
    const receipt = await book("key-000000001");
    expect(receipt.reference).toMatch(/^TA-/);
    expect(receipt.assetCount).toBe(1);

    // Visible in this portal straight away, which is what "submitted" has to mean.
    const page = await services.portals.tasks(resolved);
    expect(page.tasks.map((t) => t.id)).toEqual([receipt.itemId]);
    expect(page.tasks[0]!.reference).toBe(receipt.reference);
  });

  it("takes the department from the link and ignores what the body claims", async () => {
    const receipt = await book("key-000000002", { department: other.name });
    const provenance = await services.repos.stakeholderPortals.getRequestByItem(WS, receipt.itemId);
    expect(provenance?.departmentId).toBe(department.id);

    // And it is not visible to the department the body named.
    const otherPortal = await services.portals.setEnabled(WS, other.id, true);
    const otherResolved = await services.portals.resolve({ token: otherPortal.token, password: null });
    expect((await services.portals.tasks(otherResolved)).tasks).toHaveLength(0);
  });

  it("cannot be pointed at another department through a stakeholder extra", async () => {
    // A STAKEHOLDER column exists on some boards; a booking must not be able to
    // set one, and the mapping's field types are what stop it.
    const boards = await services.repos.boards.listByWorkspace(WS);
    let stakeholderColumn: string | null = null;
    for (const board of boards) {
      const found = (await services.repos.boards.listColumns(board.id)).find((c) => c.type === "STAKEHOLDER");
      if (found) {
        stakeholderColumn = found.id;
        break;
      }
    }
    const receipt = await book("key-000000003", {
      extra: stakeholderColumn ? { [stakeholderColumn]: { type: "STAKEHOLDER", group: other.name } } : {},
    });
    const provenance = await services.repos.stakeholderPortals.getRequestByItem(WS, receipt.itemId);
    expect(provenance?.departmentId).toBe(department.id);
  });

  it("publishes the brief the requester typed, and keeps their contact details internal", async () => {
    const receipt = await book("key-000000004");
    const item = (await services.repos.items.getById(receipt.itemId))!;

    // The address is stored — in a column where the board has one, in the
    // description where it does not — so the payload has something to leak.
    const values = await services.repos.items.listValuesByBoard(item.boardId);
    const stored = JSON.stringify([item.description, values.filter((v) => v.itemId === item.id)]);
    expect(stored).toContain("priya@rmit.edu.au");

    const detail = await services.portals.task(resolved, receipt.itemId, null);
    expect(detail.brief).toBe("Six A1 posters for the Brunswick campus, print ready by the due date.");
    expect(JSON.stringify(detail)).not.toContain("priya@rmit.edu.au");
    expect(JSON.stringify(detail)).not.toContain("Priya Nair");
  });

  it("keeps a description built by the booking writer out of the payload", async () => {
    const receipt = await book("key-000000005");
    // Force the shape the writer produces when a board has no column for a
    // contact: brief, then a "Request details" block carrying the address.
    await services.repos.items.update(receipt.itemId, {
      description: ["The brief.", "", "Request details", "Requested by: Priya Nair", "Email: priya@rmit.edu.au"].join("\n"),
    });
    const detail = await services.portals.task(resolved, receipt.itemId, null);
    const serialised = JSON.stringify(detail);
    expect(serialised).not.toContain("Request details");
    expect(serialised).not.toContain("priya@rmit.edu.au");
  });

  // ---- idempotency -----------------------------------------------------------

  it("replays the first receipt when the same key arrives again", async () => {
    const first = await book("key-retry-0001");
    const second = await book("key-retry-0001");
    expect(second).toEqual(first);
    // One task, not two.
    expect((await services.portals.tasks(resolved)).tasks).toHaveLength(1);
  });

  it("refuses a key that comes back carrying a different booking", async () => {
    await book("key-reuse-0001");
    await expect(book("key-reuse-0001", { title: "Something else entirely" })).rejects.toThrow(/already been used/i);
    expect((await services.portals.tasks(resolved)).tasks).toHaveLength(1);
  });

  it("survives two taps at once with one task and one receipt", async () => {
    const [a, b] = await Promise.allSettled([book("key-double-001"), book("key-double-001")]);
    const receipts = [a, b].filter((r) => r.status === "fulfilled");
    // One certainly succeeds. The other either replays the same receipt or is
    // told the booking is still being recorded — never a second task.
    expect(receipts.length).toBeGreaterThanOrEqual(1);
    if (receipts.length === 2) {
      expect((receipts[0] as PromiseFulfilledResult<unknown>).value).toEqual((receipts[1] as PromiseFulfilledResult<unknown>).value);
    }
    expect((await services.portals.tasks(resolved)).tasks).toHaveLength(1);
  });

  it("gives the key back when the booking fails, so a retry can use it", async () => {
    const exploding = {
      book: async () => {
        throw new Error("the board went away");
      },
    };
    await expect(services.portals.book(resolved, { submissionKey: "key-failed-001", request: request(), booking: exploding })).rejects.toThrow(/went away/);
    // Nothing was published, and the key is free again.
    expect((await services.portals.tasks(resolved)).tasks).toHaveLength(0);
    expect(await services.repos.stakeholderPortals.getSubmission(resolved.portal.id, "key-failed-001")).toBeNull();

    const receipt = await book("key-failed-001");
    expect(receipt.itemId).toBeTruthy();
  });

  it("insists on a submission key long enough to be unguessable", async () => {
    await expect(services.portals.book(resolved, { submissionKey: "short", request: request(), booking: services.booking })).rejects.toThrow(/submission key/i);
  });

  it("scopes keys to their portal, so two departments cannot collide", async () => {
    const otherPortal = await services.portals.setEnabled(WS, other.id, true);
    const otherResolved = await services.portals.resolve({ token: otherPortal.token, password: null });
    const mine = await book("key-shared-0001");
    const theirs = await services.portals.book(otherResolved, { submissionKey: "key-shared-0001", request: request({ title: "Theirs" }), booking: services.booking });
    expect(theirs.itemId).not.toBe(mine.itemId);
    expect((await services.portals.tasks(resolved)).tasks).toHaveLength(1);
    expect((await services.portals.tasks(otherResolved)).tasks).toHaveLength(1);
  });

  it("will not book through a portal that has been switched off", async () => {
    await services.portals.setEnabled(WS, department.id, false);
    await expect(services.portals.resolve({ token: resolved.portal.token, password: null })).rejects.toMatchObject({ reason: "off" });
  });
});
