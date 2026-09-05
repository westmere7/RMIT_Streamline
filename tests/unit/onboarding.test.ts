import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories, type LocalRepositories } from "@/data/local";
import { SEED_INVITATION_TOKENS, SEED_TEAM_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { generateInvitationToken, invitationStatus, isPlausibleInvitationToken, type WorkspaceInvitation } from "@/domain";
import { LocalAuthProvider, PENDING_SIGN_IN_MESSAGE } from "@/features/auth/providers/local-auth-provider";
import { createServices, type Services } from "@/services";

let counter = 0;

function fresh() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `onboarding-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos), auth: new LocalAuthProvider(repos.users, repos.workspaces, repos.onboarding) };
}

const WS = SEED_WORKSPACE_ID;
const ADMIN = SEED_USER_IDS.danh;

async function inviteSam(services: Services, overrides: Partial<Parameters<Services["workspace"]["inviteMember"]>[0]> = {}) {
  return services.workspace.inviteMember({
    workspaceId: WS,
    invitedBy: ADMIN,
    email: "Sam.Rivera@rmit.edu.au",
    firstName: "Sam",
    lastName: "Rivera",
    jobTitle: "Producer",
    role: "MEMBER",
    teamIds: [SEED_TEAM_IDS.campaigns],
    ...overrides,
  });
}

describe("invitation tokens", () => {
  it("are long, URL-safe and unique", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(isPlausibleInvitationToken(a)).toBe(true);
    expect(isPlausibleInvitationToken("short")).toBe(false);
    expect(isPlausibleInvitationToken("has spaces and $ymbols in it")).toBe(false);
  });

  it("derive a status from the row", () => {
    const base: WorkspaceInvitation = {
      id: "i",
      workspaceId: WS,
      userId: "u",
      token: "t".repeat(20),
      createdBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-02-01T00:00:00.000Z",
      acceptedAt: null,
      revokedAt: null,
    };
    const now = new Date("2026-01-15T00:00:00.000Z");
    expect(invitationStatus(base, now)).toBe("PENDING");
    expect(invitationStatus({ ...base, acceptedAt: "2026-01-10T00:00:00.000Z" }, now)).toBe("ACCEPTED");
    expect(invitationStatus({ ...base, revokedAt: "2026-01-10T00:00:00.000Z" }, now)).toBe("REVOKED");
    expect(invitationStatus(base, new Date("2026-03-01T00:00:00.000Z"))).toBe("EXPIRED");
    expect(invitationStatus(null)).toBe("INVALID");
  });
});

describe("onboarding through the local store", () => {
  let repos: LocalRepositories;
  let services: Services;
  let auth: LocalAuthProvider;

  beforeEach(() => {
    ({ repos, services, auth } = fresh());
  });

  it("seeds pending members who cannot sign in and are not offered on the login screen", async () => {
    const members = await repos.workspaces.listMembers(WS);
    const pending = members.filter((m) => m.status === "INVITED");
    expect(pending.map((m) => m.userId).sort()).toEqual([SEED_USER_IDS.anh, SEED_USER_IDS.lucas, SEED_USER_IDS.mai].sort());

    const accounts = await services.workspace.listSignInAccounts();
    expect(accounts.some((u) => u.id === SEED_USER_IDS.anh)).toBe(false);
    expect(accounts.some((u) => u.id === SEED_USER_IDS.danh)).toBe(true);

    await expect(auth.signIn({ email: "anh@rmit.local" })).rejects.toThrow(PENDING_SIGN_IN_MESSAGE);

    const live = await services.workspace.listLiveInvitations(WS);
    expect(live.get(SEED_USER_IDS.anh)?.token).toBe(SEED_INVITATION_TOKENS.anh);
  });

  it("adds a pending member with a link, and the whole flow activates them", async () => {
    const { user, member, invitation } = await inviteSam(services);
    expect(user.email).toBe("sam.rivera@rmit.edu.au");
    expect(user.jobTitle).toBe("Producer");
    expect(member.status).toBe("INVITED");
    expect(member.role).toBe("MEMBER");
    expect(invitationStatus(invitation)).toBe("PENDING");
    expect((await repos.teams.listMembers(SEED_TEAM_IDS.campaigns)).some((m) => m.userId === user.id)).toBe(true);

    // Not in the workspace context's active set yet, but visible as a member.
    const ctx = await services.workspace.loadContext(WS);
    expect(ctx.users.some((u) => u.id === user.id)).toBe(true);
    expect(ctx.members.find((m) => m.userId === user.id)?.status).toBe("INVITED");

    // Cannot sign in before onboarding.
    await expect(auth.signIn({ email: user.email })).rejects.toThrow(PENDING_SIGN_IN_MESSAGE);

    // The join page sees the details the admin entered.
    const preview = await services.workspace.previewInvitation(invitation.token);
    expect(preview.status).toBe("PENDING");
    if (preview.status !== "PENDING") throw new Error("unreachable");
    expect(preview).toMatchObject({ workspaceName: "RMIT Creative Team", workspaceSlug: "rmit", email: user.email, firstName: "Sam", lastName: "Rivera", jobTitle: "Producer" });

    // Completing sets the password, tidies the profile and activates the membership.
    const result = await services.workspace.completeOnboarding({ token: invitation.token, password: "correct horse battery", firstName: "Samuel", lastName: "Rivera", jobTitle: "Senior Producer" });
    expect(result).toEqual({ email: user.email, userId: user.id });

    const updated = await repos.users.getById(user.id);
    expect(updated).toMatchObject({ firstName: "Samuel", displayName: "Samuel Rivera", jobTitle: "Senior Producer" });
    const membership = (await repos.workspaces.listMembers(WS)).find((m) => m.userId === user.id);
    expect(membership?.status).toBe("ACTIVE");
    expect((await services.workspace.listLiveInvitations(WS)).has(user.id)).toBe(false);
    expect((await services.workspace.listSignInAccounts()).some((u) => u.id === user.id)).toBe(true);

    // The link is single-use.
    expect((await services.workspace.previewInvitation(invitation.token)).status).toBe("ACCEPTED");
    await expect(services.workspace.completeOnboarding({ token: invitation.token, password: "another password", firstName: "X", lastName: "Y", jobTitle: null })).rejects.toThrow(/already been used/);

    // Signing in works now, with the right password only.
    await expect(auth.signIn({ email: user.email, password: "wrong password!" })).rejects.toThrow(/not right/);
    const session = await auth.signIn({ email: user.email, password: "correct horse battery" });
    expect(session.userId).toBe(user.id);
  });

  it("rejects bad input on completion without burning the link", async () => {
    const { invitation } = await inviteSam(services);
    await expect(services.workspace.completeOnboarding({ token: invitation.token, password: "short", firstName: "Sam", lastName: "Rivera", jobTitle: null })).rejects.toThrow(/at least 8/);
    await expect(services.workspace.completeOnboarding({ token: invitation.token, password: "long enough password", firstName: "", lastName: "Rivera", jobTitle: null })).rejects.toThrow(/name/);
    expect((await services.workspace.previewInvitation(invitation.token)).status).toBe("PENDING");
  });

  it("treats unknown, expired and revoked links as unusable", async () => {
    expect((await services.workspace.previewInvitation("definitely-not-a-real-token")).status).toBe("INVALID");
    await expect(services.workspace.completeOnboarding({ token: "definitely-not-a-real-token", password: "long enough password", firstName: "A", lastName: "B", jobTitle: null })).rejects.toThrow(/not valid/);

    const { user, invitation } = await inviteSam(services);
    const db = await repos.connection.getDb();
    await db.put("workspaceInvitations", { ...invitation, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await services.workspace.previewInvitation(invitation.token)).status).toBe("EXPIRED");
    expect((await services.workspace.listLiveInvitations(WS)).has(user.id)).toBe(false);

    // A new link replaces the old one and works.
    const renewed = await services.workspace.regenerateInvitation(WS, user.id);
    expect(renewed.token).not.toBe(invitation.token);
    expect((await services.workspace.previewInvitation(renewed.token)).status).toBe("PENDING");
    expect((await services.workspace.listLiveInvitations(WS)).get(user.id)?.id).toBe(renewed.id);

    // Regenerating again revokes the live one.
    const third = await services.workspace.regenerateInvitation(WS, user.id);
    expect((await services.workspace.previewInvitation(renewed.token)).status).toBe("REVOKED");
    expect((await services.workspace.previewInvitation(third.token)).status).toBe("PENDING");
  });

  it("refuses duplicates and deactivated accounts", async () => {
    await inviteSam(services);
    await expect(inviteSam(services, { email: "SAM.RIVERA@rmit.edu.au" })).rejects.toThrow(/already a member/);
    await expect(inviteSam(services, { email: "danh@rmit.local" })).rejects.toThrow(/already a member/);

    const janeMember = (await repos.workspaces.listMembers(WS)).find((m) => m.userId === SEED_USER_IDS.jane)!;
    await services.workspace.setMemberActive(janeMember.id, SEED_USER_IDS.jane, false);
    await repos.workspaces.removeMember(janeMember.id);
    await expect(inviteSam(services, { email: "jane@rmit.local" })).rejects.toThrow(/deactivated/);
  });

  it("cancelling a pending invitation removes the member, their teams, links and unused account", async () => {
    const { user } = await inviteSam(services);
    await services.workspace.cancelInvitation(WS, user.id);
    expect((await repos.workspaces.listMembers(WS)).some((m) => m.userId === user.id)).toBe(false);
    expect((await repos.teams.listMembers(SEED_TEAM_IDS.campaigns)).some((m) => m.userId === user.id)).toBe(false);
    expect(await repos.onboarding.listInvitations(WS)).not.toContainEqual(expect.objectContaining({ userId: user.id }));
    expect(await repos.users.getById(user.id)).toBeNull();

    // Only pending members can be cancelled; active ones are deactivated instead.
    await expect(services.workspace.cancelInvitation(WS, SEED_USER_IDS.emily)).rejects.toThrow(/not finished onboarding/);
    // Cancelling and re-adding is allowed.
    const again = await inviteSam(services);
    expect(again.member.status).toBe("INVITED");
  });

  it("does not resurrect a session for someone who is still pending", async () => {
    const { user, invitation } = await inviteSam(services);
    window.localStorage.setItem("streamline.local-session", JSON.stringify({ userId: user.id, email: user.email, provider: "local" }));
    expect(await auth.getSession()).toBeNull();
    await services.workspace.completeOnboarding({ token: invitation.token, password: "long enough password", firstName: "Sam", lastName: "Rivera", jobTitle: null });
    window.localStorage.setItem("streamline.local-session", JSON.stringify({ userId: user.id, email: user.email, provider: "local" }));
    expect((await auth.getSession())?.userId).toBe(user.id);
  });
});
