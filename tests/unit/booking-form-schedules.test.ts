import { beforeEach, describe, expect, it } from "vitest";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BookingFormSchedule, BookingFormTemplate } from "@/domain";
import { DEFAULT_FORM_VERSION, RefusedError, activeSchedule, formForSubmission, overlappingSchedule, scheduleDatesProblem, scheduleToday, windowClosesAt, windowOpensAt } from "@/domain";
import { createServices } from "@/services";
import { bookingFormForSubmission, liveBookingForm } from "@/services/booking-service";

/** Saved forms put live for a window of days, and the default form coming back (v0.152.0). */

const owner = SEED_USER_IDS.danh;

describe("scheduled form windows", () => {
  const w = (id: string, startsOn: string, endsOn: string) => ({ id, startsOn, endsOn });

  it("reads today in Vietnam, not on the server's clock", () => {
    // 18:30 UTC on the 30th is already 01:30 on the 1st in Vietnam.
    expect(scheduleToday(new Date("2026-11-30T18:30:00Z"))).toBe("2026-12-01");
    expect(scheduleToday(new Date("2026-11-30T16:30:00Z"))).toBe("2026-11-30");
  });

  it("opens at the start of the first day and closes at the end of the last, Vietnam time", () => {
    expect(new Date(windowOpensAt({ startsOn: "2026-12-01" })).toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(new Date(windowClosesAt({ endsOn: "2026-12-07" })).toISOString()).toBe("2026-12-07T17:00:00.000Z");
  });

  it("finds the running window and refuses overlaps, last days included", () => {
    const list = [w("a", "2026-12-01", "2026-12-07"), w("b", "2026-12-10", "2026-12-12")];
    expect(activeSchedule(list, "2026-12-07")?.id).toBe("a");
    expect(activeSchedule(list, "2026-12-08")).toBeNull();
    expect(overlappingSchedule(list, "2026-12-07", "2026-12-09")?.id).toBe("a");
    expect(overlappingSchedule(list, "2026-12-08", "2026-12-09")).toBeNull();
    expect(overlappingSchedule(list, "2026-12-01", "2026-12-07", "a")).toBeNull();
  });

  it("says why dates can't be a window", () => {
    expect(scheduleDatesProblem("2026-12-05", "2026-12-01", "2026-11-22")).toMatch(/before the first/);
    expect(scheduleDatesProblem("2026-11-01", "2026-11-10", "2026-11-22")).toMatch(/passed/);
    expect(scheduleDatesProblem("2026-11-20", "2026-11-25", "2026-11-22")).toBeNull();
  });
});

describe("the form a booking is checked against", () => {
  const form = (title: string) => ({ ...fixtureBookingFormTemplate(), header: { title } }) as BookingFormTemplate;
  const openDay: BookingFormSchedule = { id: "s1", workspaceId: "w", templateId: "t", name: "Open Day form", template: form("Open Day"), startsOn: "2026-12-01", endsOn: "2026-12-07", createdBy: null, createdAt: "" };
  const fallback = { template: form("Default"), name: "Default" };
  const liveOpenDay = { template: openDay.template, name: openDay.name, version: openDay.id, schedule: openDay };
  const liveDefault = { ...fallback, version: DEFAULT_FORM_VERSION, schedule: null };

  it("takes the default form for a visitor who opened it just before a window opened", () => {
    const justAfter = new Date(windowOpensAt(openDay) + 60 * 60 * 1000);
    expect(formForSubmission(liveOpenDay, DEFAULT_FORM_VERSION, fallback, [openDay], justAfter).version).toBe(DEFAULT_FORM_VERSION);
    const muchLater = new Date(windowOpensAt(openDay) + 8 * 60 * 60 * 1000);
    expect(formForSubmission(liveOpenDay, DEFAULT_FORM_VERSION, fallback, [openDay], muchLater).version).toBe("s1");
  });

  it("takes the scheduled form for a visitor who opened it just before it closed", () => {
    const justAfter = new Date(windowClosesAt(openDay) + 30 * 60 * 1000);
    expect(formForSubmission(liveDefault, "s1", fallback, [openDay], justAfter).name).toBe("Open Day form");
    const nextDay = new Date(windowClosesAt(openDay) + 24 * 60 * 60 * 1000);
    expect(formForSubmission(liveDefault, "s1", fallback, [openDay], nextDay).version).toBe(DEFAULT_FORM_VERSION);
  });

  it("serves the live form when the version is unknown or missing", () => {
    expect(formForSubmission(liveDefault, "nope", fallback, [openDay]).version).toBe(DEFAULT_FORM_VERSION);
    expect(formForSubmission(liveOpenDay, null, fallback, [openDay]).version).toBe("s1");
  });
});

describe("scheduling saved forms", { timeout: 20_000 }, () => {
  let services: ReturnType<typeof createServices>;
  beforeEach(async () => {
    services = createServices(createLocalRepositories({ databaseName: `schedules-${Date.now()}-${Math.random()}` }));
    window.localStorage.clear();
  });
  const today = () => scheduleToday();
  const plusDays = (days: number) => {
    const d = new Date(`${today()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  it("serves a scheduled saved form while its window runs, the default before and after, and the form version with it", async () => {
    const special = { ...fixtureBookingFormTemplate(), header: { title: "Open Day bookings" } };
    const saved = await services.booking.saveTemplate(SEED_WORKSPACE_ID, { name: "Open Day form", template: special }, owner);
    const schedule = await services.booking.scheduleSavedForm(SEED_WORKSPACE_ID, { templateId: saved.id, startsOn: today(), endsOn: plusDays(3) }, owner);
    const workspace = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!;

    const now = await liveBookingForm(services.repos, workspace);
    expect(now.version).toBe(schedule.id);
    expect(now.template.header?.title).toBe("Open Day bookings");
    expect((await services.booking.buildForm(SEED_WORKSPACE_ID)).version).toBe(schedule.id);

    const after = await liveBookingForm(services.repos, workspace, new Date(windowClosesAt(schedule) + 60_000));
    expect(after.version).toBe(DEFAULT_FORM_VERSION);
    // A booking someone started on the scheduled form a minute before it closed is checked against it.
    expect((await bookingFormForSubmission(services.repos, workspace, schedule.id, new Date(windowClosesAt(schedule) + 60_000))).version).toBe(schedule.id);
  });

  it("keeps the copy it was given, refuses overlaps and past days, and takes a newer copy on request", async () => {
    const saved = await services.booking.saveTemplate(SEED_WORKSPACE_ID, { name: "Summer", template: fixtureBookingFormTemplate() }, owner);
    const first = await services.booking.scheduleSavedForm(SEED_WORKSPACE_ID, { templateId: saved.id, startsOn: plusDays(2), endsOn: plusDays(5) }, owner);
    await expect(services.booking.scheduleSavedForm(SEED_WORKSPACE_ID, { templateId: saved.id, startsOn: plusDays(5), endsOn: plusDays(6) }, owner)).rejects.toBeInstanceOf(RefusedError);
    await expect(services.booking.scheduleSavedForm(SEED_WORKSPACE_ID, { templateId: saved.id, startsOn: plusDays(-5), endsOn: plusDays(-2) }, owner)).rejects.toThrow(/passed/);

    const edited = { ...fixtureBookingFormTemplate(), header: { title: "Summer, revised" } };
    await services.booking.saveTemplate(SEED_WORKSPACE_ID, { name: "Summer", template: edited }, owner);
    expect((await services.booking.listSchedules(SEED_WORKSPACE_ID))[0]!.template.header?.title).not.toBe("Summer, revised");
    const refreshed = await services.booking.updateSchedule(SEED_WORKSPACE_ID, first.id, { refreshCopy: true });
    expect(refreshed.template.header?.title).toBe("Summer, revised");

    await services.booking.deleteSchedule(first.id);
    expect(await services.booking.listSchedules(SEED_WORKSPACE_ID)).toHaveLength(0);
  });

  it("publishes a saved form as the default form, keeping the draft", async () => {
    const saved = await services.booking.saveTemplate(SEED_WORKSPACE_ID, { name: "Winter", template: fixtureBookingFormTemplate() }, owner);
    await services.booking.saveDraft(SEED_WORKSPACE_ID, { ...fixtureBookingFormTemplate(), header: { title: "Half-built" } });
    await services.booking.publishSavedForm(SEED_WORKSPACE_ID, saved.id, owner);
    const workspace = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!;
    expect(workspace.bookingFormName).toBe("Winter");
    expect((await services.booking.getDraft(SEED_WORKSPACE_ID)).header?.title).toBe("Half-built");
  });
});
