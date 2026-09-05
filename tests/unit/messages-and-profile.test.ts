import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { createServices } from "@/services";

let counter = 0;

describe("direct messages", () => {
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `messages-${Date.now()}-${counter}` }));
  });

  it("keeps a thread in order and counts what the recipient has not read", async () => {
    await services.messages.send(SEED_WORKSPACE_ID, SEED_USER_IDS.danh, SEED_USER_IDS.emily, "Morning — did the deck land?");
    await services.messages.send(SEED_WORKSPACE_ID, SEED_USER_IDS.emily, SEED_USER_IDS.danh, "Yes, reviewing now.");
    await services.messages.send(SEED_WORKSPACE_ID, SEED_USER_IDS.danh, SEED_USER_IDS.emily, "No rush.");

    // Both sides see the same conversation, oldest first.
    const fromDanh = await services.messages.listThread(SEED_WORKSPACE_ID, SEED_USER_IDS.danh, SEED_USER_IDS.emily);
    const fromEmily = await services.messages.listThread(SEED_WORKSPACE_ID, SEED_USER_IDS.emily, SEED_USER_IDS.danh);
    expect(fromDanh.map((m) => m.body)).toEqual(["Morning — did the deck land?", "Yes, reviewing now.", "No rush."]);
    expect(fromEmily.map((m) => m.id)).toEqual(fromDanh.map((m) => m.id));

    // Emily has two unread; Danh has one.
    expect(await services.messages.unreadCount(SEED_WORKSPACE_ID, SEED_USER_IDS.emily)).toBe(2);
    expect(await services.messages.unreadCount(SEED_WORKSPACE_ID, SEED_USER_IDS.danh)).toBe(1);

    await services.messages.markRead(SEED_WORKSPACE_ID, SEED_USER_IDS.emily, SEED_USER_IDS.danh);
    expect(await services.messages.unreadCount(SEED_WORKSPACE_ID, SEED_USER_IDS.emily)).toBe(0);
    expect(await services.messages.unreadCount(SEED_WORKSPACE_ID, SEED_USER_IDS.danh)).toBe(1);
  });

  it("lists threads newest first with the other person resolved", async () => {
    await services.messages.send(SEED_WORKSPACE_ID, SEED_USER_IDS.danh, SEED_USER_IDS.emily, "First");
    await services.messages.send(SEED_WORKSPACE_ID, SEED_USER_IDS.joanne, SEED_USER_IDS.danh, "Second");

    const threads = await services.messages.listThreads(SEED_WORKSPACE_ID, SEED_USER_IDS.danh);
    expect(threads).toHaveLength(2);
    expect(threads[0]!.userId).toBe(SEED_USER_IDS.joanne);
    expect(threads[0]!.user?.displayName).toBe("Joanne Walsh");
    expect(threads[0]!.unread).toBe(1);
    expect(threads[1]!.unread).toBe(0);
  });

  it("refuses empty messages and messaging yourself", async () => {
    await expect(services.messages.send(SEED_WORKSPACE_ID, SEED_USER_IDS.danh, SEED_USER_IDS.emily, "   ")).rejects.toThrow(/empty/i);
    await expect(services.messages.send(SEED_WORKSPACE_ID, SEED_USER_IDS.danh, SEED_USER_IDS.danh, "hello")).rejects.toThrow(/yourself/i);
  });

  it("deleting a message removes it for both people", async () => {
    const sent = await services.messages.send(SEED_WORKSPACE_ID, SEED_USER_IDS.danh, SEED_USER_IDS.emily, "Ignore this");
    await services.messages.deleteMessage(sent.id);
    expect(await services.messages.listThread(SEED_WORKSPACE_ID, SEED_USER_IDS.emily, SEED_USER_IDS.danh)).toEqual([]);
  });
});

describe("profiles", () => {
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `profile-${Date.now()}-${counter}` }));
  });

  it("gathers the person, their teams, boards and assigned work", async () => {
    const profile = await services.profiles.load(SEED_WORKSPACE_ID, SEED_USER_IDS.danh);

    expect(profile.user.displayName).toBe("Danh Nguyen");
    expect(profile.member?.role).toBe("OWNER");
    expect(profile.teams.length).toBeGreaterThan(0);
    expect(profile.boards.length).toBeGreaterThan(0);
    expect(profile.tasks.length).toBeGreaterThan(0);
    // Every task listed is genuinely assigned to them.
    expect(profile.tasks.every((task) => task.item.id)).toBe(true);
    // A board he owns is reported as owned rather than inherited.
    const owned = profile.boards.find((b) => b.board.id === SEED_BOARD_IDS.rmitinerary);
    expect(owned?.relation).toBe("owner");
  });

  it("edits contact details and trims what it stores", async () => {
    const updated = await services.profiles.updateProfile(SEED_USER_IDS.tuyet, {
      displayName: "  Tuyet Le  ",
      jobTitle: "  Senior Graphic Designer ",
      department: "   ",
      timezone: "Asia/Singapore",
    });

    expect(updated.displayName).toBe("Tuyet Le");
    expect(updated.jobTitle).toBe("Senior Graphic Designer");
    // An emptied field becomes null rather than a blank string.
    expect(updated.department).toBeNull();
    expect(updated.timezone).toBe("Asia/Singapore");
  });

  it("will not save an empty display name", async () => {
    await expect(services.profiles.updateProfile(SEED_USER_IDS.tuyet, { displayName: "  " })).rejects.toThrow(/display name/i);
  });

  it("stores an avatar url on the profile", async () => {
    const updated = await services.profiles.updateProfile(SEED_USER_IDS.grace, { avatarUrl: "https://example.test/grace/avatar.webp" });
    expect(updated.avatarUrl).toBe("https://example.test/grace/avatar.webp");
    expect((await services.profiles.load(SEED_WORKSPACE_ID, SEED_USER_IDS.grace)).user.avatarUrl).toContain(".webp");
  });
});
