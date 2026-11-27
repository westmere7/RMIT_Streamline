import { beforeEach, describe, expect, it } from "vitest";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BookingFormTemplate, BookingRequest } from "@/domain";
import { parseTaskLinkToken } from "@/domain";
import { createServices } from "@/services";

/**
 * The receipt's link to its task (v0.169.0): given only while the form says so,
 * the same whenever it is worked out, opening the task wherever it has got to,
 * archived included, and closed again when the form turns it off.
 */

const owner = SEED_USER_IDS.danh;

const request = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  requesterName: "Priya Nair",
  requesterEmail: "priya.tasklink@rmit.edu.au",
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
  ...overrides,
});

describe("the receipt's task link", { timeout: 30_000 }, () => {
  let services: ReturnType<typeof createServices>;
  const key = async () => (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bookingKey!;
  const publish = async (edit: (t: BookingFormTemplate) => void = () => {}) => {
    const template = fixtureBookingFormTemplate();
    edit(template);
    await services.booking.publishForm(SEED_WORKSPACE_ID, template, "Task link test", { publishedBy: owner });
  };
  const book = async (overrides: Partial<BookingRequest> = {}) => services.booking.submit({ workspaceSlug: "rmit", key: await key(), request: request(overrides) });
  const tokenOf = (link: string) => link.split("/booking/t/")[1]!;

  beforeEach(async () => {
    services = createServices(createLocalRepositories({ databaseName: `tasklink-${Date.now()}-${Math.random()}` }));
    await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, owner);
  });

  it("is not on the receipt unless the form gives it", async () => {
    await publish();
    expect((await book()).taskLink ?? null).toBeNull();
  });

  it("is on the receipt when the form gives it, and is the same every time it is worked out", async () => {
    await publish((t) => (t.review.shareTaskLink = true));
    const receipt = await book();
    expect(receipt.taskLink).toMatch(/^\/rmit\/booking\/t\/[0-9a-f-]{36}\.[0-9a-f]{40}$/);
    expect(parseTaskLinkToken(tokenOf(receipt.taskLink!))?.itemId).toBe(receipt.itemId);
    expect(await services.taskLinks.linkFor(receipt.itemId, "rmit")).toBe(receipt.taskLink);
    expect(await services.booking.taskLinkFor(SEED_WORKSPACE_ID, receipt.itemId)).toBe(receipt.taskLink);
    // Another task, another link.
    expect((await book({ title: "Another" })).taskLink).not.toBe(receipt.taskLink);
  });

  it("opens the task, read-only, wherever it is: on a team's board, and archived", async () => {
    await publish((t) => (t.review.shareTaskLink = true));
    const receipt = await book();
    const token = tokenOf(receipt.taskLink!);
    const opened = await services.taskLinks.open(token);
    expect(opened.itemId).toBe(receipt.itemId);
    expect(opened.items.map((i) => i.name)).toContain("Open Day posters");
    // Allocated to a team's board: the same link still opens it.
    const target = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => !b.system && !b.archivedAt)!;
    await services.booking.allocate(receipt.itemId, target.id, owner);
    expect((await services.taskLinks.open(token)).board.id).toBe(target.id);
    expect(await services.taskLinks.linkFor(receipt.itemId, "rmit")).toBe(receipt.taskLink);
    // Archived: still opens, still the same link.
    await services.repos.items.update(receipt.itemId, { archivedAt: new Date().toISOString() });
    const archived = await services.taskLinks.open(token);
    expect(archived.itemId).toBe(receipt.itemId);
    // The task itself is in what is handed over, not only its id.
    expect(archived.items.find((i) => i.id === receipt.itemId)?.archivedAt).toBeTruthy();
  });

  it("refuses a link that was not made for that task", async () => {
    await publish((t) => (t.review.shareTaskLink = true));
    const first = await book();
    const second = await book({ title: "Second" });
    const [, signature] = tokenOf(first.taskLink!).split(".");
    // First task's signature on the second task's id.
    await expect(services.taskLinks.open(`${second.itemId}.${signature}`)).rejects.toThrow(/does not open/);
    await expect(services.taskLinks.open(`${first.itemId}.${"0".repeat(40)}`)).rejects.toThrow(/does not open/);
    await expect(services.taskLinks.open("not-a-link")).rejects.toThrow(/does not open/);
  });

  it("is closed while the form has it off, and opens again when it is back on", async () => {
    await publish((t) => (t.review.shareTaskLink = true));
    const receipt = await book();
    const token = tokenOf(receipt.taskLink!);
    await publish((t) => (t.review.shareTaskLink = false));
    await expect(services.taskLinks.open(token)).rejects.toThrow(/turned off/);
    await publish((t) => (t.review.shareTaskLink = true));
    expect((await services.taskLinks.open(token)).itemId).toBe(receipt.itemId);
  });

  it("a task deleted for good has nothing to open", async () => {
    await publish((t) => (t.review.shareTaskLink = true));
    const receipt = await book();
    await services.repos.items.deleteMany([receipt.itemId]);
    await expect(services.taskLinks.open(tokenOf(receipt.taskLink!))).rejects.toThrow(/does not open/);
  });

  it("the receipt after a send-back gives the same link", async () => {
    await publish((t) => (t.review.shareTaskLink = true));
    const receipt = await book();
    const sent = await services.bookingSendBacks.send(receipt.itemId, "Which campus?", owner);
    const again = await services.bookingSendBacks.resubmit(sent.token, request({ dueDate: "2026-12-12" }), "");
    expect(again.taskLink).toBe(receipt.taskLink);
  });
});
