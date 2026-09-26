/* eslint-disable */
// An audit tool run by hand, not app code; kept out of the lint run on purpose.
//
// Phone-width sweep of every route: a screenshot, horizontal overflow, elements
// past the right edge, and tap targets smaller than 40px.
//
//   node Test_prompts/audits/2026-09-26-full-e2e/mobile-sweep.cjs <baseUrl> <outDir> [width] [height]
//   e.g. node …/mobile-sweep.cjs http://localhost:3200 ./sweep-390 390 844
//
// LOCAL provider only (the IndexedDB demo seed): it signs in as Danh from the
// local login page's account tiles, and discovers boards, teams, trackers and
// people from the app's own links. Writes report.json beside the screenshots.
const { chromium, devices } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://localhost:3200";
const OUT = process.argv[3] || path.join(process.cwd(), "mobile-sweep");
const W = Number(process.argv[4] || 390);
const H = Number(process.argv[5] || 844);
fs.mkdirSync(OUT, { recursive: true });

async function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const doc = document.scrollingElement || document.documentElement;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    const past = [];
    const small = [];
    const seen = new Set();
    for (const el of document.querySelectorAll("body *")) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Anything inside a horizontally scrolling box is meant to be there.
      let p = el.parentElement;
      let inScroller = false;
      while (p && p !== document.body) {
        const ps = getComputedStyle(p);
        if ((ps.overflowX === "auto" || ps.overflowX === "scroll") && p.scrollWidth > p.clientWidth + 1) {
          inScroller = true;
          break;
        }
        p = p.parentElement;
      }
      if (!inScroller && r.right > vw + 1 && r.left < vw) {
        const id = (el.getAttribute("data-testid") || el.tagName.toLowerCase()) + (el.id ? "#" + el.id : "");
        if (!seen.has(id)) {
          seen.add(id);
          past.push({ el: id, right: Math.round(r.right), text: (el.textContent || "").trim().slice(0, 40) });
        }
      }
      const interactive = el.matches("button, a[href], [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=switch], input:not([type=hidden]), select, textarea, summary");
      if (interactive && r.top < window.innerHeight && r.bottom > 0 && (r.width < 40 || r.height < 40) && !inScroller) {
        const label = el.getAttribute("aria-label") || el.getAttribute("data-testid") || (el.textContent || "").trim().slice(0, 30) || el.tagName.toLowerCase();
        small.push({ label, w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    return { overflowX, past: past.slice(0, 25), small: small.slice(0, 40), smallCount: small.length, h1: document.querySelector("h1")?.textContent?.trim() || null };
  });
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push({ url: page.url(), error: e.message.slice(0, 200) }));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push({ url: page.url(), console: m.text().slice(0, 200) });
  });

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.getByTestId("login-danh").click();
  await page.waitForURL(/\/workspace\/rmit$/, { timeout: 60000 });
  await page.waitForTimeout(1500);

  const linksOn = async (route) => {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    return page.$$eval("a[href]", (as) => [...new Set(as.map((a) => new URL(a.href).pathname))]);
  };
  const browse = await linksOn("/workspace/rmit/browse");
  const boards = browse.filter((h) => /\/boards\/[^/]+$/.test(h)).slice(0, 6);
  const teams = browse.filter((h) => /\/teams\//.test(h)).slice(0, 2);
  const trackers = browse.filter((h) => /\/trackers\/[^/]+$/.test(h)).slice(0, 2);
  const people = (await linksOn("/workspace/rmit/members")).filter((h) => /\/people\//.test(h)).slice(0, 2);

  const settings = ["general", "tickets", "teams", "departments", "asset-types", "permissions", "view", "snapshots", "danger", "documentation"];
  const routes = [
    ["home", "/workspace/rmit"],
    ["settings", "/workspace/rmit/settings"],
    ["my-work", "/workspace/rmit/my-work"],
    ["inbox", "/workspace/rmit/inbox"],
    ["browse", "/workspace/rmit/browse"],
    ["more", "/workspace/rmit/more"],
    ["dashboard", "/workspace/rmit/dashboard"],
    ["messages", "/workspace/rmit/messages"],
    ["members", "/workspace/rmit/members"],
    ["automations", "/workspace/rmit/automations"],
    ["portal-and-booking", "/workspace/rmit/book"],
    ["book-signed-in", "/book/rmit"],
    ["trackers", "/workspace/rmit/trackers"],
    ...settings.map((s) => ["settings-" + s, "/workspace/rmit/settings?section=" + s]),
    ...boards.flatMap((b, i) => [["board" + i, b], ...(i === 0 ? ["kanban", "timeline", "calendar", "gantt", "workload", "chart"].map((v) => ["board0-" + v, b + "?view=" + v]) : [])]),
    ...(boards[0] ? [["board0-archive", boards[0] + "/archive"]] : []),
    ...teams.map((t, i) => ["team" + i, t]),
    ...trackers.map((t, i) => ["tracker" + i, t]),
    ...people.map((p, i) => ["person" + i, p]),
  ];

  const report = [];
  for (const [name, route] of routes) {
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(1800);
      const m = await measure(page);
      await page.screenshot({ path: path.join(OUT, name + ".png") });
      report.push({ name, route, ...m });
      console.log(`${name.padEnd(24)} overflowX=${String(m.overflowX).padStart(4)} past=${m.past.length} smallTargets=${m.smallCount}`);
    } catch (e) {
      report.push({ name, route, error: e.message.split("\n")[0] });
      console.log(`${name.padEnd(24)} ERROR ${e.message.split("\n")[0]}`);
    }
  }

  // The task, opened full screen from the first board.
  if (boards[0]) {
    try {
      await page.goto(BASE + boards[0], { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      // By its name: the middle of a card is its row of chips, each opening its own sheet.
      const card = page.getByTestId("mobile-item-open").first();
      if (await card.count()) {
        await card.click();
        await page.waitForTimeout(1800);
        const m = await measure(page);
        await page.screenshot({ path: path.join(OUT, "task.png") });
        report.push({ name: "task", route: page.url(), ...m });
        console.log(`task                     overflowX=${m.overflowX} past=${m.past.length} smallTargets=${m.smallCount}`);
      }
    } catch (e) {
      console.log("task ERROR " + e.message.split("\n")[0]);
    }
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, width: W, height: H, report, errors }, null, 1));
  console.log(`\n${errors.length} page/console errors; report at ${path.join(OUT, "report.json")}`);
  await browser.close();
})();
