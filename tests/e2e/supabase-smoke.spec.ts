import { expect, test, type Page } from "@playwright/test";
import { row } from "./helpers";

/**
 * End-to-end audit of the Supabase provider: every flow that writes through a
 * repository, so an RLS gap or a bad column mapping fails here rather than in
 * someone's face.
 *
 * Runs only against a Supabase-backed app (`E2E_PROVIDER=supabase`), because it
 * signs in with a password and shares one database with everyone else. It cleans
 * up the rows it creates.
 *
 *   npm run test:e2e:supabase
 */
const PROVIDER = process.env.E2E_PROVIDER ?? "local";
const ADMIN_EMAIL = process.env.E2E_EMAIL ?? "admin@rmit.local";
const ADMIN_PASSWORD = process.env.E2E_PASSWORD ?? "admin123";
const BOARD = "/workspace/rmit/boards/rmitinerary-2026";
/** Unique per run so a failed run never collides with the next one. */
const RUN = `smoke-${Date.now().toString(36)}`;
/** Fixed seed ids (src/data/seed/seed-data.ts). */
const EMILY_ID = "00000001-0000-4000-8000-000000000002";
const ADMIN_ID = "00000001-0000-4000-8000-000000000019";

test.skip(PROVIDER !== "supabase", "Supabase audit; set E2E_PROVIDER=supabase to run");
test.describe.configure({ mode: "serial" });

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/workspace\/rmit$/, { timeout: 30_000 });
}

/**
 * Runs `act` and waits for the PostgREST call it triggers, so a test never races
 * an optimistic update: the assertion is that the row reached Postgres.
 */
