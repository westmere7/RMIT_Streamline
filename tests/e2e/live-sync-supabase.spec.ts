import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Another member's changes arrive without a refresh (v0.161.2), against the
 * DISPOSABLE Supabase stack.
 *
 * Emily keeps one page open and never reloads it. Danh changes things through
 * the API under his own login, so row-level security, the realtime publication
 * and the app's subscriptions are all in the path, exactly as for a teammate
 * at another desk. Each check waits for Emily's screen to catch up on its own.
 *
 * Run from the stack's worktree (its .env.local names the local stack):
 *   E2E_PROVIDER=supabase SKIP_DB_MIGRATE=1 npx playwright test -c <config at :3300> tests/e2e/live-sync-supabase.spec.ts
 */

const PROVIDER = process.env.E2E_PROVIDER ?? process.env.PW_PROVIDER ?? "local";
test.skip(PROVIDER !== "supabase", "Supabase only");
// One after another, in order (the panel checks build on the update posted
// before them), but a failure does not stop the rest: each is its own question.
test.describe.configure({ mode: "default" });

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (PROVIDER === "supabase" && !URL_.includes("127.0.0.1")) throw new Error("Refusing: this spec writes to the database and runs only against the local stack");

const PASSWORD = "Password123!";
const RUN = Date.now().toString(36).slice(-5);
/** How long another member's change may take to show: the slowest channel coalesces for a few seconds. */
const LIVE = { timeout: 20_000 };

const service = (): SupabaseClient => createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function as(email: string, password = PASSWORD): Promise<SupabaseClient> {
  const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

async function signedIn(browser: Browser, email: string, password = PASSWORD): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/]+$/, { timeout: 60_000 });
  return page;
}

/** Throws on a Supabase error, so a refused write fails the test where it happened. */
function ok<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  // A write without .select() answers with no rows; only reads use the value.
  return result.data as NonNullable<T>;
}

let danh: SupabaseClient;
let emily: Page;
const ids: Record<string, string> = {};
let workspaceId = "";
let board = { id: "", slug: "", groupId: "" };
let item = { id: "", name: "" };
let status = { columnId: "", labels: [] as Array<{ id: string; name: string }> };

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const db = service();
  for (const p of ok(await db.from("profiles").select("id, email"), "profiles")) ids[p.email.split("@")[0]] = p.id;
  workspaceId = ok(await db.from("workspaces").select("id").eq("slug", "rmit").single(), "workspace").id;
  const b = ok(await db.from("boards").select("id, slug").eq("workspace_id", workspaceId).eq("slug", "dooh-production").single(), "board");
  const group = ok(await db.from("board_groups").select("id").eq("board_id", b.id).order("position").limit(1).single(), "group");
  board = { id: b.id, slug: b.slug, groupId: group.id };
  const first = ok(await db.from("items").select("id, name").eq("board_id", b.id).eq("group_id", group.id).is("parent_item_id", null).is("archived_at", null).order("position").limit(1).single(), "item");
  item = first;
  const column = ok(await db.from("board_columns").select("id, settings").eq("board_id", b.id).eq("type", "STATUS").limit(1).single(), "status column");
  status = { columnId: column.id, labels: (column.settings as { labels: Array<{ id: string; name: string }> }).labels };
  danh = await as("danh@rmit.local");
  emily = await signedIn(browser, "emily@rmit.local");
});

test.afterAll(async () => {
  const db = service();
  if (item.id) await db.from("items").update({ name: item.name }).eq("id", item.id);
  await db.from("items").delete().like("name", `Live %${RUN}`);
  await db.from("board_groups").delete().like("name", `Live %${RUN}`);
  await db.from("board_saved_views").delete().like("name", `Live %${RUN}`);
  await db.from("teams").delete().like("name", `Live %${RUN}`);
  await emily?.context().close();
});

const boardPath = () => `/workspace/rmit/boards/${board.slug}`;
const row = (name: string) => emily.locator(`[data-testid="item-row"][data-item-name="${name}"]`);

