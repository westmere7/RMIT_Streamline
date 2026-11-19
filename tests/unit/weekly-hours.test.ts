import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { roundToHalfHour } from "@/domain";
import { createServices } from "@/services";

describe("weekly hours", () => {
  it("rounds to the nearest half hour", () => {
    expect(roundToHalfHour(37.7)).toBe(37.5);
    expect(roundToHalfHour(37.8)).toBe(38);
    expect(roundToHalfHour(37.25)).toBe(37.5);
    expect(roundToHalfHour(20)).toBe(20);
    expect(roundToHalfHour(0.2)).toBe(0);
  });

  it("saves only half hours, and leaves a figure stored before alone until it is edited", async () => {
    const services = createServices(createLocalRepositories({ databaseName: `weekly-hours-${Date.now()}` }));
    const [member, other] = await services.repos.workspaces.listMembers(SEED_WORKSPACE_ID);
    expect(member && other).toBeTruthy();

    expect((await services.workspace.setMemberWeeklyHours(member!.id, 37.7)).weeklyHours).toBe(37.5);
    expect((await services.workspace.setMemberWeeklyHours(member!.id, 22.75)).weeklyHours).toBe(23);
    expect((await services.workspace.setMemberWeeklyHours(member!.id, null)).weeklyHours).toBeNull();

    // A figure from before the rule (written straight to the store) reads as it was.
    await services.repos.workspaces.updateMember(other!.id, { weeklyHours: 37.7 });
    const reread = (await services.repos.workspaces.listMembers(SEED_WORKSPACE_ID)).find((m) => m.id === other!.id);
    expect(reread?.weeklyHours).toBe(37.7);
  });
});
