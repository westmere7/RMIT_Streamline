// Multi-workspace server routes, end to end, against the DISPOSABLE local
// stack and the worktree's dev server on :3300. Refuses anything but 127.0.0.1.
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
for (const key of ["SUPABASE_DB_URL", "NEXT_PUBLIC_SUPABASE_URL"]) if (!env[key]?.includes("127.0.0.1")) throw new Error(`Refusing: ${key} is not the local stack`);
const APP = "http://localhost:3300";
const sql = postgres(env.SUPABASE_DB_URL, { max: 1, onnotice: () => {} });
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const results = [];
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
};

async function signIn(email, password) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return { client, token: data.session.access_token, id: data.user.id };
}
async function call(who, method, path, body) {
  const res = await fetch(`${APP}${path}`, { method, headers: { "Content-Type": "application/json", ...(who ? { Authorization: `Bearer ${who.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

const NEW_EMAIL = "mw.new@rmit.local";
const B_SLUG = "mw-test-b";

// ---- clean slate --------------------------------------------------------------
await sql`delete from workspaces where slug = ${B_SLUG}`.catch(() => {});
const stale = await sql`select id from profiles where email = ${NEW_EMAIL}`;
for (const row of stale) await service.auth.admin.deleteUser(row.id);
const [ws] = await sql`select id from workspaces order by created_at limit 1`;
const A = ws.id;

const danh = await signIn("danh@rmit.local", "Password123!");
const emily = await signIn("emily@rmit.local", "Password123!");
const jun = await signIn("jun@rmit.local", "Password123!");

// ---- an Owner creates B --------------------------------------------------------
{
  const { error } = await danh.client.from("workspaces").insert({ name: "MW Test B", slug: B_SLUG });
  check("An Owner creates a workspace through PostgREST", !error, error?.message);
  const { error: refused } = await emily.client.from("workspaces").insert({ name: "Nope", slug: "mw-nope" });
  check("An admin cannot", !!refused, refused?.message?.slice(0, 50));
}
const [b] = await sql`select id from workspaces where slug = ${B_SLUG}`;
const B = b.id;
const seats = await sql`select p.email, m.role from workspace_members m join profiles p on p.id = m.user_id where m.workspace_id = ${B}`;
check("B starts with the Owners, and only them", seats.length === 2 && seats.every((s) => s.role === "OWNER"), seats.map((s) => s.email).join(","));

// ---- adding people -------------------------------------------------------------
let r = await call(emily, "POST", "/api/invitations", { workspaceId: B, email: "ben@rmit.local", firstName: "Ben", lastName: "Walker", role: "MEMBER", teamIds: [] });
check("An admin of A cannot add people to B", r.status === 403, `${r.status} ${r.body?.error ?? ""}`);
r = await call(danh, "POST", "/api/invitations", { workspaceId: B, email: "jun@rmit.local", firstName: "Jun", lastName: "Tanaka", role: "MEMBER", teamIds: [] });
check("An existing person is let into B at once, with no link", r.status === 201 && r.body?.invitation === null && r.body?.member?.status === "ACTIVE", `${r.status} ${JSON.stringify(r.body)?.slice(0, 120)}`);
r = await call(danh, "POST", "/api/invitations", { workspaceId: B, email: "anh@rmit.local", firstName: "Anh", lastName: "Pham", role: "MEMBER", teamIds: [] });
check("Somebody pending in A is refused in B until they finish", r.status === 409 && /not finished joining/.test(r.body?.error ?? ""), `${r.status} ${r.body?.error ?? ""}`);
r = await call(danh, "POST", "/api/invitations", { workspaceId: B, email: NEW_EMAIL, firstName: "New", lastName: "Person", role: "OWNER", teamIds: [] });
check("Nobody is invited as Owner", r.status === 400 || r.status === 422, `${r.status}`);
r = await call(danh, "POST", "/api/invitations", { workspaceId: B, email: NEW_EMAIL, firstName: "New", lastName: "Person", role: "MEMBER", teamIds: [] });
const token = r.body?.invitation?.token;
check("A brand-new person gets a link", r.status === 201 && !!token, `${r.status}`);
r = await call(null, "POST", `/api/join/${token}`, { password: "a long enough password", firstName: "New", lastName: "Person", jobTitle: null });
check("They finish joining on it", r.status === 200, `${r.status} ${r.body?.error ?? ""}`);
const newbie = await signIn(NEW_EMAIL, "a long enough password");
{
  const { data } = await newbie.client.from("workspaces").select("slug");
  check("They see B and nothing else", data?.length === 1 && data[0].slug === B_SLUG, data?.map((w) => w.slug).join(","));
  const { count } = await newbie.client.from("profiles").select("id", { count: "exact", head: true });
  const [{ n }] = await sql`select count(*)::int as n from profiles`;
  check("They read the whole directory", count === n, `${count}/${n}`);
  const { data: boardsA } = await newbie.client.from("boards").select("id").eq("workspace_id", A);
  check("They read none of A's boards", (boardsA ?? []).length === 0, `${boardsA?.length}`);
}

// ---- a private share link of A -------------------------------------------------
{
  const [board] = await sql`select id from boards where workspace_id = ${A} and system is null order by created_at limit 1`;
  const shareToken = "mwprivatecheck0000000001";
  await sql`delete from board_shares where board_id = ${board.id}`;
  await sql`insert into board_shares (board_id, token, access, created_by) values (${board.id}, ${shareToken}, 'PRIVATE', ${danh.id})`;
  const asJun = await call(jun, "POST", `/api/share/${shareToken}`, {});
  check("A's private link opens for a member of A", asJun.status === 200, `${asJun.status} ${asJun.body?.error ?? ""}`);
  const asNewbie = await call(newbie, "POST", `/api/share/${shareToken}`, {});
  check("It does not open for a member of B only", asNewbie.status === 401, `${asNewbie.status}`);
  await sql`delete from board_shares where board_id = ${board.id}`;
}

// ---- departments, shared -------------------------------------------------------
{
  const listRows = await sql`select name, color from workspace_lists where workspace_id = ${A} and list_key = 'STAKEHOLDER_GROUPS' order by position`;
  const options = listRows.length ? listRows.map((row) => ({ name: row.name, color: row.color })) : [{ name: "Comm.", color: "blue" }, { name: "Event", color: "orange" }];
  r = await call(jun, "POST", `/api/departments/${A}`, { action: "save", options, renames: {} });
  check("A member cannot change departments", r.status === 403, `${r.status}`);
  r = await call(emily, "POST", `/api/departments/${A}`, { action: "save", options, renames: {} });
  check("An admin of A saves the departments", r.status === 200, `${r.status} ${r.body?.error ?? ""}`);
  const inB = await sql`select name from stakeholder_departments where workspace_id = ${B} and status = 'ACTIVE' order by position`;
  check("…and B has the same departments", inB.map((d) => d.name).join("|") === options.map((o) => o.name).join("|"), inB.map((d) => d.name).join("|"));

  // A task in B labelled with the first department.
  const first = options[0].name;
  const [board] = await sql`insert into boards (workspace_id, name, slug, owner_id, visibility) values (${B}, 'Dept board', 'dept-board', ${danh.id}, 'WORKSPACE') returning id`;
  const [group] = await sql`insert into board_groups (board_id, name, position) values (${board.id}, 'G', 0) returning id`;
  const [column] = await sql`insert into board_columns (board_id, name, type, settings, position) values (${board.id}, 'Department', 'STAKEHOLDER', '{"kind":"none"}'::jsonb, 0) returning id`;
  const [item] = await sql`insert into items (board_id, group_id, name, position, created_by) values (${board.id}, ${group.id}, 'Task', 0, ${danh.id}) returning id`;
  await sql`insert into item_column_values (item_id, column_id, value_json) values (${item.id}, ${column.id}, ${sql.json({ type: "STAKEHOLDER", group: first })})`;

  r = await call(emily, "POST", `/api/departments/${A}`, { action: "usage", name: first });
  check("Usage counts B's tasks too", r.status === 200 && r.body?.count >= 1, `${r.status} ${JSON.stringify(r.body)}`);

  const renamed = options.map((o, i) => (i === 0 ? { ...o, name: `${first} (renamed)`.slice(0, 40) } : o));
  r = await call(emily, "POST", `/api/departments/${A}`, { action: "save", options: renamed, renames: { [first]: renamed[0].name } });
  const [cellB] = await sql`select value_json from item_column_values where item_id = ${item.id}`;
  check("Renaming in A renames B's task", r.status === 200 && cellB.value_json.group === renamed[0].name, `${r.status} ${JSON.stringify(cellB?.value_json)}`);
  // Back as it was.
  await call(emily, "POST", `/api/departments/${A}`, { action: "save", options, renames: { [renamed[0].name]: first } });
  const [back] = await sql`select value_json from item_column_values where item_id = ${item.id}`;
  check("…and back again", back.value_json.group === first, JSON.stringify(back.value_json));
}

// ---- snapshots and resets are the Owners' --------------------------------------
r = await call(emily, "GET", `/api/snapshots?workspaceId=${A}`);
check("An admin cannot list snapshots", r.status === 403, `${r.status}`);
r = await call(danh, "GET", `/api/snapshots?workspaceId=${B}`);
check("An Owner lists every snapshot from any workspace", r.status === 200 && Array.isArray(r.body?.snapshots), `${r.status}`);
r = await call(emily, "POST", "/api/invitations/reinitiate", { workspaceId: A, userId: jun.id });
check("An admin of A cannot reset someone who also uses B", r.status === 403, `${r.status} ${r.body?.error ?? ""}`);

// ---- deleting B ----------------------------------------------------------------
r = await call(emily, "DELETE", `/api/workspaces/${B}`);
check("An admin cannot delete a workspace", r.status === 403, `${r.status}`);
const snapshotsBefore = await sql`select count(*)::int as n from workspace_snapshots where kind = 'before_delete'`;
r = await call(danh, "DELETE", `/api/workspaces/${B}`);
check("An Owner deletes B", r.status === 200 && r.body?.snapshot?.kind === "before_delete", `${r.status} ${r.body?.error ?? ""}`);
const snapshotsAfter = await sql`select count(*)::int as n from workspace_snapshots where kind = 'before_delete'`;
check("…after a snapshot of everything", snapshotsAfter[0].n === snapshotsBefore[0].n + 1);
const gone = await sql`select count(*)::int as n from workspaces where slug = ${B_SLUG}`;
check("B is gone", gone[0].n === 0);
const [profile] = await sql`select id from profiles where email = ${NEW_EMAIL}`;
check("The people it had stay in the directory", !!profile);
r = await call(danh, "DELETE", `/api/workspaces/${A}`);
check("The last workspace cannot be deleted", r.status === 409, `${r.status} ${r.body?.error ?? ""}`);

// ---- tidy up -------------------------------------------------------------------
await sql`delete from workspace_snapshots where kind = 'before_delete' and name like ${"Before deleting “MW Test B”%"}`;
if (profile) await service.auth.admin.deleteUser(profile.id);

console.log(results.join("\n"));
console.log(`\n${results.length - failed}/${results.length} passed`);
await sql.end();
process.exit(failed ? 1 : 0);
