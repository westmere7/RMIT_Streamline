// Multi-workspace database rules, checked as each kind of person against the
// DISPOSABLE local stack. Refuses to run against anything but 127.0.0.1.
// Every check runs inside a transaction that is rolled back.
import postgres from "postgres";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const url = env.SUPABASE_DB_URL;
if (!url || !url.includes("127.0.0.1")) throw new Error("Refusing: SUPABASE_DB_URL is not the local stack");
const sql = postgres(url, { max: 1, onnotice: () => {} });

let failed = 0;
const results = [];
function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
}

const people = await sql`select p.id, p.email, m.role, m.status from profiles p join workspace_members m on m.user_id = p.id order by p.email`;
const byEmail = (prefix) => people.find((p) => p.email.startsWith(prefix));
const danh = byEmail("danh");
const adminAcct = byEmail("admin@");
const emily = byEmail("emily");
const ben = byEmail("ben");
const [rmit] = await sql`select id, slug from workspaces order by created_at limit 1`;
// The stack may hold more workspaces than the seeded one (somebody tried the app on it).
const [{ n: workspaceCount }] = await sql`select count(*)::int as n from workspaces`;

/** Runs `fn` as `user` (role authenticated, their JWT claims) inside a transaction that is rolled back. */
async function as(user, fn) {
  let out;
  try {
    await sql.begin(async (tx) => {
      if (user) {
        await tx.unsafe(`set local role authenticated`);
        await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user.id, role: "authenticated" })]);
      }
      out = await fn(tx);
      throw new Error("__rollback__");
    });
  } catch (e) {
    if (e.message !== "__rollback__") return { error: e.message };
  }
  return { value: out };
}

// 1. Backfill
const owners = (await sql`select user_id from app_owners`).map((r) => r.user_id);
check("Owners backfilled from active OWNER seats", owners.includes(danh.id) && owners.includes(adminAcct.id) && owners.length === 2, `${owners.length} owners`);

// 2. Creating workspaces
let r = await as(emily, (tx) => tx`insert into workspaces (name, slug) values ('Nope', 'nope-ws')`);
check("An admin cannot create a workspace", !!r.error, r.error?.slice(0, 60));
r = await as(danh, async (tx) => {
  await tx`insert into workspaces (name, slug) values ('Second', 'second-ws')`;
  const [ws] = await tx`select id from workspaces where slug = 'second-ws'`;
  return tx`select user_id, role, status from workspace_members where workspace_id = ${ws.id}`;
});
check("An Owner creates a workspace and every Owner is seated as OWNER", !r.error && r.value.length === 2 && r.value.every((m) => m.role === "OWNER" && m.status === "ACTIVE"), r.error ?? `${r.value?.length} seats`);

// 3. OWNER seats are the Owners' alone
r = await as(emily, (tx) => tx`update workspace_members set role = 'MEMBER' where user_id = ${danh.id} and workspace_id = ${rmit.id}`);
check("An admin cannot demote an Owner", !!r.error, r.error?.slice(0, 60));
r = await as(emily, (tx) => tx`update workspace_members set status = 'DEACTIVATED' where user_id = ${danh.id} and workspace_id = ${rmit.id}`);
check("An admin cannot deactivate an Owner's seat", !!r.error, r.error?.slice(0, 60));
r = await as(emily, (tx) => tx`delete from workspace_members where user_id = ${danh.id} and workspace_id = ${rmit.id}`);
check("An admin cannot remove an Owner from a workspace", !!r.error, r.error?.slice(0, 60));
r = await as(emily, (tx) => tx`update workspace_members set role = 'OWNER' where user_id = ${ben.id} and workspace_id = ${rmit.id} returning id`);
check("An admin cannot hand out the OWNER role", !!r.error, r.error?.slice(0, 60));
r = await as(emily, (tx) => tx`update workspace_members set role = 'OWNER' where user_id = ${emily.id} and workspace_id = ${rmit.id} returning id`);
check("An admin cannot make themselves OWNER", !!r.error, r.error?.slice(0, 60));
r = await as(emily, (tx) => tx`update workspace_members set role = 'MEMBER' where user_id = ${ben.id} and workspace_id = ${rmit.id} returning id`);
check("An admin still changes an ordinary member's role", !r.error && r.value.length === 1, r.error);
r = await as(emily, (tx) => tx`insert into app_owners (user_id) values (${emily.id})`);
check("An admin cannot make an Owner", !!r.error, r.error?.slice(0, 60));