async function onBoard() {
  if (!emily.url().endsWith(boardPath())) await emily.goto(boardPath());
  await expect(emily.getByTestId("board-table").first()).toBeVisible({ timeout: 60_000 });
}

async function onTask(tab: "Overview" | "Updates" | "Assets") {
  await emily.goto(`${boardPath()}?item=${item.id}`);
  const panel = emily.getByTestId("item-panel");
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await panel.getByRole("tab", { name: new RegExp(tab) }).click();
  return panel;
}

// ---- the board ----------------------------------------------------------------

test("a task renamed by someone else is renamed on the open board", async () => {
  await onBoard();
  const name = `Live renamed ${RUN}`;
  ok(await danh.from("items").update({ name }).eq("id", item.id), "rename");
  await expect(row(name)).toBeVisible(LIVE);
  ok(await danh.from("items").update({ name: item.name }).eq("id", item.id), "rename back");
  await expect(row(item.name)).toBeVisible(LIVE);
});

test("a status changed by someone else changes on the open board", async () => {
  await onBoard();
  const current = ok(await danh.from("item_column_values").select("value_json").eq("item_id", item.id).eq("column_id", status.columnId).maybeSingle(), "status now");
  const now = (current?.value_json as { labelId?: string } | undefined)?.labelId;
  const next = status.labels.find((l) => l.id !== now)!;
  ok(
    await danh.from("item_column_values").upsert({ item_id: item.id, column_id: status.columnId, board_id: board.id, value_json: { type: "STATUS", labelId: next.id } }, { onConflict: "item_id,column_id" }),
    "status",
  );
  await expect(row(item.name).getByRole("gridcell", { name: new RegExp(`^Status: ${next.name} for`) })).toBeVisible(LIVE);
});

test("a task added by someone else appears, and goes when they archive it", async () => {
  await onBoard();
  const name = `Live added ${RUN}`;
  const added = ok(await danh.from("items").insert({ board_id: board.id, group_id: board.groupId, name, position: -1, created_by: ids.danh }).select("id").single(), "add");
  await expect(row(name)).toBeVisible(LIVE);
  ok(await danh.from("items").update({ archived_at: new Date().toISOString() }).eq("id", added.id), "archive");
  await expect(row(name)).toHaveCount(0, LIVE);
});

test("a group added and renamed by someone else shows on the open board", async () => {
  await onBoard();
  const name = `Live group ${RUN}`;
  const group = ok(await danh.from("board_groups").insert({ board_id: board.id, name, position: -1 }).select("id").single(), "group");
  await expect(emily.getByTestId(`group-${name}`)).toBeVisible(LIVE);
  const renamed = `Live group two ${RUN}`;
  ok(await danh.from("board_groups").update({ name: renamed }).eq("id", group.id), "rename group");
  await expect(emily.getByTestId(`group-${renamed}`)).toBeVisible(LIVE);
});

test("a column renamed by someone else is renamed in the open board's header", async () => {
  await onBoard();
  const before = ok(await danh.from("board_columns").select("name").eq("id", status.columnId).single(), "column").name;
  const name = `Live ${RUN}`;
  ok(await danh.from("board_columns").update({ name }).eq("id", status.columnId), "rename column");
  await expect(emily.getByRole("button", { name, exact: true }).first()).toBeVisible(LIVE);
  ok(await danh.from("board_columns").update({ name: before }).eq("id", status.columnId), "rename back");
  await expect(emily.getByRole("button", { name: before, exact: true }).first()).toBeVisible(LIVE);
});

test("a shared view saved by someone else appears in the open board's views", async () => {
  await onBoard();
  const name = `Live view ${RUN}`;
  ok(await danh.from("board_saved_views").insert({ board_id: board.id, name, shared: true, config: {}, created_by: ids.danh }), "saved view");
  // The views menu reads the list when opened; wait for the list, then look.
  await expect
    .poll(
      async () => {
        await emily.getByTestId("saved-views-button").click();
        await expect(emily.getByTestId("saved-views-menu")).toBeVisible();
        const found = await emily.locator(`[data-testid="saved-view-option"][data-view-name="${name}"]`).count();
        await emily.keyboard.press("Escape");
        // Let it finish closing: a click while it animates out does not reopen it.
        await expect(emily.getByTestId("saved-views-menu")).toBeHidden();
        return found;
      },
      LIVE,
    )
    .toBe(1);
});

