import { describe, expect, it } from "vitest";
import { GUIDE_ARTICLES, guideMarkdown, searchGuide } from "@/features/workspace/documentation/guide-content";

/**
 * The in-app guide (Settings → Guide) is prose, so nothing else notices when it
 * drifts. These checks keep its links whole and keep it from describing an app
 * that no longer exists — each phrase below was in the guide until the
 * 26 September 2026 audit, and each was wrong by then.
 */
describe("the in-app guide", () => {
  const ids = GUIDE_ARTICLES.map((article) => article.id);

  it("has one chapter per id, and every related chapter exists", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const article of GUIDE_ARTICLES) {
      for (const related of article.related) expect(ids, `${article.id} links to ${related}`).toContain(related);
    }
  });

  it("keeps the chapters the app links to", () => {
    // documentation-section.tsx opens "start", links "workflow" and the three quick starts.
    for (const id of ["start", "workflow", "quick-start-stakeholder", "quick-start-admin", "quick-start-manager"]) expect(ids).toContain(id);
  });

  it("describes the current app, not work in progress or screens that are gone", () => {
    const text = guideMarkdown();
    for (const stale of ["being updated", "pending completion", "Demand & Delivery", "Settings → Lists", "Settings → Data", "Export data", "do not synchronize asset lines"]) {
      expect(text, `the guide still says "${stale}"`).not.toContain(stale);
    }
  });

  it("finds chapters by what they cover", () => {
    expect(searchGuide("quick run").map((a) => a.id)).toContain("automations");
    expect(searchGuide("snapshot").map((a) => a.id)).toContain("data");
    expect(searchGuide("template").map((a) => a.id)).toContain("boards");
    expect(searchGuide("reaction").map((a) => a.id)).toContain("collaboration");
  });
});
