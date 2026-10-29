import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { defaultBookingFormTemplate, serviceById, syncFormWorkTypes, WORK_TYPES_LABEL } from "@/domain";
import { createServices } from "@/services";
import { syncBookingFormsWithWorkTypes } from "@/services/booking-work-types";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";

const WORK_TYPES = [
  { name: "Design", color: "blue" as const },
  { name: "Publication", color: "purple" as const },
  { name: "Photography", color: "pink" as const },
];

describe("a booking form's work types", () => {
  it("keeps only the work types that exist, matched without regard to case, in their colours", () => {
    const form = fixtureBookingFormTemplate();
    serviceById(form, "svc-production")!.subServices = [{ name: "photography", color: "sky" }, { name: "Videography", color: "purple" }];
    const synced = syncFormWorkTypes(form, WORK_TYPES);
    expect(serviceById(synced, "svc-design")!.subServices).toEqual([{ name: "Publication", color: "purple" }]);
    expect(serviceById(synced, "svc-brand")!.subServices).toEqual([{ name: "Publication", color: "purple" }]);
    expect(serviceById(synced, "svc-production")!.subServices).toEqual([{ name: "Photography", color: "pink" }]);
  });

  it("follows a rename, and drops a work type that has gone", () => {
    const form = syncFormWorkTypes(fixtureBookingFormTemplate(), WORK_TYPES);
    const renamed = syncFormWorkTypes(form, [{ name: "Publications", color: "purple" }, { name: "Design", color: "blue" }], new Map([["Publication", "Publications"]]));
    expect(serviceById(renamed, "svc-design")!.subServices).toEqual([{ name: "Publications", color: "purple" }]);
    expect(serviceById(renamed, "svc-production")!.subServices).toEqual([]);
  });

  it("hands back the very same form when nothing changes", () => {
    const form = syncFormWorkTypes(fixtureBookingFormTemplate(), WORK_TYPES);
    expect(syncFormWorkTypes(form, WORK_TYPES)).toBe(form);
  });

  it("starts a new workspace's form with no work types offered, under the Work types question", () => {
    const form = defaultBookingFormTemplate();
    expect(form.services.every((s) => s.subServices.length === 0)).toBe(true);
    expect(form.services.every((s) => s.subServiceLabel === WORK_TYPES_LABEL)).toBe(true);
  });
});

describe("keeping a workspace's booking forms in step", () => {
  it("rewrites the published form, the draft and every saved form, and leaves agreeing ones alone", async () => {
    const repos = createLocalRepositories({ databaseName: `booking-work-types-${Date.now()}-${Math.random()}` });
    const services = createServices(repos);
    const form = fixtureBookingFormTemplate();
    form.review.submitLabel = "Send it";
    await services.booking.publishForm(SEED_WORKSPACE_ID, form);
    await services.booking.saveDraft(SEED_WORKSPACE_ID, form);
    const saved = await repos.bookingTemplates.create({ workspaceId: SEED_WORKSPACE_ID, name: "Old one", description: null, template: form, createdBy: SEED_USER_IDS.danh });

    expect(await syncBookingFormsWithWorkTypes(repos, SEED_WORKSPACE_ID, WORK_TYPES)).toBe(3);
    const workspace = (await repos.workspaces.getById(SEED_WORKSPACE_ID))!;
    for (const stored of [workspace.bookingForm!, workspace.bookingFormDraft!, (await repos.bookingTemplates.getById(saved.id))!.template]) {
      expect(serviceById(stored, "svc-design")!.subServices.map((o) => o.name)).toEqual(["Publication"]);
      expect(serviceById(stored, "svc-production")!.subServices.map((o) => o.name)).toEqual(["Photography"]);
      // Nothing else about the form moves.
      expect(stored.review.submitLabel).toBe("Send it");
    }
    expect(await syncBookingFormsWithWorkTypes(repos, SEED_WORKSPACE_ID, WORK_TYPES)).toBe(0);
  });
});
