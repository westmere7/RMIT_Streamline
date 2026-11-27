import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BookingRequest, ColumnValue } from "@/domain";
import { changedParts, isSendBackToken, newSendBackToken, sameJson, sendBackRefusal } from "@/domain";
import { createServices, SendBackLinkError } from "@/services";

/**
 * Sending a booked task back to its requester (v0.168.0): the team asks for
 * what is missing, the requester's link opens the form filled in, and their
 * answer lands on the same task, changing only what they changed.
 */

const owner = SEED_USER_IDS.danh;

const request = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  requesterName: "Priya Nair",
  requesterEmail: "priya.sendback@rmit.edu.au",
  department: "Comm.",
  title: "Open Day posters",
  brief: "",
  assetTypes: [],
  assets: [{ name: "A1 poster", quantity: 6, spec: "Portrait", assetType: null }],
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

describe("sending a booking back", { timeout: 30_000 }, () => {
  let services: ReturnType<typeof createServices>;
  const key = async () => (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;
  const book = async (overrides: Partial<BookingRequest> = {}) => services.booking.submit({ workspaceSlug: "rmit", key: await key(), request: request(overrides) });

  /** The task's columns and values, by column name. */
  const cells = async (itemId: string) => {
    const item = (await services.repos.items.getById(itemId))!;
    const columns = await services.repos.boards.listColumns(item.boardId);
    const values = await services.repos.items.listValuesByItem(itemId);
    const byName = (name: string): ColumnValue | undefined => {
      const column = columns.find((c) => c.name === name);
      return column ? values.find((v) => v.columnId === column.id)?.value : undefined;
    };
    const status = columns.find((c) => c.type === "STATUS")!;
    const statusId = (values.find((v) => v.columnId === status.id)?.value as { labelId?: string } | undefined)?.labelId ?? null;
    return { item, columns, byName, statusId, status };
  };
  const updates = async (itemId: string) => (await services.repos.comments.listByItem(itemId)).map((c) => c.body);

  beforeEach(async () => {
    services = createServices(createLocalRepositories({ databaseName: `sendback-${Date.now()}-${Math.random()}` }));
    await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    await services.booking.publishForm(SEED_WORKSPACE_ID, fixtureBookingFormTemplate(), "Send-back test", { publishedBy: owner });
  });

  it("keeps every new booking's answers", async () => {
    const receipt = await book();
    const stored = await services.repos.bookingRequests.get(receipt.itemId);
    expect(stored?.request.title).toBe("Open Day posters");
    expect(stored?.request.answers["design-what"]).toEqual({ kind: "text", text: "Six A1 posters for the campus." });
    expect(stored?.request.itemId).toBe(receipt.itemId);
  });

  it("sends back: a link, the task marked Waiting, and the note on its activity (no update)", async () => {
    const receipt = await book();
    const sent = await services.bookingSendBacks.send(receipt.itemId, "  Which campus are these for?  ", owner);
    expect(isSendBackToken(sent.token)).toBe(true);
    expect(sent.note).toBe("Which campus are these for?");
    expect(Date.parse(sent.expiresAt) - Date.parse(sent.sentAt)).toBeGreaterThan(13 * 24 * 3600 * 1000);
    const { statusId } = await cells(receipt.itemId);
    expect(statusId).toBe("waiting");
    expect(await updates(receipt.itemId)).toEqual([]);
    const logged = (await services.repos.activities.listByItem(receipt.itemId)).find((a) => a.eventType === "BOOKING_SENT_BACK");
    expect(logged?.metadata.summary).toBe("Which campus are these for?");
    expect(logged?.metadata.requesterName).toBe("Priya Nair");
    expect((await services.bookingSendBacks.openAmong([receipt.itemId, "other"])).has(receipt.itemId)).toBe(true);
  });

  it("refuses a second send-back while one waits, an empty note, and a task nobody booked", async () => {
    const receipt = await book();
    await expect(services.bookingSendBacks.send(receipt.itemId, "   ", owner)).rejects.toThrow(/Say what/);
    await services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner);
    await expect(services.bookingSendBacks.send(receipt.itemId, "Again", owner)).rejects.toThrow(/already waiting/);
    const { item } = await cells(receipt.itemId);
    const other = (await services.repos.boards.listGroups(item.boardId)).find((g) => g.id !== item.groupId)!;
    const made = await services.items.createItem({ boardId: item.boardId, groupId: other.id, name: "Made by hand" }, owner);
    await expect(services.bookingSendBacks.send(made.id, "Hm", owner)).rejects.toThrow(/booked through the form/);
  });

  it("refuses once the work has started, or is done", async () => {
    const receipt = await book();
    const { item, status, columns } = await cells(receipt.itemId);
    const board = (await services.repos.boards.getById(item.boardId))!;
    const users = await services.repos.users.list();
    await services.items.setValue(item.id, status.id, { type: "STATUS", labelId: "working" }, { column: status, item, board, users }, owner);
    await expect(services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner)).rejects.toThrow(/started/);
    await services.items.setValue(item.id, status.id, { type: "STATUS", labelId: "done" }, { column: status, item, board, users }, owner);
    await expect(services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner)).rejects.toThrow(/done/);
    expect(columns.length).toBeGreaterThan(0);
  });

  it("the link opens the form filled in, with the note, the ticket and the task's name", async () => {
    const receipt = await book();
    const sent = await services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner);
    const opened = await services.bookingSendBacks.open(sent.token);
    expect(opened.note).toBe("Which campus?");
    expect(opened.ticket).toBe(receipt.ticket);
    expect(opened.title).toBe("Open Day posters");
    expect(opened.prefill?.answers["design-what"]).toEqual({ kind: "text", text: "Six A1 posters for the campus." });
    expect(opened.prefill?.assets.map((a) => a.name)).toEqual(["A1 poster"]);
    expect(opened.form.template.services.length).toBeGreaterThan(0);
  });

  it("refuses a link that is malformed, unknown, expired, taken back or already answered", async () => {
    await expect(services.bookingSendBacks.open("nope")).rejects.toBeInstanceOf(SendBackLinkError);
    await expect(services.bookingSendBacks.open(newSendBackToken())).rejects.toThrow(/isn't valid/);

    const a = await book({ title: "Expired one" });
    const sentA = await services.bookingSendBacks.send(a.itemId, "Which campus?", owner);
    const db = await (services.repos as unknown as { connection: { getDb: () => Promise<{ put: (s: string, v: unknown) => Promise<unknown> }> } }).connection.getDb();
    await db.put("bookingSendBacks", { ...sentA, expiresAt: new Date(Date.now() - 1000).toISOString() });
    await expect(services.bookingSendBacks.open(sentA.token)).rejects.toThrow(/expired/);

    const b = await book({ title: "Cancelled one" });
    const sentB = await services.bookingSendBacks.send(b.itemId, "Which campus?", owner);
    await services.bookingSendBacks.cancel(b.itemId, owner);
    await expect(services.bookingSendBacks.open(sentB.token)).rejects.toThrow(/no longer needs/);

    const c = await book({ title: "Answered one" });
    const sentC = await services.bookingSendBacks.send(c.itemId, "Which campus?", owner);
    await services.bookingSendBacks.resubmit(sentC.token, request({ title: "Answered one", dueDate: "2026-12-10" }), "");
    await expect(services.bookingSendBacks.open(sentC.token)).rejects.toThrow(/already sent/);
    await expect(services.bookingSendBacks.resubmit(sentC.token, request({ title: "Answered one" }), "")).rejects.toThrow(/already sent/);
  });

  it("answering changes what the requester changed, keeps what the team changed, and says so", async () => {
    const receipt = await book();
    const { item, columns } = await cells(receipt.itemId);
    const board = (await services.repos.boards.getById(item.boardId))!;
    const users = await services.repos.users.list();
    // The team moves the priority while it waits; the requester does not touch it.
    const priority = columns.find((c) => c.name === "Priority")!;
    const before = (await cells(receipt.itemId)).byName("Priority");
    const lowId = "labels" in priority.settings ? priority.settings.labels.find((l) => l.name === "Low")?.id : undefined;
    expect(lowId).toBeTruthy();
    await services.items.setValue(item.id, priority.id, { ...(before as object), labelId: lowId } as ColumnValue, { column: priority, item, board, users }, owner);
    const teamPriority = (await cells(receipt.itemId)).byName("Priority");
    expect(teamPriority).not.toEqual(before);

    const sent = await services.bookingSendBacks.send(receipt.itemId, "Which campus, and when?", owner);
    const answered = request({
      dueDate: "2026-12-15",
      answers: { ...request().answers, "design-what": { kind: "text", text: "Six A1 posters for the Saigon South campus." } },
      assets: [{ name: "A1 poster", quantity: 6, spec: "Portrait", assetType: null }, { name: "Instagram square", quantity: 1, spec: null, assetType: null }],
      // Trying to change who asked has no effect.
      requesterEmail: "someone.else@rmit.edu.au",
      requesterName: "Someone Else",
    });
    const result = await services.bookingSendBacks.resubmit(sent.token, answered, "It's for Saigon South.");
    expect(result.ticket).toBe(receipt.ticket);
    expect(result.itemId).toBe(receipt.itemId);

    const after = await cells(receipt.itemId);
    expect(JSON.stringify(after.byName("Due Date"))).toContain("2026-12-15");
    expect(after.byName("Priority")).toEqual(teamPriority);
    expect(after.statusId).not.toBe("waiting");
    const brief = (await services.repos.items.getById(receipt.itemId)) as unknown as { bookingBrief?: string };
    expect(brief.bookingBrief ?? "").toContain("Saigon South");
    const assets = await services.repos.itemAssets.listByItem(receipt.itemId);
    expect(assets.map((a) => a.name).sort()).toEqual(["A1 poster", "Instagram square"]);
    const stored = await services.repos.bookingRequests.get(receipt.itemId);
    expect(stored?.request.requesterEmail).toBe("priya.sendback@rmit.edu.au");
    expect(stored?.request.dueDate).toBe("2026-12-15");

    const said = (await updates(receipt.itemId)).find((b) => b.includes("again with more information"))!;
    expect(said).toContain("Changed: Brief, Due date, Assets.");
    expect(said).toContain("It's for Saigon South.");
    expect(said).toContain("@Danh");
    expect((await services.bookingSendBacks.openAmong([receipt.itemId])).size).toBe(0);
  });

  it("the brief sent again still says when it was booked, as the Booking time column does", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-27T12:03:00Z"));
      const receipt = await book();
      const sent = await services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner);
      vi.setSystemTime(new Date("2026-11-27T12:07:00Z"));
      await services.bookingSendBacks.resubmit(sent.token, request({ answers: { ...request().answers, "design-what": { kind: "text", text: "For Hanoi." } } }), "");
      const item = (await services.repos.items.getById(receipt.itemId)) as unknown as { bookingBrief?: string };
      expect(item.bookingBrief ?? "").toContain("**Booked:** Nov 27, 2026, 7:03 PM");
      expect(item.bookingBrief ?? "").not.toContain("7:07 PM");
    } finally {
      vi.useRealTimers();
    }
  });

  it("an asset line they drop stays on the task and is named in the update", async () => {
    const receipt = await book({ assets: [{ name: "A1 poster", quantity: 6, spec: null, assetType: null }, { name: "Flyer", quantity: 1, spec: null, assetType: null }] });
    const sent = await services.bookingSendBacks.send(receipt.itemId, "Do you still need the flyer?", owner);
    await services.bookingSendBacks.resubmit(sent.token, request({ assets: [{ name: "A1 poster", quantity: 6, spec: null, assetType: null }] }), "");
    expect((await services.repos.itemAssets.listByItem(receipt.itemId)).map((a) => a.name).sort()).toEqual(["A1 poster", "Flyer"]);
    expect((await updates(receipt.itemId)).some((b) => b.includes("No longer asked for (still on Assets): Flyer."))).toBe(true);
  });

  it("the form sent straight back, a reply alone included, is refused and the link still works", async () => {
    const receipt = await book();
    const sent = await services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner);
    const opened = await services.bookingSendBacks.open(sent.token);
    await expect(services.bookingSendBacks.resubmit(sent.token, opened.prefill!, "")).rejects.toThrow(/Change something/);
    await expect(services.bookingSendBacks.resubmit(sent.token, opened.prefill!, "It's for City campus.")).rejects.toThrow(/Change something/);
    expect((await services.bookingSendBacks.open(sent.token)).note).toBe("Which campus?");
    // One answer different is enough.
    const changed = { ...opened.prefill!, answers: { ...opened.prefill!.answers, "design-what": { kind: "text" as const, text: "Six A1 posters for City campus." } } };
    await services.bookingSendBacks.resubmit(sent.token, changed, "");
  });

  it("a form that fails its own rules is refused and the link still works", async () => {
    const receipt = await book();
    const sent = await services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner);
    await expect(services.bookingSendBacks.resubmit(sent.token, request({ title: "" }), "")).rejects.toThrow();
    const opened = await services.bookingSendBacks.open(sent.token);
    expect(opened.note).toBe("Which campus?");
  });

  it("a booking made before answers were kept: the form opens empty and only the brief is rewritten", async () => {
    const receipt = await book();
    const db = await (services.repos as unknown as { connection: { getDb: () => Promise<{ delete: (s: string, k: string) => Promise<unknown> }> } }).connection.getDb();
    await db.delete("bookingRequests", receipt.itemId);
    const sent = await services.bookingSendBacks.send(receipt.itemId, "Please fill this in again with the campus.", owner);
    const opened = await services.bookingSendBacks.open(sent.token);
    expect(opened.prefill).toBeNull();
    await services.bookingSendBacks.resubmit(sent.token, request({ dueDate: "2027-01-20", answers: { ...request().answers, "design-what": { kind: "text", text: "For Hanoi." } } }), "");
    const after = await cells(receipt.itemId);
    expect(JSON.stringify(after.byName("Due Date"))).not.toContain("2027-01-20");
    expect(((await services.repos.items.getById(receipt.itemId)) as unknown as { bookingBrief?: string }).bookingBrief ?? "").toContain("For Hanoi.");
  });

  it("cancelling: the link stops, the task leaves Waiting, and its activity says so (no update)", async () => {
    const receipt = await book();
    const sent = await services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner);
    await services.bookingSendBacks.cancel(receipt.itemId, owner);
    expect((await cells(receipt.itemId)).statusId).not.toBe("waiting");
    expect(await updates(receipt.itemId)).toEqual([]);
    expect((await services.repos.activities.listByItem(receipt.itemId)).some((a) => a.eventType === "BOOKING_SEND_BACK_CANCELLED")).toBe(true);
    await expect(services.bookingSendBacks.resubmit(sent.token, request(), "")).rejects.toThrow(/no longer needs/);
    // And it can be sent back again.
    const again = await services.bookingSendBacks.send(receipt.itemId, "Actually, which campus?", owner);
    expect(again.token).not.toBe(sent.token);
  });

  describe("Reset booking", () => {
    it("puts a booked task back the way its booking made it", async () => {
      const receipt = await book();
      const before = await cells(receipt.itemId);
      const priority = before.columns.find((c) => c.name === "Priority")!;
      const board = (await services.repos.boards.getById(before.item.boardId))!;
      const users = await services.repos.users.list();
      const bookedPriority = before.byName("Priority");
      const bookedAssets = (await services.repos.itemAssets.listByItem(receipt.itemId)).map((a) => a.name);
      // The team changes it about.
      await services.items.renameItem(receipt.itemId, "Renamed by the team", owner);
      await services.items.updateDescription(receipt.itemId, "Our own notes", owner);
      const otherLabel = (priority.settings as { labels: Array<{ id: string }> }).labels.find((l) => (bookedPriority as { labelId?: string } | undefined)?.labelId !== l.id)!.id;
      await services.items.setValue(receipt.itemId, priority.id, { type: "PRIORITY", labelId: otherLabel }, { column: priority, item: before.item, board, users }, owner);
      await services.assets.add({ itemId: receipt.itemId, boardId: board.id, name: "Extra flyer", assetType: null, quantity: 1, dueDate: null, notes: null }, owner);
      await services.items.createItem({ boardId: board.id, groupId: before.item.groupId, parentItemId: receipt.itemId, name: "A subitem" }, owner);

      await services.bookingSendBacks.reset(receipt.itemId, owner);

      const after = await cells(receipt.itemId);
      expect(after.item.name).toBe("Open Day posters");
      expect(after.item.description).toBe(before.item.description);
      expect(after.byName("Priority")).toEqual(bookedPriority);
      // The status the booking started on: the board's default label, written as a new task's is.
      expect(after.statusId).toBe(before.statusId);
      expect((await services.repos.itemAssets.listByItem(receipt.itemId)).map((a) => a.name)).toEqual(bookedAssets);
      expect((await services.repos.items.listByBoard(board.id)).filter((i) => i.parentItemId === receipt.itemId)).toEqual([]);
    });

    it("is refused while it waits on its requester, and once it has left Task Allocation", async () => {
      const receipt = await book();
      await services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner);
      await expect(services.bookingSendBacks.reset(receipt.itemId, owner)).rejects.toThrow(/Recall the send back first/);
      await services.bookingSendBacks.cancel(receipt.itemId, owner);
      const target = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => !b.system && !b.archivedAt)!;
      await services.booking.allocate(receipt.itemId, target.id, owner);
      await expect(services.bookingSendBacks.reset(receipt.itemId, owner)).rejects.toThrow(/still on Task Allocation/);
    });
  });
});