// 4. Owners made and unmade by Owners
r = await as(danh, async (tx) => {
  await tx`insert into workspaces (name, slug) values ('Second', 'second-ws')`;
  await tx`insert into app_owners (user_id, granted_by) values (${emily.id}, ${danh.id})`;
  const seats = await tx`select role, status from workspace_members where user_id = ${emily.id}`;
  await tx`delete from app_owners where user_id = ${emily.id}`;
  const after = await tx`select role from workspace_members where user_id = ${emily.id}`;
  return { seats, after };
});
check("A new Owner is seated as OWNER in every workspace", !r.error && r.value.seats.length === workspaceCount + 1 && r.value.seats.every((s) => s.role === "OWNER"), r.error ?? JSON.stringify(r.value?.seats));
check("An unmade Owner stays in every workspace as MEMBER", !r.error && r.value.after.every((s) => s.role === "MEMBER"), r.error ?? JSON.stringify(r.value?.after));
r = await as(danh, async (tx) => {
  await tx`delete from app_owners where user_id = ${adminAcct.id}`;
  await tx`delete from app_owners where user_id = ${danh.id}`;
});
check("The last Owner cannot be removed", !!r.error && /at least one Owner/.test(r.error), r.error?.slice(0, 60));
const pending = people.find((p) => p.status === "INVITED");
if (pending) {
  r = await as(danh, (tx) => tx`insert into app_owners (user_id) values (${pending.id})`);
  check("Somebody still pending cannot be made an Owner", !!r.error && /finished onboarding/.test(r.error), r.error?.slice(0, 60));
}

// 5. Visibility across workspaces
r = await as(emily, async (tx) => {
  const ws = await tx`select slug from workspaces`;
  const profiles = await tx`select count(*)::int as n from profiles`;
  const dir = await tx`select * from directory_people()`;
  return { ws: ws.map((w) => w.slug), profiles: profiles[0].n, dir: dir.length };
});
const [{ n: profileCount }] = await sql`select count(*)::int as n from profiles`;
check("An admin reads every profile in the directory", !r.error && r.value.profiles === profileCount, r.error ?? `${r.value?.profiles}/${profileCount}`);
check("directory_people answers an active member", !r.error && r.value.dir > 0, r.error ?? `${r.value?.dir}`);
r = await as(danh, async (tx) => {
  await tx`insert into workspaces (name, slug) values ('Second', 'second-ws')`;
  await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: emily.id, role: "authenticated" })]);
  const ws = await tx`select slug from workspaces`;
  return ws.map((w) => w.slug);
});
check("An admin sees only the workspaces they are in", !r.error && !r.value.includes("second-ws"), r.error ?? r.value?.join(","));
r = await as(null, async (tx) => {
  await tx`insert into workspaces (name, slug) values ('Second', 'second-ws')`;
  await tx.unsafe(`set local role authenticated`);
  await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: danh.id, role: "authenticated" })]);
  return (await tx`select slug from workspaces`).map((w) => w.slug);
});
check("An Owner sees every workspace", !r.error && r.value.includes("second-ws") && r.value.includes(rmit.slug), r.error ?? r.value?.join(","));

// 6. Profiles of Owners are the Owners'
r = await as(emily, (tx) => tx`update profiles set job_title = 'hijacked' where id = ${danh.id} returning id`);
check("An admin cannot edit an Owner's profile", !r.error && r.value.length === 0, r.error ?? `${r.value?.length} rows`);
r = await as(emily, (tx) => tx`update profiles set job_title = 'Designer' where id = ${ben.id} returning id`);
check("An admin cannot edit a joined member's details", !!r.error && /details are theirs/.test(r.error), r.error ?? `${r.value?.length} rows`);
r = await as(emily, (tx) => tx`update profiles set deactivated_at = now() where id = ${ben.id} returning id`);
check("…but can still switch their account off", !r.error && r.value.length === 1, r.error ?? `${r.value?.length} rows`);

