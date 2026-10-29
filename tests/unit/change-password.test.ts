import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_TEAM_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { LocalAuthProvider } from "@/features/auth/providers/local-auth-provider";
import { createServices } from "@/services";

let counter = 0;
function fresh() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `change-password-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos), auth: new LocalAuthProvider(repos.users, repos.workspaces, repos.onboarding) };
}

/** Somebody who joined through a link, so their account has a password. */
async function joined(services: ReturnType<typeof createServices>) {
  const { user, invitation } = await services.workspace.inviteMember({
    workspaceId: SEED_WORKSPACE_ID,
    invitedBy: SEED_USER_IDS.danh,
    email: "pat@rmit.edu.au",
    firstName: "Pat",
    lastName: "Lee",
    jobTitle: null,
    role: "MEMBER",
    teamIds: [SEED_TEAM_IDS.campaigns],
  });
  await services.workspace.completeOnboarding({ token: invitation!.token, password: "first password", firstName: "Pat", lastName: "Lee", jobTitle: null });
  return user;
}

describe("changing your own password", () => {
  it("needs somebody signed in", async () => {
    const { auth } = fresh();
    await auth.signOut();
    await expect(auth.changePassword({ currentPassword: "x", newPassword: "something new" })).rejects.toThrow(/Sign in/);
  });

  it("refuses a wrong current password, a short, long or unchanged new one, and leaves the old one working", async () => {
    const { services, auth } = fresh();
    const user = await joined(services);
    await auth.signIn({ email: user.email, password: "first password" });
    await expect(auth.changePassword({ currentPassword: "not it at all", newPassword: "second password" })).rejects.toThrow(/current password is not right/);
    await expect(auth.changePassword({ currentPassword: "first password", newPassword: "short" })).rejects.toThrow(/at least 8/);
    await expect(auth.changePassword({ currentPassword: "first password", newPassword: "x".repeat(73) })).rejects.toThrow(/at most 72/);
    await expect(auth.changePassword({ currentPassword: "first password", newPassword: "first password" })).rejects.toThrow(/different/);
    await auth.signOut();
    await expect(auth.signIn({ email: user.email, password: "first password" })).resolves.toMatchObject({ userId: user.id });
  });

  it("changes it: the new one signs in, the old one no longer does", async () => {
    const { services, auth } = fresh();
    const user = await joined(services);
    await auth.signIn({ email: user.email, password: "first password" });
    await auth.changePassword({ currentPassword: "first password", newPassword: "second password" });
    // Still signed in here.
    expect(await auth.getSession()).toMatchObject({ userId: user.id });
    await auth.signOut();
    await expect(auth.signIn({ email: user.email, password: "first password" })).rejects.toThrow(/not right/);
    await expect(auth.signIn({ email: user.email, password: "second password" })).resolves.toMatchObject({ userId: user.id });
  });
});