describe("send-back helpers", () => {
  it("tokens are 32 lowercase letters and digits, and differ", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newSendBackToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(isSendBackToken(t)).toBe(true);
    expect(isSendBackToken("ABC")).toBe(false);
  });

  it("a booking read back from the database, keys in another order, has not changed", () => {
    const base = request({ assets: [{ name: "Pull-up banner", quantity: 2, spec: null, assetType: null }] });
    // As Postgres hands jsonb back: the same values, the keys reordered.
    const reread = JSON.parse(JSON.stringify({ ...base, assets: [{ name: "Pull-up banner", spec: null, quantity: 2, assetType: null }], answers: { "design-copy": base.answers["design-copy"], "design-what": base.answers["design-what"], "design-specs": base.answers["design-specs"] } }));
    expect(changedParts(reread, base)).toEqual([]);
    expect(sameJson({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
  });

  it("names the parts of the form that changed", () => {
    const base = request();
    expect(changedParts(base, base)).toEqual([]);
    expect(changedParts(base, { ...base, title: "New", priority: "Low", answers: { ...base.answers, "design-specs": { kind: "text", text: "A2" } } })).toEqual(["Title", "Brief", "Priority"]);
  });

  it("only a live booked task, not under way or done, can be sent back", () => {
    const booked = { bookedVia: "booking" as const, archivedAt: null, parentItemId: null };
    expect(sendBackRefusal(booked, null, null)).toBeNull();
    expect(sendBackRefusal({ ...booked, bookedVia: null }, null, null)).toMatch(/booked/);
    expect(sendBackRefusal({ ...booked, archivedAt: "2026-01-01" }, null, null)).toMatch(/Restore/);
    expect(sendBackRefusal({ ...booked, parentItemId: "x" }, null, null)).toMatch(/subitem/);
  });
});

describe("the send-back's journey", { timeout: 30_000 }, () => {
  it("every round is on the task's history with its own time, however many there are", async () => {
    const services = createServices(createLocalRepositories({ databaseName: `sendback-journey-${Date.now()}-${Math.random()}` }));
    await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
    await services.booking.publishForm(SEED_WORKSPACE_ID, fixtureBookingFormTemplate(), "Journey test", { publishedBy: owner });
    const key = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key, request: request() });

    const first = await services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner);
    await services.bookingSendBacks.resubmit(first.token, request({ dueDate: "2026-12-10" }), "");
    await services.bookingSendBacks.send(receipt.itemId, "And the size?", owner);
    await services.bookingSendBacks.cancel(receipt.itemId, owner);
    const third = await services.bookingSendBacks.send(receipt.itemId, "Size, please.", owner);
    await services.bookingSendBacks.resubmit(third.token, request({ dueDate: "2026-12-10", assets: [{ name: "A1 poster", quantity: 6, spec: "A1", assetType: null }] }), "");

    const events = (await services.repos.activities.listByItem(receipt.itemId))
      .filter((a) => a.eventType.startsWith("BOOKING_"))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(events.map((e) => e.eventType)).toEqual(["BOOKING_SENT_BACK", "BOOKING_RESUBMITTED", "BOOKING_SENT_BACK", "BOOKING_SEND_BACK_CANCELLED", "BOOKING_SENT_BACK", "BOOKING_RESUBMITTED"]);
    for (const e of events) expect(Date.parse(e.createdAt)).not.toBeNaN();
    expect(events[0]!.metadata.summary).toBe("Which campus?");
    expect(events[0]!.metadata.requesterName).toBe("Priya Nair");
    expect(events[1]!.metadata.summary).toBe("Changed Due date");
    expect(events[5]!.metadata.summary).toBe("Changed Assets");

    const { buildJourney } = await import("@/features/journey/journey");
    const journey = buildJourney(await services.repos.activities.listByItem(receipt.itemId), { statuses: [] });
    const kinds = journey.milestones.map((m) => m.kind).filter((k) => k === "sent-back" || k === "resubmitted" || k === "send-back-cancelled");
    expect(kinds).toEqual(["sent-back", "resubmitted", "sent-back", "send-back-cancelled", "sent-back", "resubmitted"]);
    const titles = journey.milestones.filter((m) => m.kind === "sent-back").map((m) => m.title);
    expect(titles).toEqual(["Sent back to Priya Nair", "Sent back to Priya Nair (2nd time)", "Sent back to Priya Nair (3rd time)"]);
    // Each round is its own row in the send-back table too, with its own ends.
  });
});
