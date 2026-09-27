import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Several workspaces, live, against the DISPOSABLE Supabase stack: two people
 * signed in at once, changes made by one arriving on the other's screen, and
 * nothing from one workspace ever arriving on another's.
 *
 *   E2E_PROVIDER=supabase PW_PROVIDER=supabase SKIP_DB_MIGRATE=1 npx playwright test tests/e2e/multi-workspace-live.spec.ts
 */

const PROVIDER = process.env.E2E_PROVIDER ?? process.env.PW_PROVIDER ?? "local";
test.skip(PROVIDER !== "supabase", "Supabase only");
test.describe.configure({ mode: "serial" });

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (PROVIDER === "supabase" && !URL_.includes("127.0.0.1")) throw new Error("Refusing: this spec writes to the database and runs only against the local stack");

const PASSWORD = "Password123!";
const B_SLUG = "live-b";
const service = (): SupabaseClient => createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function as(email: string, password = PASSWORD): Promise<SupabaseClient> {
  const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

async function signedIn(browser: Browser, email: string, password = PASSWORD): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 30_000 });
  return page;
}

let bId = "";
let bBoard = { id: "", slug: "", itemId: "" };
let aBoard = { id: "", slug: "", itemId: "", name: "" };
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  const db = service();
  const { data: people } = await db.from("profiles").select("id, email");
  for (const p of people ?? []) ids[p.email.split("@")[0]] = p.id;
  await db.from("workspaces").delete().eq("slug", B_SLUG);
  const { data: ws, error } = await db.from("workspaces").insert({ name: "Live B", slug: B_SLUG }).select("id").single();
  if (error) throw error;
  bId = ws.id;
  await db.from("workspace_members").insert({ workspace_id: bId, user_id: ids.emily, role: "ADMIN", status: "ACTIVE" });
  const { data: board } = await db.from("boards").insert({ workspace_id: bId, name: "B live board", slug: "b-live-board", owner_id: ids.danh, visibility: "WORKSPACE" }).select("id, slug").single();
  const { data: group } = await db.from("board_groups").insert({ board_id: board!.id, name: "Work", position: 0 }).select("id").single();
  const { data: item } = await db.from("items").insert({ board_id: board!.id, group_id: group!.id, name: "Only in B", position: 0, created_by: ids.danh }).select("id").single();
  bBoard = { id: board!.id, slug: board!.slug, itemId: item!.id };
  const { data: rmit } = await db.from("workspaces").select("id").eq("slug", "rmit").single();
  const { data: boardsA } = await db.from("boards").select("id, slug").eq("workspace_id", rmit!.id).is("system", null).is("archived_at", null).order("created_at").limit(1);
  const { data: itemA } = await db.from("items").select("id, name").eq("board_id", boardsA![0]!.id).is("parent_item_id", null).is("archived_at", null).order("position").limit(1);
  aBoard = { id: boardsA![0]!.id, slug: boardsA![0]!.slug, itemId: itemA![0]!.id, name: itemA![0]!.name };
});

test.afterAll(async () => {
  const db = service();
  if (aBoard.itemId) await db.from("items").update({ name: aBoard.name }).eq("id", aBoard.itemId);
  await db.from("workspace_snapshots").delete().like("name", "Before deleting “Live B”%");
  await db.from("workspaces").delete().eq("slug", B_SLUG);
});

test("a rename on a board reaches the other person's open board, live", async ({ browser }) => {
  const danh = await signedIn(browser, "danh@rmit.local");
  await danh.goto(`/workspace/rmit/boards/${aBoard.slug}`);
  await expect(danh.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });
  const emily = await as("emily@rmit.local");
  const renamed = `${aBoard.name} (live)`;
  const { error } = await emily.from("items").update({ name: renamed }).eq("id", aBoard.itemId);
  expect(error).toBeNull();
  await expect(danh.getByText(renamed, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await danh.context().close();
});

test("nothing done in workspace B arrives on a screen in A", async ({ browser }) => {
  const danh = await signedIn(browser, "danh@rmit.local");
  await danh.goto(`/workspace/rmit/boards/${aBoard.slug}`);
  await expect(danh.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });
  const errors: string[] = [];
  danh.on("pageerror", (e) => errors.push(e.message));
  const emily = await as("emily@rmit.local");
  await emily.from("items").update({ name: "Renamed in B" }).eq("id", bBoard.itemId);
  await danh.waitForTimeout(4_000);
  await expect(danh.getByText("Renamed in B")).toHaveCount(0);
  await expect(danh.getByText("Only in B")).toHaveCount(0);
  expect(errors).toEqual([]);
  // B's board is B's: switching there shows it, with the change.
  await danh.goto(`/workspace/${B_SLUG}/boards/${bBoard.slug}`);
  await expect(danh.getByText("Renamed in B", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  // And A's board is not reachable under B's address.
  await danh.goto(`/workspace/${B_SLUG}/boards/${aBoard.slug}`);
  await expect(danh.getByTestId("board-table")).toHaveCount(0);
  await danh.context().close();
});

test("a notification in B stays out of A's inbox, and the switcher says it is there", async ({ browser }) => {
  const db = service();
  await db.from("notifications").insert({ user_id: ids.danh, type: "COMMENT", delivery: "NOTIFICATION", title: "Waiting in Live B", entity_type: "BOARD", entity_id: bBoard.id, board_id: bBoard.id });
  const danh = await signedIn(browser, "danh@rmit.local");
  await danh.goto("/workspace/rmit/inbox");
  await expect(danh.getByRole("heading", { level: 1 })).toContainText("Inbox", { timeout: 30_000 });
  await danh.waitForTimeout(1_500);
  await expect(danh.getByText("Waiting in Live B")).toHaveCount(0);
  await danh.getByTestId("user-menu").click();
  await danh.getByTestId("menu-workspace").click();
  const option = danh.getByTestId("menu-workspace-option").filter({ hasText: "Live B" });
  await expect(option.getByTestId("menu-workspace-unread")).toHaveText("1");
  await option.click();
  await expect(danh).toHaveURL(new RegExp(`/workspace/${B_SLUG}$`), { timeout: 30_000 });
  await danh.goto(`/workspace/${B_SLUG}/inbox`);
  await expect(danh.getByText("Waiting in Live B").first()).toBeVisible({ timeout: 30_000 });
  await danh.context().close();
});

test("somebody with no seat in B cannot open it, and an admin of B runs only B", async ({ browser }) => {
  const jun = await signedIn(browser, "jun@rmit.local");
  await jun.goto(`/workspace/${B_SLUG}`);
  await expect(jun.getByText(/Workspace not found|You do not have access/)).toBeVisible({ timeout: 30_000 });
  await jun.context().close();

  const emily = await signedIn(browser, "emily@rmit.local");
  await emily.goto(`/workspace/${B_SLUG}/members`);
  await expect(emily.getByRole("heading", { level: 1 })).toContainText("Members", { timeout: 30_000 });
  // Owners are in B without being added; their rows carry no actions for an admin.
  const danhRow = emily.locator("tr, li").filter({ hasText: "danh@rmit.local" }).first();
  await expect(danhRow).toBeVisible();
  await expect(danhRow.getByRole("button", { name: /Actions for Danh/ })).toHaveCount(0);
  await emily.goto(`/workspace/${B_SLUG}/settings?section=workspaces`);
  await expect(emily.getByTestId("workspaces-list")).toHaveCount(0);
  await emily.context().close();
});