async function expectWrite(page: Page, table: string, method: "POST" | "PATCH" | "DELETE", act: () => Promise<void>): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/rest/v1/${table}`) && r.request().method() === method, { timeout: 30_000 }),
    act(),
  ]);
  expect(response.ok(), `${method} ${table} → ${response.status()} ${await response.text().catch(() => "")}`).toBeTruthy();
}

/**
 * Clicks through a confirmation. The dialog animates in, so the click waits for
 * it to settle, and the dialog closing is the proof that onConfirm actually ran.
 */
async function confirm(page: Page): Promise<void> {
  const dialog = page.getByTestId("confirm-dialog");
  const action = page.getByTestId("confirm-action");
  await expect(action).toBeVisible({ timeout: 10_000 });
  await expect(action).toBeEnabled();
  // The dialog animates in from a menu that is animating out; the first click can
  // land while neither owns the pointer, so retry until the dialog acknowledges it.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.waitForTimeout(250);
    if ((await dialog.count()) === 0) return;
    await action.click({ timeout: 5000 }).catch(() => undefined);
    if (await dialog.waitFor({ state: "detached", timeout: 5000 }).then(() => true).catch(() => false)) return;
  }
  throw new Error("the confirmation dialog never closed");
}

/**
 * Fails the test on any error the app logs. Repository failures are reported by
 * useBoardMutations as `[board] …` with the error as a second argument, which
 * console text renders as a handle — so the arguments are resolved too, and
 * printed, because a swallowed write error is exactly what this suite hunts.
 */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  const record = (text: string) => {
    errors.push(text);
    console.log(`APP ERROR: ${text}`);
  };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!/\[board\]|\[data\]|\[tracker\]|SupabaseQueryError|row-level security|violates|permission denied|Could not/i.test(text)) return;
    void Promise.all(message.args().map((a) => a.jsonValue().catch(() => null)))
      .then((values) => {
        const detail = values
          .map((v) => (typeof v === "string" ? v : v && typeof v === "object" ? ((v as { message?: string }).message ?? JSON.stringify(v)) : ""))
          .filter(Boolean)
          .join(" | ");
        record(detail || text);
      })
      .catch(() => record(text));
  });
  page.on("pageerror", (error) => record(`pageerror: ${error.message}`));
  return errors;
}

test.describe("supabase provider", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("reads the seeded workspace", async ({ page }) => {
    const errors = watchForErrors(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Admin");
    // Sidebar teams come from Postgres.
    await expect(page.locator("aside").getByRole("link", { name: "Vietnam Creative", exact: true })).toBeVisible();
    await page.goto(BOARD);
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("item-row").first()).toBeVisible();
    await expect(page.getByTestId("group-Design")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("creates, renames and deletes an item", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(BOARD);
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });

    const name = `${RUN} item`;
    const input = page.getByTestId("add-item-Design");
    await input.fill(name);
    await expectWrite(page, "items", "POST", async () => {
      await input.press("Enter");
    });

    // Reload before touching it again: the row has to be in the database, and
    // the reloaded page holds the stored id rather than the optimistic one.
    await page.reload();
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });
    const created = row(page, name);
    await expect(created).toBeVisible({ timeout: 20_000 });

    await created.getByTestId("item-name").dblclick();
    const rename = page.getByLabel("Item name");
    await rename.fill(`${RUN} renamed`);
    await expectWrite(page, "items", "PATCH", async () => {
      await rename.press("Enter");
    });
    const renamed = row(page, `${RUN} renamed`);
    await expect(renamed).toBeVisible({ timeout: 20_000 });

    // Delete it again: cleanup, and it exercises the cascade.
    await renamed.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    // The DELETE has to reach Postgres, not just the cache.
    const [deleted] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/rest/v1/items") && r.request().method() === "DELETE", { timeout: 30_000 }),
      confirm(page),
    ]);
    expect(deleted.ok()).toBeTruthy();
    await expect(renamed).toHaveCount(0, { timeout: 20_000 });
    await page.reload();
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });
    await expect(renamed).toHaveCount(0, { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("writes every column type", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(BOARD);
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });
    const item = row(page, "RMITinerary Explorer");

    // Each write flips to a value the cell does not already hold, so the test is
    // idempotent however the previous run left the board.
    const status = item.getByTestId("status-cell");
    const statusNow = (await status.textContent()) ?? "";
    const nextStatus = statusNow.includes("Done") ? "Stuck" : "Done";
    await status.click();
    await expectWrite(page, "item_column_values", "POST", async () => {
      await page.getByRole("option", { name: nextStatus }).click();
    });
    await expect(status).toContainText(nextStatus, { timeout: 20_000 });

    const priority = item.getByTestId("priority-cell");
    const priorityNow = (await priority.textContent()) ?? "";
    const nextPriority = priorityNow.includes("Low") ? "High" : "Low";
    await priority.click();
    await expectWrite(page, "item_column_values", "POST", async () => {
      await page.getByRole("option", { name: nextPriority }).click();
    });
    await expect(priority).toContainText(nextPriority, { timeout: 20_000 });

    // Person → toggling Duc notifies or un-notifies him; either way the label changes.
    const person = item.getByTestId("person-cell");
    const peopleBefore = (await person.getAttribute("aria-label")) ?? "";
    await person.click();
    const picker = page.getByTestId("person-picker");
    await picker.getByPlaceholder("Search people…").fill("Duc");
    await expectWrite(page, "item_column_values", "POST", async () => {
      await picker.getByText("Duc Tran").click();
    });
    await page.keyboard.press("Escape");
    await expect(person).not.toHaveAttribute("aria-label", peopleBefore, { timeout: 20_000 });

    // Date.
    await item.getByTestId("date-cell").click();
    await page.getByRole("button", { name: "Tomorrow" }).click();
    await page.keyboard.press("Escape");

    await page.reload();
    await expect(row(page, "RMITinerary Explorer").getByTestId("status-cell")).toContainText(nextStatus, { timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test("comments on an item", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(BOARD);
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });
    await row(page, "Cover concept – final artwork").getByTestId("item-name").click();
    const panel = page.getByTestId("item-panel");
    await expect(panel).toBeVisible();
    await panel.getByRole("tab", { name: /Updates/ }).click();
    const body = `${RUN} comment`;
    await page.getByTestId("comment-input").fill(body);
    await expectWrite(page, "comments", "POST", async () => {
      await page.getByTestId("comment-submit").click();
    });
    await expect(panel.getByTestId("comment").filter({ hasText: body })).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await page.getByTestId("item-panel").getByRole("tab", { name: /Updates/ }).click();
    await expect(page.getByText(body)).toBeVisible({ timeout: 30_000 });

    // Remove it again: exercises the delete path and leaves the board as found.
    const posted = page.getByTestId("comment").filter({ hasText: body });
    await posted.hover();
    await expectWrite(page, "comments", "DELETE", async () => {
      await posted.getByRole("button", { name: "Delete update" }).click();
    });
    await expect(posted).toHaveCount(0, { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("favourites a board", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(BOARD);
    const star = page.getByTestId("favourite-toggle");
    await expect(star).toBeVisible({ timeout: 30_000 });
    const pressed = await star.getAttribute("aria-pressed");
    await expectWrite(page, "board_favourites", pressed === "true" ? "DELETE" : "POST", async () => {
      await star.click();
    });
    await expect(star).toHaveAttribute("aria-pressed", pressed === "true" ? "false" : "true", { timeout: 20_000 });
    // Put it back.
    await expectWrite(page, "board_favourites", pressed === "true" ? "POST" : "DELETE", async () => {
      await star.click();
    });
    await expect(star).toHaveAttribute("aria-pressed", pressed ?? "false", { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("adds and removes a group and a column", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(BOARD);
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });

    // Groups
    await expectWrite(page, "board_groups", "POST", async () => {
      await page.getByTestId("add-group").click();
    });
    const group = page.getByTestId("group-New group").last();
    await expect(group).toBeVisible({ timeout: 20_000 });
    await group.hover();
    await group.getByRole("button", { name: /Options for New group/ }).click();
    const groupMenu = page.getByRole("menu");
    await expect(groupMenu).toBeVisible({ timeout: 10_000 });
    await groupMenu.getByRole("menuitem", { name: "Delete group", exact: true }).click();
    // Asserted at the HTTP level: the confirmation animates in from a menu that
    // is animating out, so the click needs retries, and the DELETE reaching
    // Postgres is the thing being audited.
    const [groupDeleted] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/rest/v1/board_groups") && r.request().method() === "DELETE", { timeout: 30_000 }),
      confirm(page),
    ]);
    expect(groupDeleted.ok()).toBeTruthy();

    // Columns
    await page.getByTestId("add-column").first().click();
    const addColumnMenu = page.getByRole("menu");
    await expect(addColumnMenu).toBeVisible({ timeout: 10_000 });
    await expectWrite(page, "board_columns", "POST", async () => {
      await addColumnMenu.getByRole("menuitem", { name: "Number", exact: true }).click();
    });
    const headerMenu = page.getByRole("button", { name: "Number column options", exact: true }).first();
    await expect(headerMenu).toBeVisible({ timeout: 20_000 });
    await headerMenu.click();
    const columnMenu = page.getByRole("menu");
    await expect(columnMenu).toBeVisible({ timeout: 10_000 });
    await columnMenu.getByRole("menuitem", { name: "Delete column", exact: true }).click();
    const [columnDeleted] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/rest/v1/board_columns") && r.request().method() === "DELETE", { timeout: 30_000 }),
      confirm(page),
    ]);
    expect(columnDeleted.ok()).toBeTruthy();

    // Both are gone once the board reloads from the database.
    await page.reload();
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Number column options", exact: true })).toHaveCount(0, { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("opens every board view", async ({ page }) => {
    const errors = watchForErrors(page);
    for (const [view, testid] of [
      ["kanban", "kanban"],
      ["timeline", "timeline"],
      ["calendar", "calendar"],
      ["files", "files-view"],
    ] as const) {
      await page.goto(`${BOARD}?view=${view}`);
      await expect(page.getByTestId(testid)).toBeVisible({ timeout: 30_000 });
    }
    expect(errors).toEqual([]);
  });

  test("reads the other pages", async ({ page }) => {
    const errors = watchForErrors(page);
    for (const [path, heading] of [
      ["/workspace/rmit/my-work", "My Work"],
      ["/workspace/rmit/inbox", "Inbox"],
      ["/workspace/rmit/trackers", "Trackers"],
      ["/workspace/rmit/members", "Members"],
      ["/workspace/rmit/settings", "Workspace settings"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading, { timeout: 30_000 });
    }
    // Settings → Data explains that the database owns the data now.
    await page.getByRole("button", { name: "Data", exact: true }).click();
    await expect(page.getByText(/Managed by the database/)).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("opens a tracker sheet", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/workspace/rmit/trackers");
    await page.getByRole("link").filter({ hasText: "Asset Tracker" }).first().click();
    await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test("searches across the workspace", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(BOARD);
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Control+f");
    await page.getByPlaceholder(/Search/).first().fill("Explorer");
    await expect(page.getByText("RMITinerary Explorer").first()).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("opens a person's profile from the members list", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/workspace/rmit/members");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Members", { timeout: 30_000 });

    await page.getByTestId("member-profile-link").filter({ hasText: "Emily Carter" }).click();
    await expect(page.getByTestId("profile-name")).toHaveText("Emily Carter", { timeout: 30_000 });
    // Contact details, and the three things a profile is for.
    await expect(page.getByText("emily@rmit.local")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Teams/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Boards/ })).toBeVisible();
    await expect(page.getByTestId("profile-task").first()).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("edits contact details on a profile", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(`/workspace/rmit/people/${EMILY_ID}`);
    await expect(page.getByTestId("profile-name")).toBeVisible({ timeout: 30_000 });

    const title = `Creative Lead ${RUN}`;
    await page.getByTestId("profile-edit").click();
    await expect(page.getByTestId("edit-profile-dialog")).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("Job title").fill(title);
    await expectWrite(page, "profiles", "PATCH", async () => {
      await page.getByTestId("profile-save").click();
    });
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

    // Stored, not just cached.
    await page.reload();
    await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });

    // Put it back.
    await page.getByTestId("profile-edit").click();
    await page.getByLabel("Job title").fill("Creative Lead");
    await expectWrite(page, "profiles", "PATCH", async () => {
      await page.getByTestId("profile-save").click();
    });
    expect(errors).toEqual([]);
  });

  test("converts an uploaded avatar to WebP and stores it", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(`/workspace/rmit/people/${ADMIN_ID}`);
    await expect(page.getByTestId("profile-name")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("profile-edit").click();
    await expect(page.getByTestId("edit-profile-dialog")).toBeVisible({ timeout: 10_000 });

    // A real 512x512 PNG drawn in the page, so the test covers the downscale to
    // 256 and the WebP re-encode, not just the upload call.
    const [upload] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/storage/v1/object/") && r.method() !== "GET", { timeout: 30_000 }),
      page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#e61e2b";
        context.fillRect(0, 0, 512, 512);
        context.fillStyle = "#ffffff";
        context.fillRect(128, 128, 256, 256);
        const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        const input = document.querySelector('[data-testid="avatar-input"]') as HTMLInputElement;
        const transfer = new DataTransfer();
        transfer.items.add(new File([png!], "avatar.png", { type: "image/png" }));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }),
    ]);
    // Stored in the avatars bucket, as a .webp file, and small: the source PNG is
    // 512x512 while what leaves the browser is a 256px WebP.
    expect(upload.url()).toContain("avatars");
    expect(upload.url()).toContain("avatar.webp");
    expect(upload.postDataBuffer()?.byteLength ?? 0).toBeLessThan(30_000);

    // The profile now points at the stored WebP.
    const avatar = page.getByTestId("edit-profile-dialog").locator("img").first();
    await expect(avatar).toHaveAttribute("src", /\.webp/, { timeout: 30_000 });

    // Clean up so the demo workspace looks untouched.
    await page.getByRole("button", { name: "Remove photo" }).click();
    await expect(page.getByTestId("edit-profile-dialog").locator("img")).toHaveCount(0, { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("sends a direct message and reads it back", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(`/workspace/rmit/messages?to=${EMILY_ID}`);
    await expect(page.getByTestId("message-thread")).toBeVisible({ timeout: 30_000 });

    const body = `${RUN} direct message`;
    await page.getByTestId("message-input").fill(body);
    await expectWrite(page, "direct_messages", "POST", async () => {
      await page.getByTestId("message-send").click();
    });
    await expect(page.getByTestId("message-bubble").filter({ hasText: body })).toBeVisible({ timeout: 20_000 });

    // In the database, not just the cache.
    await page.reload();
    await expect(page.getByTestId("message-bubble").filter({ hasText: body })).toBeVisible({ timeout: 30_000 });

    // The conversation is now at the top of the people list.
    await expect(page.getByTestId("message-person").first()).toContainText("Emily Carter");

    // Unsend it, which also leaves the workspace as it was found.
    await page.getByTestId("message-bubble").filter({ hasText: body }).hover();
    await expectWrite(page, "direct_messages", "DELETE", async () => {
      await page.getByRole("button", { name: "Delete message" }).last().click();
    });
    await expect(page.getByTestId("message-bubble").filter({ hasText: body })).toHaveCount(0, { timeout: 20_000 });
    expect(errors).toEqual([]);
  });
});
