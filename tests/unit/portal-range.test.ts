import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BoardColumn, Item, StakeholderDepartment } from "@/domain";
import {
  DEFAULT_PORTAL_RANGE,
  EVERY_PORTAL_RANGE,
  defaultSettingsFor,
  formatPortalRange,
  parsePortalRange,
  portalRangeLabel,
  withinPortalRange,
} from "@/domain";
import { createServices, type ResolvedPortal, type Services } from "@/services";

let counter = 0;
const WS = SEED_WORKSPACE_ID;
const BOARD = SEED_BOARD_IDS.rmitinerary;

/** Days back from now, as an ISO stamp. */
function daysAgo(days: number): string {
  const at = new Date();
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString();
}

/**
 * How much of the past the portal puts on screen.
 *
 * One portal now carries every stakeholder's work, so the first read would be
 * the whole archive if nothing bounded it. A rolling window does — three months
 * unless somebody says otherwise — and the rules that matter are that the
 * window never decides what may be *found*, only what is shown unasked.
 */
describe("how far back the portal reads", () => {
  describe("the range itself", () => {
    it("survives the round trip through a URL", () => {
      for (const range of [DEFAULT_PORTAL_RANGE, EVERY_PORTAL_RANGE, { kind: "months" as const, months: 1 }, { kind: "year" as const, year: 2026 }]) {
        expect(parsePortalRange(formatPortalRange(range))).toEqual(range);
      }
    });

    it("opens on three months when nothing was asked for", () => {
      expect(DEFAULT_PORTAL_RANGE).toEqual({ kind: "months", months: 3 });
    });

    it("refuses a window nobody offers, so a hand-typed address cannot widen the read", () => {
      // Anything unrecognised is null and the caller falls back deliberately —
      // the important half being that a bad address falls back to the cheap
      // read rather than to everything.
      expect(parsePortalRange("99m")).toBeNull();
      expect(parsePortalRange("everything")).toBeNull();
      expect(parsePortalRange("")).toBeNull();
      expect(parsePortalRange(null)).toBeNull();
      expect(parsePortalRange("2026")).toEqual({ kind: "year", year: 2026 });
    });

    it("counts months back by the calendar, not in thirty-day blocks", () => {
      const now = new Date("2026-03-15T00:00:00.000Z");
      expect(withinPortalRange("2025-12-15T12:00:00.000Z", { kind: "months", months: 3 }, now)).toBe(true);
      expect(withinPortalRange("2025-12-14T00:00:00.000Z", { kind: "months", months: 3 }, now)).toBe(false);
      // A year is the calendar's, so December is in it and the next January is not.
      expect(withinPortalRange("2026-12-31T23:00:00.000Z", { kind: "year", year: 2026 }, now)).toBe(true);
      expect(withinPortalRange("2027-01-01T00:00:00.000Z", { kind: "year", year: 2026 }, now)).toBe(false);
      expect(withinPortalRange("1999-01-01T00:00:00.000Z", EVERY_PORTAL_RANGE, now)).toBe(true);
    });

    it("reads as something a visitor would say", () => {
      expect(portalRangeLabel({ kind: "months", months: 1 })).toBe("Last month");
      expect(portalRangeLabel({ kind: "months", months: 6 })).toBe("Last 6 months");
      expect(portalRangeLabel({ kind: "year", year: 2026 })).toBe("2026");
      expect(portalRangeLabel(EVERY_PORTAL_RANGE)).toBe("All time");
    });
  });

  describe("what it does to a portal", () => {
    let services: Services;
    let comm: StakeholderDepartment;
    let column: BoardColumn;
    let items: Item[];
    let resolved: ResolvedPortal;

    beforeEach(async () => {
      counter += 1;
      services = createServices(createLocalRepositories({ databaseName: `portal-range-${Date.now()}-${counter}` }));
      const departments = await services.portals.ensureDepartments(WS);
      comm = departments.find((d) => d.name === "Comm.")!;
      column = await services.repos.boards.createColumn({
        boardId: BOARD,
        name: "Stakeholder",
        type: "STAKEHOLDER",
        settings: defaultSettingsFor("STAKEHOLDER"),
        position: 99,
        width: 124,
        hidden: false,
      });
      items = (await services.repos.items.listByBoard(BOARD)).filter((i) => i.parentItemId === null);
      const portal = await services.portals.setEnabled(WS, true);
      resolved = await services.portals.resolve({ token: portal.token, password: null });
    });

    /**
     * A request for `comm`, arriving `days` ago.
     *
     * Provenance carries the booking time, which is what the window is measured
     * against — a labelled task falls back to when the task was made.
     */
    async function request(item: Item, days: number) {
      await services.repos.items.setValue(item.id, column.id, { type: "STAKEHOLDER", group: "Comm." });
      await services.portals.associate({
        workspaceId: WS,
        departmentId: comm.id,
        itemId: item.id,
        source: "IMPORT",
        publicBrief: null,
        bookedAt: daysAgo(days),
      });
      return item;
    }

    it("shows the last three months and leaves the rest of the archive alone", async () => {
      const recent = await request(items[0]!, 10);
      await request(items[1]!, 200);

      const page = await services.portals.tasks(resolved, { scope: { stakeholderId: null, range: DEFAULT_PORTAL_RANGE } });
      expect(page.tasks.map((t) => t.id)).toEqual([recent.id]);
      // The figures describe what is on screen, so they are the window's too.
      expect(page.totals.requests).toBe(1);
    });

    it("widens to the window that was asked for", async () => {
      await request(items[0]!, 10);
      await request(items[1]!, 100);
      await request(items[2]!, 400);

      const read = (range: Parameters<typeof formatPortalRange>[0]) => services.portals.tasks(resolved, { scope: { stakeholderId: null, range } });
      expect((await read({ kind: "months", months: 1 })).tasks).toHaveLength(1);
      expect((await read({ kind: "months", months: 6 })).tasks).toHaveLength(2);
      expect((await read(EVERY_PORTAL_RANGE)).tasks).toHaveLength(3);
    });

    it("reads a calendar year when one is chosen", async () => {
      const thisYear = new Date().getUTCFullYear();
      await request(items[0]!, 10);
      await request(items[1]!, 800);

      const page = await services.portals.tasks(resolved, { scope: { stakeholderId: null, range: { kind: "year", year: thisYear } } });
      expect(page.tasks.map((t) => t.id)).toEqual([items[0]!.id]);
    });

    it("searches every year whatever window is on screen", async () => {
      const old = await request(items[1]!, 400);
      await request(items[0]!, 5);

      // The window would hide it; a search is not a question about a date.
      const narrow = await services.portals.tasks(resolved, { scope: { stakeholderId: null, range: DEFAULT_PORTAL_RANGE } });
      expect(narrow.tasks.map((t) => t.id)).not.toContain(old.id);

      const found = await services.portals.tasks(resolved, {
        scope: { stakeholderId: null, range: DEFAULT_PORTAL_RANGE },
        search: old.name.slice(0, 8),
      });
      expect(found.tasks.map((t) => t.id)).toContain(old.id);
    });

    it("names the years that have work in them, however narrow the window", async () => {
      await request(items[0]!, 5);
      await request(items[1]!, 800);

      // The selector must not change as the visitor narrows what is on screen,
      // or choosing a year would take that year out of the list.
      const context = await services.portals.context(resolved, null, { stakeholderId: null, range: DEFAULT_PORTAL_RANGE });
      expect(context.years.length).toBeGreaterThan(1);
      expect(context.years).toEqual([...context.years].sort((a, b) => b - a));
      expect(context.range).toBe("3m");
    });

    it("counts each stakeholder over everything, not over the window", async () => {
      await request(items[0]!, 5);
      await request(items[1]!, 800);

      const context = await services.portals.context(resolved, null, { stakeholderId: null, range: DEFAULT_PORTAL_RANGE });
      const option = context.stakeholders.find((row) => row.id === comm.id);
      // Two requests, one of them years old: the selector says how much there
      // is to look at, not how much happens to be on screen.
      expect(option?.count).toBe(2);
    });

    it("opens one task by id whatever window is on screen", async () => {
      const old = await request(items[1]!, 900);
      const detail = await services.portals.task(resolved, old.id, null);
      expect(detail.id).toBe(old.id);
    });
  });
});
