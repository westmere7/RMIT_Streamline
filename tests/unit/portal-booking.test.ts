import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { EVERY_PORTAL_RANGE } from "@/domain";
import { SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BookingRequest, StakeholderDepartment } from "@/domain";
import { createServices, PortalSubmissionError, type Services } from "@/services";
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
  serviceTypeId: "svc-design",
  subServices: ["Print"],
  answers: {
    "design-what": { kind: "text", text: "Six A1 posters for the Brunswick campus, print ready." },
    "design-specs": { kind: "text", text: "A1 portrait, CMYK." },
    "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
  },
  teamId: null,
  dueDate: "2026-10-01",
  priority: "High",
  referenceUrl: null,
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
    const portal = await services.portals.setEnabled(WS, true);
    resolved = await services.portals.resolve({ token: portal.token, password: null });
  });

  const book = (submissionKey: string, overrides: Partial<BookingRequest> = {}, departmentId: string = department.id) =>
    services.portals.book(resolved, { submissionKey, departmentId, request: request(overrides), booking: services.booking });

  it("creates the task, its provenance and a receipt the stakeholder can quote", async () => {
    const receipt = await book("key-000000001");
    expect(receipt.reference).toMatch(/^TA-/);
    expect(receipt.assetCount).toBe(1);

    // Visible in this portal straight away, which is what "submitted" has to mean.
    const page = await services.portals.tasks(resolved);
    expect(page.tasks.map((t) => t.id)).toEqual([receipt.itemId]);
    expect(page.tasks[0]!.reference).toBe(receipt.reference);
  });

  it("takes the stakeholder from the id it was given and ignores the word in the body", async () => {
    // The body names one stakeholder and the id names another. The id wins: it
    // is checked against the workspace, and the name written on the request is
    // the one belonging to it.
    const receipt = await book("key-000000002", { department: other.name });
    const provenance = await services.repos.stakeholderPortals.getRequestByItem(WS, receipt.itemId);
    expect(provenance?.departmentId).toBe(department.id);

    // And filtering to the stakeholder the body named does not find it.
    const page = await services.portals.tasks(resolved, { scope: { stakeholderId: other.id, range: EVERY_PORTAL_RANGE } });
    expect(page.tasks).toHaveLength(0);
  });

  /** The stakeholder group stored on an item, or null when nothing was written. */
  const groupOn = async (itemId: string, boardId: string): Promise<string | null> => {
    const stakeholder = (await services.repos.boards.listColumns(boardId)).find((c) => c.type === "STAKEHOLDER");
    expect(stakeholder, "Task Allocation should carry a stakeholder column").toBeDefined();
    const values = await services.repos.items.listValuesByBoard(boardId);
    const value = values.find((v) => v.itemId === itemId && v.columnId === stakeholder!.id)?.value;
    return value && value.type === "STAKEHOLDER" ? value.group : null;
  };

  it("cannot be pointed at another department by anything in the body", async () => {
    // Task Allocation carries a STAKEHOLDER column, and a booking must not be
    // able to set it. Nothing a caller sends reaches that column: it is written
    // only from the department the token was checked against, and the free-text
    // "department" answer is overwritten with that department's own name.
    const receipt = await book("key-000000003", { department: other.name });
    const item = (await services.repos.items.getById(receipt.itemId))!;
    expect(await groupOn(item.id, item.boardId)).toBe(department.name);
    expect((await services.portals.tasks(resolved)).tasks).toHaveLength(1);
  });

  it("writes its own department to the board, so Task Allocation shows who booked it", async () => {
    const receipt = await book("key-000000006");
    const item = (await services.repos.items.getById(receipt.itemId))!;
    expect(await groupOn(item.id, item.boardId)).toBe(department.name);
  });

  it("leaves the stakeholder column empty for a public booking that names a department", async () => {
    // The public form's "department" is free text a requester types about
    // themselves. Writing it to the STAKEHOLDER column would let anyone file
    // into another department's portal by typing its name, so only the token
    // sets it — the whole point of keeping the two fields apart.
    const receipt = await services.booking.book(WS, request({ department: other.name }));
    const item = (await services.repos.items.getById(receipt.itemId))!;
    expect(await groupOn(item.id, item.boardId)).toBeNull();

    const otherPortal = await services.portals.setEnabled(WS, true);
    const otherResolved = await services.portals.resolve({ token: otherPortal.token, password: null });
    expect((await services.portals.tasks(otherResolved)).tasks).toHaveLength(0);
  });

  it("publishes the brief the form composed, and keeps their contact details internal", async () => {
    const receipt = await book("key-000000004");
    const item = (await services.repos.items.getById(receipt.itemId))!;

    // The address is stored — in a column where the board has one, in the
    // description where it does not — so the payload has something to leak.
    const values = await services.repos.items.listValuesByBoard(item.boardId);
    const stored = JSON.stringify([item.description, values.filter((v) => v.itemId === item.id)]);
    expect(stored).toContain("priya@rmit.edu.au");

    const detail = await services.portals.task(resolved, receipt.itemId, null);
    // The requester's own answers, in the words the board carries them in.
    // The public copy is the same document flattened: the portal shows words,
    // the board's Brief column shows the formatting.
    expect(detail.brief).toContain("Service: Design");
    expect(detail.brief).not.toContain("**");
    expect(detail.brief).toContain("Six A1 posters for the Brunswick campus, print ready.");
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

  it("refuses a reused key as a conflict, not as a fault in the server", async () => {
    await book("key-reuse-0002");
    // The refusal is deliberate, so it has to be able to say so: thrown as a
    // plain Error it reached the caller as a 500 and "something went wrong on
    // the server", which told a stakeholder nothing they could act on.
    const refusal = await book("key-reuse-0002", { title: "A different request" }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(PortalSubmissionError);
    expect((refusal as PortalSubmissionError).reason).toBe("reused");
    expect((refusal as Error).message).toMatch(/reload the form/i);
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
    await expect(services.portals.book(resolved, { departmentId: department.id, submissionKey: "key-failed-001", request: request(), booking: exploding })).rejects.toThrow(/went away/);
    // Nothing was published, and the key is free again.
    expect((await services.portals.tasks(resolved)).tasks).toHaveLength(0);
    expect(await services.repos.stakeholderPortals.getSubmission(resolved.portal.id, "key-failed-001")).toBeNull();

    const receipt = await book("key-failed-001");
    expect(receipt.itemId).toBeTruthy();
  });

  it("insists on a submission key long enough to be unguessable", async () => {
    await expect(services.portals.book(resolved, { departmentId: department.id, submissionKey: "short", request: request(), booking: services.booking })).rejects.toThrow(/submission key/i);
  });

  it("keeps one key space for the whole portal, so a reused key cannot book twice", async () => {
    // Keys used to be scoped per department, because each had a portal of its
    // own. One portal means one key space: the same key with different content
    // is a different booking wearing an old key, and is refused rather than
    // quietly making a second task.
    await book("key-shared-0001");
    await expect(book("key-shared-0001", { title: "Theirs" })).rejects.toBeInstanceOf(PortalSubmissionError);
    // And it is refused for another stakeholder too: the key belongs to the
    // link, not to whoever the request is for.
    await expect(book("key-shared-0001", { title: "Theirs" }, other.id)).rejects.toBeInstanceOf(PortalSubmissionError);
    expect((await services.portals.tasks(resolved)).tasks).toHaveLength(1);
  });

  it("will not book through a portal that has been switched off", async () => {
    await services.portals.setEnabled(WS, false);
    await expect(services.portals.resolve({ token: resolved.portal.token, password: null })).rejects.toMatchObject({ reason: "off" });
  });
});
