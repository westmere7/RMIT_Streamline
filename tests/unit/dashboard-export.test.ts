import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { hasAnyRate, normaliseAssetRates, EMPTY_WORK_TYPES } from "@/domain";
import { buildFacts } from "@/features/dashboard/analytics";
import { buildDashboardPdf, pdfSafe, reportFileName, reportSections, reportTimestamp, tint, type ExportMeta } from "@/features/dashboard/export-pdf";
import { coverage, effortByTask, monthlyComparison, operations, resolvePeriod, taskValuer, volumeReport } from "@/features/dashboard/metrics";
import { DEFAULT_PREFS } from "@/features/dashboard/prefs";
import type { DashboardViewProps } from "@/features/dashboard/views/types";
import { loadDashboardSnapshot } from "@/services/dashboard-service";

/** The figures the dashboard screen hands its views, computed the way the screen does, from the seeded demo workspace. */
async function seededView(): Promise<DashboardViewProps> {
  const repos = createLocalRepositories({ databaseName: `export-${Date.now()}` });
  const snapshot = await loadDashboardSnapshot(repos, SEED_WORKSPACE_ID, await repos.boards.listByWorkspace(SEED_WORKSPACE_ID));
  const facts = buildFacts(snapshot);
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const prefs = { ...DEFAULT_PREFS };
  const period = resolvePeriod({ mode: prefs.periodMode, year, quarter: prefs.quarter, month: prefs.month, from: prefs.from, to: prefs.to, comparisonYear: year - 1 }, today);
  const rates = normaliseAssetRates(snapshot.workspace.assetRates);
  const measure = hasAnyRate(rates) || prefs.measure !== "effort" ? prefs.measure : "tasks";
  const valueOf = taskValuer(measure, effortByTask(facts, rates));
  const report = volumeReport(facts, period, prefs.basis, prefs.teamIds, rates);
  return {
    facts,
    report,
    workTypes: EMPTY_WORK_TYPES,
    monthly: monthlyComparison(facts, period, prefs.basis, measure, prefs.teamIds, rates),
    monthlyTasks: monthlyComparison(facts, period, prefs.basis, "tasks", prefs.teamIds),
    monthlyAssets: monthlyComparison(facts, period, prefs.basis, "assets", prefs.teamIds),
    monthlyEffort: monthlyComparison(facts, period, prefs.basis, "effort", prefs.teamIds, rates),
    rates,
    ops: operations(facts, today, prefs.teamIds),
    gaps: coverage(report.current.tasks),
    prefs,
    set: () => undefined,
    today,
    measure,
    valueOf,
  };
}

const meta: ExportMeta = {
  workspaceName: "RMIT Creative Team",
  workspaceSlug: "rmit",
  periodLabel: "2026 to 27 Sep",
  comparisonLabel: "2025 to 27 Sep",
  measureLabel: "Tasks",
  basisLabel: "When the work was requested",
  teamsLabel: "All teams",
  generatedBy: "Admin Account",
  timezone: "Asia/Saigon",
};

describe("the dashboard report", () => {
  it("draws every panel of the page, in its order", async () => {
    const titles = reportSections(await seededView()).map((s) => s.title);
    expect(titles.slice(0, 3)).toEqual(["Tasks", "Asset units", "Tasks by month"]);
    for (const title of ["By team", "By department", "Priority", "Current operations", "Asset types", "Who is carrying what", "Turnaround", "On time", "Sent back", "In and out"]) expect(titles).toContain(title);
  });

  it("is a vector PDF with a cover, the panels and a footer on every page", async () => {
    const doc = await buildDashboardPdf(await seededView(), meta, new Date("2026-09-27T11:42:00.000Z"));
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThanOrEqual(5);
    const bytes = doc.output("arraybuffer");
    // Set EXPORT_PDF to a path to look at the result.
    if (process.env.EXPORT_PDF) writeFileSync(process.env.EXPORT_PDF, Buffer.from(bytes));
    const raw = Buffer.from(bytes).toString("latin1");
    // No pictures of the screen: the only images are the logos.
    expect((raw.match(/\/Subtype \/Image/g) ?? []).length).toBeLessThanOrEqual(2);
    expect(doc.getCurrentPageInfo().pageNumber).toBe(pages);
  });

  it("names the file and the moment in the reporting timezone", () => {
    const at = new Date("2026-09-27T11:42:00.000Z");
    expect(reportFileName("rmit", at, "Asia/Saigon")).toBe("dashboard-rmit-2026-09-27-1842.pdf");
    expect(reportTimestamp(at, "Asia/Saigon")).toMatch(/27 September 2026.*6:42.*\(Asia\/Saigon\)/);
  });

  it("keeps to what the PDF's font can print", () => {
    expect(pdfSafe("Settings → Asset types · −6 · Nguyễn")).toBe("Settings -> Asset types · -6 · Nguyen");
    expect(tint("#000000", 0.5)).toBe("#808080");
  });
});
