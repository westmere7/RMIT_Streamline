import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { SELF_JOIN_MESSAGES } from "@/domain";
import { createServices } from "@/services";

async function setup(name: string) {
  const services = createServices(createLocalRepositories({ databaseName: `self-join-${name}-${Date.now()}` }));
  await services.repos.admin.resetToSeed();
  return services;
}

describe("the workspace join link", () => {
  it("adds a new email as a pending member and hands over their personal link", async () => {
    const services = await setup("new");
    expect((await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.joinKey ?? null).toBeNull();
    const key = (await services.workspace.setJoinLink(SEED_WORKSPACE_ID, true)).joinKey!;
    expect(await services.workspace.previewSelfJoin(key)).toEqual({ valid: true, workspaceName: expect.any(String) });

    const { token } = await services.workspace.selfJoin({ key, email: "  Nga.Ma@Example.com ", firstName: "Nga", lastName: "Ma" });
    // The same pending member "Add member" makes: a MEMBER, invited by the owner, finishing on their own link.
    const preview = await services.workspace.previewInvitation(token);
    expect(preview.status).toBe("PENDING");
    const user = await services.repos.users.getByEmail("nga.ma@example.com");
    const member = (await services.repos.workspaces.listMembers(SEED_WORKSPACE_ID)).find((m) => m.userId === user!.id)!;
    expect([member.role, member.status, user!.displayName]).toEqual(["MEMBER", "INVITED", "Nga Ma"]);
    const invitation = (await services.repos.onboarding.listInvitations(SEED_WORKSPACE_ID)).find((i) => i.token === token)!;
    expect(invitation.createdBy).toBe(SEED_USER_IDS.danh);

    // They finish as anyone invited does.
    await services.workspace.completeOnboarding({ token, password: "correct horse battery", firstName: "Nga", lastName: "Ma", jobTitle: "Designer" });
    expect((await services.repos.workspaces.listMembers(SEED_WORKSPACE_ID)).find((m) => m.userId === user!.id)!.status).toBe("ACTIVE");
  });

  it("turns away an email it already knows, saying what to do instead", async () => {
    const services = await setup("known");
    const key = (await services.workspace.setJoinLink(SEED_WORKSPACE_ID, true)).joinKey!;
    const join = (email: string) => services.workspace.selfJoin({ key, email, firstName: "Some", lastName: "One" });

    const active = await services.repos.users.getById(SEED_USER_IDS.jun);
    await expect(join(active!.email)).rejects.toThrow(SELF_JOIN_MESSAGES.member);

    const pending = (await services.repos.workspaces.listMembers(SEED_WORKSPACE_ID)).find((m) => m.status === "INVITED")!;
    const pendingUser = await services.repos.users.getById(pending.userId);
    await expect(join(pendingUser!.email.toUpperCase())).rejects.toThrow(SELF_JOIN_MESSAGES.pending);

    // Nothing about them changed.
    expect((await services.repos.workspaces.listMembers(SEED_WORKSPACE_ID)).find((m) => m.userId === pending.userId)!.status).toBe("INVITED");
  });

  it("stops working when it is turned off or replaced", async () => {
    const services = await setup("off");
    const first = (await services.workspace.setJoinLink(SEED_WORKSPACE_ID, true)).joinKey!;
    const second = (await services.workspace.setJoinLink(SEED_WORKSPACE_ID, true)).joinKey!;
    expect(second).not.toBe(first);
    expect((await services.workspace.previewSelfJoin(first)).valid).toBe(false);
    await expect(services.workspace.selfJoin({ key: first, email: "late@example.com", firstName: "Late", lastName: "Comer" })).rejects.toThrow(SELF_JOIN_MESSAGES.off);

    await services.workspace.setJoinLink(SEED_WORKSPACE_ID, false);
    expect((await services.workspace.previewSelfJoin(second)).valid).toBe(false);
  });
});