// ---- the task panel -------------------------------------------------------------

test("a description written by someone else shows in the open panel", async () => {
  const panel = await onTask("Overview");
  const text = `Live description ${RUN}`;
  ok(await danh.from("items").update({ description: text }).eq("id", item.id), "description");
  await expect(panel).toContainText(text, LIVE);
});

let comment = { id: "", body: "" };
test("an update posted by someone else appears in the open panel", async () => {
  const panel = await onTask("Updates");
  comment.body = `- [ ] Live box ${RUN}`;
  comment = { ...comment, id: ok(await danh.from("comments").insert({ item_id: item.id, author_id: ids.danh, body: comment.body }).select("id").single(), "comment").id };
  await expect(panel.getByTestId("comment").filter({ hasText: `Live box ${RUN}` })).toBeVisible(LIVE);
});

test("a reaction by someone else appears on the update", async () => {
  const panel = emily.getByTestId("item-panel");
  ok(await danh.from("comment_reactions").insert({ comment_id: comment.id, item_id: item.id, user_id: ids.danh, emoji: "🎉" }), "reaction");
  await expect(panel.getByTestId("comment").filter({ hasText: `Live box ${RUN}` }).getByRole("button", { name: /^🎉 1/ })).toBeVisible(LIVE);
});

test("a box ticked by the update's author is ticked in the open panel", async () => {
  const panel = emily.getByTestId("item-panel");
  ok(await danh.from("comment_checks").insert({ comment_id: comment.id, item_id: item.id, check_key: `live box ${RUN}`, checked_by: ids.danh }), "tick");
  await expect(panel.getByTestId("checklist-item").filter({ hasText: `Live box ${RUN}` }).getByRole("checkbox")).toHaveAttribute("aria-checked", "true", LIVE);
});

test("an update pinned by someone else shows as pinned", async () => {
  const panel = emily.getByTestId("item-panel");
  ok(await danh.from("comment_pins").insert({ comment_id: comment.id, item_id: item.id, overview: false, pinned_by: ids.danh }), "pin");
  await expect(panel.getByTestId("comment").filter({ hasText: `Live box ${RUN}` })).toContainText("Pinned", LIVE);
});

test("an asset line added by someone else appears in the open panel", async () => {
  const panel = await onTask("Assets");
  const name = `Live line ${RUN}`;
  ok(await danh.from("item_assets").insert({ item_id: item.id, board_id: board.id, name, created_by: ids.danh, position: 999 }), "asset");
  await expect(panel.locator(`[data-testid="asset-line"][data-asset-name="${name}"]`)).toBeVisible(LIVE);
});

// ---- the shell ------------------------------------------------------------------