// 7. Deleting workspaces
r = await as(emily, async (tx) => tx`delete from workspaces where id = ${rmit.id} returning id`);
check("An admin cannot delete a workspace", !r.error && r.value.length === 0, r.error ?? `${r.value?.length}`);
r = await as(null, async (tx) => {
  // Only one left, then an Owner tries.
  await tx`delete from workspaces where id <> ${rmit.id}`;
  await tx.unsafe("set local role authenticated");
  await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: danh.id, role: "authenticated" })]);
  return tx`delete from workspaces where id = ${rmit.id}`;
});
check("The last workspace cannot be deleted", !!r.error && /last workspace/.test(r.error), r.error?.slice(0, 60));
r = await as(danh, async (tx) => {
  await tx`insert into workspaces (name, slug) values ('Second', 'second-ws')`;
  const deleted = await tx`delete from workspaces where id = ${rmit.id} returning id`;
  const left = await tx`select count(*)::int as n from workspace_members where workspace_id = ${rmit.id}`;
  return { deleted: deleted.length, left: left[0].n };
});
check("An Owner deletes a full workspace (every trigger on the cascade)", !r.error && r.value.deleted === 1 && r.value.left === 0, r.error ?? JSON.stringify(r.value));
r = await as(null, async (tx) => {
  await tx`insert into workspaces (name, slug) values ('Second', 'second-ws')`;
  const [before] = await tx`select (select count(*) from boards where workspace_id <> ${rmit.id}) b, (select count(*) from items i join boards bo on bo.id = i.board_id where bo.workspace_id <> ${rmit.id}) i, (select count(*) from profiles) p`;
  await tx`delete from workspaces where id = ${rmit.id}`;
  const [after] = await tx`select (select count(*) from boards) b, (select count(*) from items) i, (select count(*) from profiles) p, (select count(*) from notifications where workspace_id = ${rmit.id}) n`;
  return { before, after };
});
check("Deleting a workspace takes its boards and items and keeps the people", !r.error && Number(r.value.after.b) === Number(r.value.before.b) && Number(r.value.after.i) === Number(r.value.before.i) && r.value.after.p === r.value.before.p && Number(r.value.after.n) === 0, r.error ?? JSON.stringify(r.value));

// 7b. The Portal and Booking menu switch is the workspace admins'
r = await as(emily, (tx) => tx`update workspaces set show_portal_menu = false where id = ${rmit.id} returning id`);
check("An admin turns Portal and Booking off in their workspace", !r.error && r.value.length === 1, r.error ?? `${r.value?.length}`);
r = await as(ben, (tx) => tx`update workspaces set show_portal_menu = false where id = ${rmit.id} returning id`);
check("A guest cannot", !r.error && r.value.length === 0, r.error ?? `${r.value?.length}`);
const [{ show_portal_menu: stillOn }] = await sql`select show_portal_menu from workspaces where id = ${rmit.id}`;
check("It is on for the workspace already here", stillOn === true);

// 8. Notifications carry their workspace
const [unscoped] = await sql`select count(*)::int as n from notifications where board_id is not null and workspace_id is null`;
check("Every notification with a board has its workspace", unscoped.n === 0, `${unscoped.n} without`);
r = await as(null, async (tx) => {
  const [board] = await tx`select id, workspace_id from boards limit 1`;
  const [n] = await tx`insert into notifications (user_id, type, title, entity_type, entity_id, board_id) values (${ben.id}, 'COMMENT', 't', 'BOARD', ${board.id}, ${board.id}) returning workspace_id`;
  return n.workspace_id === board.workspace_id;
});
check("A new notification is given its board's workspace", !r.error && r.value === true, r.error);

console.log(results.join("\n"));
console.log(`\n${results.length - failed}/${results.length} passed`);
await sql.end();
process.exit(failed ? 1 : 0);
