import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The receipt's task link on a real database (v0.169.0): given when the form
 * says so, the same for the life of the task, opened with no session through
 * the server's check, still open once allocated and archived, refused when
 * tampered with, and closed while the form has it off. Local stack only.
 */
const PROVIDER = process.env.E2E_PROVIDER ?? process.env.PW_PROVIDER ?? "local";
test.skip(PROVIDER !== "supabase", "Supabase only");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^['"]|['"]$/g, "")]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (PROVIDER === "supabase" && !URL_.includes("127.0.0.1")) throw new Error("Refusing: this spec writes to the database and runs only against the local stack");
const RUN = Date.now().toString(36).slice(-5);
const service = (): SupabaseClient => createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test("the receipt's task link: same link for the task's life, archived included, closed when switched off", async ({ page, request }) => {
  test.setTimeout(240_000);
  const db = service();
  const workspace = (await db.from("workspaces").select("id, booking_key, booking_form").eq("slug", "contents").single()).data!;
  const department = (await db.from("stakeholder_departments").select("name").eq("workspace_id", workspace.id).eq("status", "ACTIVE").limit(1).single()).data!.name as string;
  const form = await (await request.get(`/api/book/contents?key=${workspace.booking_key}`)).json();
  const setLink = async (on: boolean) => {
    const template = structuredClone(form.template);
    template.review.shareTaskLink = on;
    const r = await db.from("workspaces").update({ booking_form: template }).eq("id", workspace.id);
    if (r.error) throw new Error(r.error.message);
  };
  let itemId = "";
  try {
    await setLink(true);
    const booked = await request.post("/api/book/contents", {
      data: {
        key: workspace.booking_key,
        request: {
          requesterName: "Link Test", requesterEmail: `link.${RUN}@example.com`, department, title: `TASKLINK ${RUN}`, brief: "", assetTypes: [], assets: [],
          serviceTypeId: "svc-design", subServices: [], teamId: null, dueDate: "2026-12-01", priority: "High", referenceUrl: null,
          answers: { "design-what": { kind: "text", text: "x" }, "design-specs": { kind: "text", text: "x" }, "design-copy": { kind: "choice", values: ["Yes, final and approved"] } },
        },
      },
    });
    expect(booked.status(), await booked.text()).toBe(201);
    const receipt = await booked.json();
    itemId = receipt.itemId;
    expect(receipt.taskLink).toMatch(/^\/contents\/booking\/t\/[0-9a-f-]{36}\.[0-9a-f]{40}$/);
    const token = receipt.taskLink.split("/booking/t/")[1] as string;
    const open = () => request.get(`/api/booking-link/${token}`);

    // Opens with no session.
    const first = await open();
    expect(first.status(), await first.text()).toBe(200);
    expect((await first.json()).itemId).toBe(itemId);

    // Where else it opens: no board for nobody; the board for a member who can see it.
    const openings = (jwt?: string) => request.get(`/api/booking-link/${token}/openings`, jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : {});
    expect((await (await openings()).json()).board).toBeNull();
    const signedIn = await createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } }).auth.signInWithPassword({ email: "admin@rmit.local", password: "admin123" });
    const jwt = signedIn.data.session!.access_token;
    expect((await (await openings(jwt)).json()).board).toBe(`/workspace/contents/boards/task-allocation?item=${itemId}`);
    expect((await request.get(`/api/booking-link/${itemId}.${"0".repeat(40)}/openings`)).status()).toBe(404);

    // Tampered: another signature, or this signature on another id.
    expect((await request.get(`/api/booking-link/${itemId}.${"0".repeat(40)}`)).status()).toBe(404);
    expect((await request.get(`/api/booking-link/${"11111111-1111-4111-8111-111111111111"}.${token.split(".")[1]}`)).status()).toBe(404);
    expect((await request.get("/api/booking-link/nonsense")).status()).toBe(404);

    // The page itself, as the requester sees it.
    await page.goto(receipt.taskLink);
    await expect(page.getByTestId("task-link-page")).toContainText(`TASKLINK ${RUN}`, { timeout: 60_000 });

    // Allocated to a team's board, then archived: the same link still opens it.
    const target = (await db.from("boards").select("id").eq("workspace_id", workspace.id).is("system", null).is("archived_at", null).limit(1).single()).data!;
    const group = (await db.from("board_groups").select("id").eq("board_id", target.id).order("position").limit(1).single()).data!;
    await db.from("items").update({ board_id: target.id, group_id: group.id }).eq("id", itemId);
    expect((await open()).status()).toBe(200);
    await db.from("items").update({ archived_at: new Date().toISOString() }).eq("id", itemId);
    const archived = await open();
    expect(archived.status(), await archived.text()).toBe(200);
    expect((await archived.json()).itemId).toBe(itemId);
    expect((await (await openings(jwt)).json()).board).toMatch(/\/archive\?item=[0-9a-f-]{36}$/);

    // Switched off: closed. Back on: the same link opens again.
    await setLink(false);
    const off = await open();
    expect(off.status()).toBe(404);
    expect(((await off.json()).reason)).toBe("off");
    await setLink(true);
    expect((await open()).status()).toBe(200);
  } finally {
    await db.from("workspaces").update({ booking_form: workspace.booking_form }).eq("id", workspace.id);
    if (itemId) await db.from("items").delete().eq("id", itemId);
  }
});
