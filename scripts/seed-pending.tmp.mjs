// One-off: add the seed's pending members to the live database without a full
// reseed (which would wipe hand-made changes). Mirrors what db-seed.mts does for
// them: fixed-id auth account without a password, profile, INVITED membership,
// team memberships, and one random-token invitation each.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { buildSeed, SEED_ACCOUNTS, SEED_WORKSPACE_ID } from "../src/data/seed/seed-data";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const base = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function admin(path, init = {}) {
  const r = await fetch(`${base}/auth/v1/admin${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
  const text = await r.text();
  const body = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${r.status}: ${body?.msg ?? body?.message ?? text}`);
  return body;
}

const seed = buildSeed(new Date());
const pending = SEED_ACCOUNTS.filter((a) => a.pending);
const byId = new Map(seed.users.map((u) => [u.id, u]));
const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 30, onnotice: () => {} });
try {
  for (const account of pending) {
    const user = byId.get(account.id);
    const existing = await admin(`/users/${account.id}`).catch(() => null);
    if (existing?.id) await admin(`/users/${account.id}`, { method: "DELETE" });
    await admin("/users", { method: "POST", body: JSON.stringify({ id: account.id, email: account.email, email_confirm: true, user_metadata: { first_name: user.firstName, last_name: user.lastName } }) });
    await sql`insert into public.profiles (id, email, first_name, last_name, display_name, job_title, department, timezone)
      values (${user.id}, ${user.email}, ${user.firstName}, ${user.lastName}, ${user.displayName}, ${user.jobTitle}, ${user.department}, ${user.timezone})
      on conflict (id) do update set email = excluded.email, first_name = excluded.first_name, last_name = excluded.last_name, display_name = excluded.display_name, job_title = excluded.job_title, department = excluded.department, timezone = excluded.timezone, deactivated_at = null`;
    const member = seed.workspaceMembers.find((m) => m.userId === user.id);
    await sql`insert into public.workspace_members (workspace_id, user_id, role, status, joined_at) values (${SEED_WORKSPACE_ID}, ${user.id}, ${member.role}, 'INVITED', ${member.joinedAt}) on conflict (workspace_id, user_id) do update set status = 'INVITED', role = excluded.role`;
    for (const tm of seed.teamMembers.filter((m) => m.userId === user.id)) {
      await sql`insert into public.team_members (team_id, user_id, role) values (${tm.teamId}, ${tm.userId}, ${tm.role}) on conflict (team_id, user_id) do nothing`;
    }
    const inv = seed.workspaceInvitations.find((i) => i.userId === user.id);
    const token = randomBytes(32).toString("base64url");
    await sql`delete from public.workspace_invitations where user_id = ${user.id}`;
    await sql`insert into public.workspace_invitations (workspace_id, user_id, token, created_by, created_at, expires_at) values (${inv.workspaceId}, ${inv.userId}, ${token}, ${inv.createdBy}, ${inv.createdAt}, ${inv.expiresAt})`;
    console.log(`${account.email}  http://localhost:3000/join/${token}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
