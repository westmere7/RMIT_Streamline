#!/usr/bin/env node
/**
 * Adds (or updates) a real person in the Supabase project and gives them a role
 * in the workspace. Demo accounts come from the seed; this is for actual people.
 *
 *   node scripts/add-user.mjs --email you@rmit.edu.vn --password '…' --role OWNER \
 *     --first Danh --last Nguyen --title "Workspace Owner"
 *
 * Re-runnable: an existing account keeps its id and gets the new password/role.
 * Needs SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * in .env.local. Nothing is written to the repo — pass the password on the
 * command line (or via ADD_USER_PASSWORD) so it never lands in a file.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ROLES = ["OWNER", "ADMIN", "MEMBER", "GUEST"];

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
  }
  return out;
}

async function admin(base, key, path, init = {}) {
  const response = await fetch(`${base}/auth/v1/admin${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Auth Admin ${init.method ?? "GET"} ${path} → ${response.status}: ${body?.msg ?? body?.message ?? text}`);
  }
  return body;
}

async function main() {
  loadEnv();
  const opts = args();
  const email = String(opts.email ?? "").trim().toLowerCase();
  const password = opts.password ?? process.env.ADD_USER_PASSWORD;
  const role = String(opts.role ?? "MEMBER").toUpperCase();
  const first = opts.first ?? email.split("@")[0]?.split(".")[0] ?? "";
  const last = opts.last ?? "";
  const title = opts.title ?? null;
  const department = opts.department ?? null;
  const timezone = opts.timezone ?? "Australia/Melbourne";

  if (!email || !password) {
    console.error("Usage: node scripts/add-user.mjs --email <address> --password <password> [--role OWNER|ADMIN|MEMBER|GUEST] [--first X --last Y --title T]");
    process.exit(1);
  }
  if (!ROLES.includes(role)) {
    console.error(`--role must be one of ${ROLES.join(", ")}`);
    process.exit(1);
  }

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  const missing = [!projectUrl && "NEXT_PUBLIC_SUPABASE_URL", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY", !dbUrl && "SUPABASE_DB_URL"].filter(Boolean);
  if (missing.length) {
    console.error(`Missing in .env.local:\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }

  // 1. The auth account. The handle_new_user trigger creates its profile row.
  const existing = await admin(projectUrl, serviceKey, `/users?per_page=200`);
  const found = (existing?.users ?? []).find((u) => u.email?.toLowerCase() === email);
  const payload = { email, password, email_confirm: true, user_metadata: { first_name: first, last_name: last } };
  const user = found
    ? await admin(projectUrl, serviceKey, `/users/${found.id}`, { method: "PUT", body: JSON.stringify(payload) })
    : await admin(projectUrl, serviceKey, "/users", { method: "POST", body: JSON.stringify(payload) });
  console.log(`${found ? "updated" : "created"} auth user ${email} (${user.id})`);

  // 2. Profile details and workspace membership.
  const sql = postgres(dbUrl, { max: 1, prepare: false, connect_timeout: 30, onnotice: () => {} });
  try {
    const display = [first, last].filter(Boolean).join(" ") || email;
    await sql`
      insert into public.profiles (id, email, first_name, last_name, display_name, job_title, department, timezone)
      values (${user.id}, ${email}, ${first}, ${last}, ${display}, ${title}, ${department}, ${timezone})
      on conflict (id) do update set
        email = excluded.email, first_name = excluded.first_name, last_name = excluded.last_name,
        display_name = excluded.display_name, job_title = excluded.job_title,
        department = excluded.department, timezone = excluded.timezone, deactivated_at = null
    `;

    const workspaces = await sql`select id, name, slug from public.workspaces order by created_at limit 1`;
    const workspace = workspaces[0];
    if (!workspace) {
      console.error("No workspace exists yet — run `npm run db:seed` first.");
      process.exit(1);
    }
    await sql`
      insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
      values (${workspace.id}, ${user.id}, ${role}::public.workspace_role, 'ACTIVE', now())
      on conflict (workspace_id, user_id) do update set role = excluded.role, status = 'ACTIVE'
    `;
    console.log(`${role} of ${workspace.name} (/${workspace.slug})`);
    console.log(`\nSign in at /login with ${email}.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
