import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOOKING_KEY, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BookingRequest, Item } from "@/domain";
import { createServices, type Services } from "@/services";
import { splitPersonName } from "@/services/booking-service";

let counter = 0;
const WS = SEED_WORKSPACE_ID;

const request = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  requesterName: "Priya Nair",
  requesterEmail: "priya.nair@rmit.edu.au",
  department: "Comm.",
  title: "Open Day wayfinding posters",
  brief: "",
  assetTypes: ["Print"],
  assets: [{ name: "A1 poster", quantity: 6, spec: "594x841 mm" }],
  serviceTypeId: "svc-design",
  subServices: ["Print"],
  answers: {
    "design-what": { kind: "text", text: "Six A1 posters for the Brunswick campus." },
    "design-specs": { kind: "text", text: "A1 portrait, CMYK." },
    "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
  },
  teamId: null,
  dueDate: "2026-10-01",
  priority: "High",
  referenceUrl: null,
  ...overrides,
});

describe("the requester of a booking", () => {
  let services: Services;

  beforeEach(async () => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `booking-requester-${Date.now()}-${counter}` }));
    await services.repos.admin.resetToSeed();
  });

  /** Books through the public link, as a stakeholder with no account would. */
  const bookPublicly = (overrides: Partial<BookingRequest> = {}) => services.booking.submit({ workspaceSlug: "rmit", key: SEED_BOOKING_KEY, request: request(overrides), actorId: null });

  /** Who the task's Requester column holds. */
  async function requesterOf(itemId: string): Promise<string[]> {
    const item = (await services.repos.items.getById(itemId)) as Item;
    const column = (await services.repos.boards.listColumns(item.boardId)).find((c) => c.type === "REQUESTER");
    expect(column, "the board has a Requester column").toBeTruthy();
    const value = (await services.repos.items.listValuesByItem(itemId)).find((v) => v.columnId === column!.id)?.value;
    return value?.type === "REQUESTER" ? value.userIds : [];
  }
  const membershipOf = async (userId: string) => (await services.repos.workspaces.listMembers(WS)).find((m) => m.userId === userId) ?? null;

  it("makes a pending member of someone new, from the name and email they gave", async () => {
    const before = (await services.repos.users.list()).length;
    const receipt = await bookPublicly();
    const priya = await services.repos.users.getByEmail("priya.nair@rmit.edu.au");
    expect(priya).toMatchObject({ displayName: "Priya Nair", firstName: "Priya", lastName: "Nair" });
    expect((await services.repos.users.list()).length).toBe(before + 1);
    // Pending: added the way Members → Add member adds someone, with a join link, and no way in until they use it.
    const membership = await membershipOf(priya!.id);
    expect(membership).toMatchObject({ role: "MEMBER", status: "INVITED" });
    const invitations = (await services.repos.onboarding.listInvitations(WS)).filter((i) => i.userId === priya!.id && !i.acceptedAt && !i.revokedAt);
    expect(invitations).toHaveLength(1);
    expect(await requesterOf(receipt.itemId)).toEqual([priya!.id]);
  });

  it("is the same person the next time, with the name as they typed it this time", async () => {
    await bookPublicly();
    const priya = await services.repos.users.getByEmail("priya.nair@rmit.edu.au");
    const users = (await services.repos.users.list()).length;
    // A different case is the same email (the form trims it before sending); the name has been corrected.
    const second = await bookPublicly({ requesterName: "Priya S. Nair", requesterEmail: "Priya.Nair@RMIT.edu.au" });
    expect((await services.repos.users.list()).length).toBe(users);
    expect(await requesterOf(second.itemId)).toEqual([priya!.id]);
    expect((await services.repos.users.getById(priya!.id))?.displayName).toBe("Priya S. Nair");
    // Still one pending membership and one live link, not a second invitation.
    const invitations = (await services.repos.onboarding.listInvitations(WS)).filter((i) => i.userId === priya!.id && !i.acceptedAt && !i.revokedAt);
    expect(invitations).toHaveLength(1);
  });

  it("is an existing member when the email is theirs, renamed as submitted and still a full member", async () => {
    const emily = (await services.repos.users.getById(SEED_USER_IDS.emily))!;
    const receipt = await bookPublicly({ requesterName: "Emily Carter-Smith", requesterEmail: emily.email });
    expect(await requesterOf(receipt.itemId)).toEqual([emily.id]);
    expect((await services.repos.users.getById(emily.id))?.displayName).toBe("Emily Carter-Smith");
    expect((await membershipOf(emily.id))?.status).toBe("ACTIVE");
  });

  it("is the member who booked when signed in and booking as themselves, and nobody is renamed", async () => {
    const danh = (await services.repos.users.getById(SEED_USER_IDS.danh))!;
    const users = (await services.repos.users.list()).length;
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ requesterName: "D. Nguyen", requesterEmail: danh.email.toUpperCase() }), actorId: danh.id });
    expect(await requesterOf(receipt.itemId)).toEqual([danh.id]);
    expect((await services.repos.users.list()).length).toBe(users);
    expect((await services.repos.users.getById(danh.id))?.displayName).toBe(danh.displayName);
  });

  it("is the person on the form when a signed-in member books for someone else", async () => {
    const danh = (await services.repos.users.getById(SEED_USER_IDS.danh))!;
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ requesterName: "Someone Else", requesterEmail: "someone.else@rmit.edu.au" }), actorId: danh.id });
    const someone = await services.repos.users.getByEmail("someone.else@rmit.edu.au");
    expect(someone?.displayName).toBe("Someone Else");
    expect(await requesterOf(receipt.itemId)).toEqual([someone!.id]);
    expect((await membershipOf(someone!.id))?.status).toBe("INVITED");
    expect((await services.repos.users.getById(danh.id))?.displayName).toBe(danh.displayName);
    // And for a colleague the workspace has, that colleague.
    const emily = (await services.repos.users.getById(SEED_USER_IDS.emily))!;
    const forEmily = await services.booking.submit({ workspaceSlug: "rmit", key: null, request: request({ requesterName: emily.displayName, requesterEmail: emily.email }), actorId: danh.id });
    expect(await requesterOf(forEmily.itemId)).toEqual([emily.id]);
    expect(await services.booking.lookupRequester({ workspaceSlug: "rmit", key: null, email: emily.email })).toBe(emily.displayName);
  });

  it("fills in a known email's name for the form, and nothing for anything else", async () => {
    const emily = (await services.repos.users.getById(SEED_USER_IDS.emily))!;
    const lookup = (email: string, key: string | null = SEED_BOOKING_KEY) => services.booking.lookupRequester({ workspaceSlug: "rmit", key, email });
    expect(await lookup(emily.email)).toBe(emily.displayName);
    expect(await lookup(`  ${emily.email.toUpperCase()} `)).toBe(emily.displayName);
    expect(await lookup("nobody.here@rmit.edu.au")).toBeNull();
    expect(await lookup("not an email")).toBeNull();
    expect(await lookup("")).toBeNull();
    // Behind the booking link's own key.
    await expect(lookup(emily.email, "wrong-key-000000000000000")).rejects.toThrow();
    // A pending member made by an earlier booking is known too.
    await bookPublicly();
    expect(await lookup("priya.nair@rmit.edu.au")).toBe("Priya Nair");
  });

  it("works the same through the portal", async () => {
    const departments = await services.portals.ensureDepartments(WS);
    const portal = await services.portals.setEnabled(WS, true);
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const receipt = await services.portals.book(resolved, { submissionKey: "portal-requester-0001", departmentId: departments[0]!.id, request: request(), booking: services.booking });
    const priya = await services.repos.users.getByEmail("priya.nair@rmit.edu.au");
    expect(await requesterOf(receipt.itemId)).toEqual([priya!.id]);
    expect(await services.portals.publicLookupRequester({ token: portal.token, password: null }, "PRIYA.NAIR@rmit.edu.au", services.booking)).toBe("Priya Nair");
  });

  it("still takes the booking when the person cannot be recorded, keeping the name in the description", async () => {
    services.booking.useRequesters({
      find: async () => null,
      ensure: async () => {
        throw new Error("the directory is down");
      },
    });
    const original = console.error;
    console.error = () => undefined;
    try {
      const receipt = await bookPublicly();
      expect(await requesterOf(receipt.itemId)).toEqual([]);
      expect((await services.repos.items.getById(receipt.itemId))?.description ?? "").toContain("Priya Nair");
    } finally {
      console.error = original;
    }
  });

  it("splits a name for the profile", () => {
    expect(splitPersonName("  Priya   S.  Nair ")).toEqual({ firstName: "Priya", lastName: "S. Nair", displayName: "Priya S. Nair" });
    expect(splitPersonName("Cher")).toEqual({ firstName: "Cher", lastName: "", displayName: "Cher" });
  });
});