test("a board renamed by someone else is renamed in the sidebar and its header", async () => {
  await onBoard();
  const before = ok(await danh.from("boards").select("name").eq("id", board.id).single(), "board").name;
  const name = `Live board ${RUN}`;
  ok(await danh.from("boards").update({ name }).eq("id", board.id), "rename board");
  await expect(emily.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible(LIVE);
  ok(await danh.from("boards").update({ name: before }).eq("id", board.id), "rename back");
  await expect(emily.getByRole("link", { name: new RegExp(before) }).first()).toBeVisible(LIVE);
});

test("a team made by someone else appears in the sidebar", async () => {
  await onBoard();
  const name = `Live team ${RUN}`;
  ok(await danh.from("teams").insert({ workspace_id: workspaceId, name }), "team");
  await expect(emily.getByRole("navigation").getByText(name)).toBeVisible(LIVE);
});

test("a notification for me raises the inbox badge without a reload", async () => {
  await onBoard();
  // The red badge: notifications that interrupt (the grey one beside it counts quiet updates).
  const badge = emily.getByRole("link", { name: /^Inbox/ }).first().getByTestId("badge-notifications");
  const count = async () => ((await badge.count()) ? Number(await badge.innerText()) : 0);
  const before = await count();
  ok(
    await service().from("notifications").insert({ user_id: ids.emily, workspace_id: workspaceId, type: "MENTION", title: `Live mention ${RUN}`, entity_type: "ITEM", entity_id: item.id, board_id: board.id, actor_id: ids.danh }),
    "notification",
  );
  await expect.poll(count, LIVE).toBe(before + 1);
});

test("a message to me arrives in the open conversation", async () => {
  await emily.goto(`/workspace/rmit/messages?to=${ids.danh}`);
  await expect(emily.getByPlaceholder(/Message Danh/)).toBeVisible({ timeout: 60_000 });
  const body = `Live hello ${RUN}`;
  ok(await danh.from("direct_messages").insert({ workspace_id: workspaceId, sender_id: ids.danh, recipient_id: ids.emily, body }), "message");
  await expect(emily.getByTestId("message-bubble").filter({ hasText: body })).toBeVisible(LIVE);
});

test("someone renaming themselves is renamed on the members page", async () => {
  await emily.goto("/workspace/rmit/members");
  await expect(emily.getByText("Danh Nguyen").first()).toBeVisible({ timeout: 60_000 });
  const before = ok(await danh.from("profiles").select("display_name, first_name").eq("id", ids.danh).single(), "profile");
  const name = `Danh Live${RUN}`;
  ok(await danh.from("profiles").update({ display_name: name }).eq("id", ids.danh), "rename self");
  await expect(emily.getByText(name).first()).toBeVisible(LIVE);
  ok(await danh.from("profiles").update({ display_name: before.display_name }).eq("id", ids.danh), "rename back");
});

test("a task put on me by someone else appears in My Work", async () => {
  await emily.goto("/workspace/rmit/my-work");
  await expect(emily.getByTestId("my-work-tab-assets").or(emily.getByRole("heading", { name: /My Work/ })).first()).toBeVisible({ timeout: 60_000 });
  const name = `Live mine ${RUN}`;
  const mine = ok(await danh.from("items").insert({ board_id: board.id, group_id: board.groupId, name, position: -2, created_by: ids.danh }).select("id").single(), "task");
  const people = ok(await danh.from("board_columns").select("id").eq("board_id", board.id).eq("type", "PERSON").order("position").limit(1).single(), "person column");
  ok(await danh.from("item_column_values").insert({ item_id: mine.id, column_id: people.id, board_id: board.id, value_json: { type: "PERSON", userIds: [ids.emily] } }), "assign");
  await expect(emily.getByText(name).first()).toBeVisible(LIVE);
});

// ---- trackers and docs -------------------------------------------------------------

test("a sheet cell typed by someone else changes in the open sheet", async () => {
  const db = service();
  const sheet = ok(await db.from("tracker_sheets").select("id, tracker_id, rows, columns").order("position").limit(1).single(), "sheet");
  await emily.goto(`/workspace/rmit/trackers/${sheet.tracker_id}?sheet=${sheet.id}`);
  await expect(emily.getByTestId("tracker-grid")).toBeVisible({ timeout: 60_000 });
  const rows = sheet.rows as Array<{ id: string; kind: string; cells: Record<string, unknown> }>;
  const columns = sheet.columns as Array<{ id: string; type: string }>;
  const text = columns.find((c) => c.type === "text")!;
  const target = rows.find((r) => r.kind === "data")!;
  const value = `Live cell ${RUN}`;
  const next = rows.map((r) => (r.id === target.id ? { ...r, cells: { ...r.cells, [text.id]: value } } : r));
  ok(await danh.from("tracker_sheets").update({ rows: next, updated_at: new Date().toISOString() }).eq("id", sheet.id), "sheet edit");
  await expect(emily.getByTestId("tracker-grid")).toContainText(value, LIVE);
});

test("a doc retitled by someone else is retitled on the open page and in the list", async () => {
  const db = service();
  const doc = ok(await db.from("docs").select("id, title").eq("workspace_id", workspaceId).eq("kind", "page").order("created_at").limit(1).maybeSingle(), "doc");
  test.skip(!doc, "no page doc in the seed");
  await emily.goto(`/workspace/rmit/docs/${doc!.id}`);
  await expect(emily.getByText(doc!.title ?? "Untitled").first()).toBeVisible({ timeout: 60_000 });
  const title = `Live doc ${RUN}`;
  ok(await danh.from("docs").update({ title, updated_at: new Date().toISOString() }).eq("id", doc!.id), "retitle");
  await expect(emily.getByText(title).first()).toBeVisible(LIVE);
  ok(await danh.from("docs").update({ title: doc!.title }).eq("id", doc!.id), "title back");
});

test("a doc made by someone else appears in the docs list, and its new title on its open page", async () => {
  await emily.goto("/workspace/rmit/docs");
  await expect(emily.getByRole("heading", { name: /Docs/ }).first()).toBeVisible({ timeout: 60_000 });
  const title = `Live doc ${RUN}`;
  const doc = ok(await danh.from("docs").insert({ workspace_id: workspaceId, title, kind: "page", created_by: ids.danh, content: { type: "doc", content: [] } }).select("id").single(), "doc");
  await expect(emily.getByText(title).first()).toBeVisible(LIVE);
  await emily.goto(`/workspace/rmit/docs/${doc.id}`);
  await expect(emily.getByText(title).first()).toBeVisible({ timeout: 60_000 });
  const renamed = `Live doc renamed ${RUN}`;
  ok(await danh.from("docs").update({ title: renamed, updated_at: new Date().toISOString() }).eq("id", doc.id), "retitle");
  await expect(emily.getByText(renamed).first()).toBeVisible(LIVE);
  await service().from("docs").delete().eq("id", doc.id);
});

test("a baseline set by someone else reaches the open Gantt", async () => {
  await emily.goto(`${boardPath()}?view=gantt`);
  const menu = emily.getByTestId("gantt-baseline");
  await expect(menu).toBeVisible({ timeout: 60_000 });
  await service().from("item_baselines").delete().eq("board_id", board.id);
  const hasBaseline = async () => {
    await menu.click();
    const found = await emily.getByTestId("gantt-baseline-clear").count();
    await emily.keyboard.press("Escape");
    return found;
  };
  await expect.poll(hasBaseline, LIVE).toBe(0);
  ok(await danh.from("item_baselines").insert({ item_id: item.id, board_id: board.id, start_date: "2026-11-01", end_date: "2026-11-30", saved_by: ids.danh }), "baseline");
  await expect.poll(hasBaseline, LIVE).toBe(1);
  await service().from("item_baselines").delete().eq("board_id", board.id);
});

test("the internal portal follows a teammate's changes to its tasks", async () => {
  await emily.goto("/workspace/rmit/internal-portal");
  await expect(emily.getByTestId("internal-portal-board")).toBeVisible({ timeout: 90_000 });
  // A task made now, so it is inside the portal's window (the last three months).
  const name = `Live portal ${RUN}`;
  const task = ok(await danh.from("items").insert({ board_id: board.id, group_id: board.groupId, name, position: -4, created_by: ids.danh }).select("id").single(), "task");
  // Throttled to one read every 15 s while busy.
  await expect(emily.getByText(name).first()).toBeVisible({ timeout: 40_000 });
  const renamed = `Live portal renamed ${RUN}`;
  ok(await danh.from("items").update({ name: renamed }).eq("id", task.id), "rename");
  await expect(emily.getByText(renamed).first()).toBeVisible({ timeout: 40_000 });
});

test("the dashboard counts a task a teammate adds", async () => {
  await emily.goto("/workspace/rmit/dashboard");
  const value = emily.getByTestId("dashboard-headline-tasks-value");
  await expect(value).toBeVisible({ timeout: 90_000 });
  const read = async () => Number((await value.innerText()).replace(/[^\d]/g, "") || "0");
  // The figure counts up when it changes; wait for it to settle before reading it.
  let last = -1;
  await expect
    .poll(
      async () => {
        const now = await read();
        const settled = now > 0 && now === last;
        last = now;
        return settled;
      },
      { timeout: 30_000, intervals: [600] },
    )
    .toBe(true);
  const before = last;
  ok(await danh.from("items").insert({ board_id: board.id, group_id: board.groupId, name: `Live counted ${RUN}`, position: -3, created_by: ids.danh }), "task");
  // The dashboard reads at most every 20 s.
  await expect.poll(read, { timeout: 45_000 }).toBe(before + 1);
});

test("an automation added and switched off by someone else shows on the open Automations page", async () => {
  await emily.goto("/workspace/rmit/automations");
  await expect(emily.getByRole("heading", { name: /Automations/ }).first()).toBeVisible({ timeout: 60_000 });
  const name = `Live rule ${RUN}`;
  const rule = ok(
    await danh.from("automation_rules").insert({ workspace_id: workspaceId, board_id: board.id, name, enabled: true, trigger_json: { kind: "item_renamed" }, actions: [], created_by: ids.danh }).select("id").single(),
    "rule",
  );
  const card = emily.getByTestId("automation-rule").filter({ hasText: name });
  await expect(card).toBeVisible(LIVE);
  await expect(card.getByTestId("automation-toggle")).toHaveAttribute("aria-checked", "true");
  ok(await danh.from("automation_rules").update({ enabled: false }).eq("id", rule.id), "switch off");
  await expect(card.getByTestId("automation-toggle")).toHaveAttribute("aria-checked", "false", LIVE);
  await service().from("automation_rules").delete().eq("id", rule.id);
});

test("someone added to a team by someone else appears on the open team page", async () => {
  const team = ok(await danh.from("teams").insert({ workspace_id: workspaceId, name: `Live team page ${RUN}` }).select("id").single(), "team");
  await emily.goto(`/workspace/rmit/teams/${team.id}`);
  await expect(emily.getByText(`Live team page ${RUN}`).first()).toBeVisible({ timeout: 60_000 });
  ok(await danh.from("team_members").insert({ team_id: team.id, user_id: ids.tuyet, role: "MEMBER" }), "add to team");
  await expect(emily.getByTestId("team-members-list").getByText(/Tuyet/)).toBeVisible(LIVE);
});

test("a role changed by someone else changes on the open members page", async () => {
  await emily.goto("/workspace/rmit/members");
  const tuyet = emily.getByTestId("member-row").filter({ hasText: "tuyet@rmit.local" });
  await expect(tuyet).toBeVisible({ timeout: 60_000 });
  await expect(tuyet).toContainText(/Member/);
  const db = service();
  ok(await db.from("workspace_members").update({ role: "GUEST" }).eq("workspace_id", workspaceId).eq("user_id", ids.tuyet), "make guest");
  try {
    await expect(tuyet).toContainText(/Guest/, LIVE);
  } finally {
    await db.from("workspace_members").update({ role: "MEMBER" }).eq("workspace_id", workspaceId).eq("user_id", ids.tuyet);
  }
});

test("a change made the moment the board opens is not lost while the page connects", async () => {
  await emily.goto("/workspace/rmit");
  const name = `Live at open ${RUN}`;
  // The board starts loading; the change lands while it is reading and joining its channel.
  const opening = emily.goto(boardPath());
  await new Promise((resolve) => setTimeout(resolve, 300));
  ok(await danh.from("items").insert({ board_id: board.id, group_id: board.groupId, name, position: -5, created_by: ids.danh }), "add while opening");
  await opening;
  await expect(row(name)).toBeVisible(LIVE);
});
