#!/usr/bin/env tsx
/**
 * Seeds a Supabase project from the same TypeScript seed the local store uses
 * (src/data/seed/seed-data.ts), so both providers show the identical workspace
 * and a new board added to the seed needs no SQL.
 *
 *   npm run db:seed
 *
 * Two steps, because public.profiles.id references auth.users(id):
 *   1. create the demo accounts through the Auth Admin API with the seed's
 *      fixed ids (00000001-0000-4000-8000-0000000000NN),
 *   2. delete the seed workspace and insert the bundle fresh.
 *
 * Needs SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * in .env.local. Safe to re-run: it replaces its own rows and leaves anything
 * created outside the seed workspace alone.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { buildSeed, SEED_ACCOUNTS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "../src/data/seed/seed-data";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEMO_PASSWORD = process.env.SEED_PASSWORD || "Password123!";
/** The test login the team uses; short on purpose, see ADMIN_FALLBACK. */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const ADMIN_FALLBACK = "admin123";

function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

interface AdminUser {
  id?: string;
  email?: string;
}

async function admin<T>(base: string, key: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}/auth/v1/admin${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.msg || body?.message || body?.error_description || text || response.statusText;
    throw Object.assign(new Error(`Auth Admin ${init.method ?? "GET"} ${path} → ${response.status}: ${message}`), { status: response.status });
  }
  return body as T;
}

/** Creates or refreshes one account, tolerating a password the project rejects as too short. */
async function upsertAccount(base: string, key: string, account: { id: string; email: string; firstName: string; lastName: string }, password: string, fallback?: string) {
  const payload = {
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: { first_name: account.firstName, last_name: account.lastName },
  };
  const existing = await admin<AdminUser | null>(base, key, `/users/${account.id}`).catch(() => null);
  try {
    if (existing?.id) {
      await admin(base, key, `/users/${account.id}`, { method: "PUT", body: JSON.stringify(payload) });
      return { created: false, password };
    }
    const created = await admin<AdminUser>(base, key, "/users", { method: "POST", body: JSON.stringify({ id: account.id, ...payload }) });
    if (created.id !== account.id) {
      throw new Error(`Supabase assigned ${created.id} instead of ${account.id}; the seed's foreign keys need the fixed id.`);
    }
    return { created: true, password };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (fallback && /password/i.test(message) && /(least|short|weak)/i.test(message)) {
      const retry = await upsertAccount(base, key, account, fallback);
      return { ...retry, password: fallback, downgraded: true };
    }
    throw error;
  }
}

async function main(): Promise<void> {
  loadEnv();
  const dbUrl = process.env.SUPABASE_DB_URL;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    !dbUrl && "SUPABASE_DB_URL",
    !projectUrl && "NEXT_PUBLIC_SUPABASE_URL",
    !serviceKey && "SUPABASE_SERVICE_ROLE_KEY (Project Settings → API keys → service_role)",
  ].filter(Boolean);
  if (missing.length) {
    console.error(`Missing in .env.local:\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }

  const seed = buildSeed(new Date());
  const byId = new Map(seed.users.map((u) => [u.id, u]));

  // ---- 1. Auth accounts ----------------------------------------------------
  console.log(`Accounts (${SEED_ACCOUNTS.length}) — demo password: ${DEMO_PASSWORD}`);
  let adminPassword = ADMIN_PASSWORD;
  for (const account of SEED_ACCOUNTS) {
    const user = byId.get(account.id);
    if (!user) continue;
    const isAdmin = account.id === SEED_USER_IDS.admin;
    const result = await upsertAccount(
      projectUrl!,
      serviceKey!,
      { id: account.id, email: account.email, firstName: user.firstName, lastName: user.lastName },
      isAdmin ? ADMIN_PASSWORD : DEMO_PASSWORD,
      isAdmin ? ADMIN_FALLBACK : undefined,
    );
    if (isAdmin) adminPassword = result.password;
    console.log(`  ${result.created ? "+" : "="} ${account.email}${isAdmin ? `  (password: ${result.password})` : ""}`);
  }

  // ---- 2. Data -------------------------------------------------------------
  const sql = postgres(dbUrl!, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 30, onnotice: () => {} });
  const json = (value: unknown) => sql.json(value as never);

  try {
    const ledger = await sql`select 1 from public.schema_migrations limit 1`.catch(() => null);
    if (!ledger) {
      console.error("\nNo schema_migrations table — run `npm run db:migrate` first.");
      process.exit(1);
    }

    console.log("\nReplacing seed data …");
    await sql.begin(async (tx) => {
      // Notifications are user-scoped, so they do not cascade with the workspace.
      await tx`delete from public.notifications where user_id in ${tx(seed.users.map((u) => u.id))}`;
      await tx`delete from public.workspaces where id = ${SEED_WORKSPACE_ID}`;

      await tx`
        insert into public.profiles ${tx(
          seed.users.map((u) => ({
            id: u.id,
            email: u.email,
            first_name: u.firstName,
            last_name: u.lastName,
            display_name: u.displayName,
            avatar_url: u.avatarUrl,
            job_title: u.jobTitle,
            department: u.department,
            timezone: u.timezone,
            deactivated_at: u.deactivatedAt,
          })),
        )}
        on conflict (id) do update set
          email = excluded.email,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url,
          job_title = excluded.job_title,
          department = excluded.department,
          timezone = excluded.timezone,
          deactivated_at = excluded.deactivated_at
      `;

      await tx`insert into public.workspaces ${tx(seed.workspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug, logo_url: w.logoUrl })))}`;

      await tx`insert into public.workspace_members ${tx(
        seed.workspaceMembers.map((m) => ({ id: m.id, workspace_id: m.workspaceId, user_id: m.userId, role: m.role, status: m.status, joined_at: m.joinedAt })),
      )}`;

      await tx`insert into public.teams ${tx(
        seed.teams.map((t) => ({ id: t.id, workspace_id: t.workspaceId, name: t.name, description: t.description, color: t.color, icon: t.icon, archived_at: t.archivedAt })),
      )}`;

      await tx`insert into public.team_members ${tx(seed.teamMembers.map((m) => ({ id: m.id, team_id: m.teamId, user_id: m.userId, role: m.role })))}`;

      await tx`insert into public.boards ${tx(
        seed.boards.map((b) => ({
          id: b.id,
          workspace_id: b.workspaceId,
          team_id: b.teamId,
          name: b.name,
          slug: b.slug,
          description: b.description,
          type: b.type,
          visibility: b.visibility,
          owner_id: b.ownerId,
          color: b.color,
          icon: b.icon,
          archived_at: b.archivedAt,
        })),
      )}`;

      await tx`insert into public.board_members ${tx(seed.boardMembers.map((m) => ({ id: m.id, board_id: m.boardId, user_id: m.userId, role: m.role })))}`;

      if (seed.boardFavourites.length) {
        await tx`insert into public.board_favourites ${tx(seed.boardFavourites.map((f) => ({ id: f.id, board_id: f.boardId, user_id: f.userId, created_at: f.createdAt })))}`;
      }

      await tx`insert into public.board_groups ${tx(
        seed.boardGroups.map((g) => ({ id: g.id, board_id: g.boardId, name: g.name, color: g.color, position: g.position, collapsed: g.collapsed })),
      )}`;

      await tx`insert into public.board_columns ${tx(
        seed.boardColumns.map((c) => ({
          id: c.id,
          board_id: c.boardId,
          name: c.name,
          type: c.type,
          settings: json(c.settings),
          position: c.position,
          width: c.width,
          hidden: c.hidden,
        })),
      )}`;

      // Subitems reference their parent, so top-level rows go in first.
      const parents = seed.items.filter((i) => i.parentItemId === null);
      const children = seed.items.filter((i) => i.parentItemId !== null);
      for (const batch of [parents, children]) {
        if (!batch.length) continue;
        await tx`insert into public.items ${tx(
          batch.map((i) => ({
            id: i.id,
            board_id: i.boardId,
            group_id: i.groupId,
            parent_item_id: i.parentItemId,
            name: i.name,
            description: i.description,
            position: i.position,
            created_by: i.createdBy,
            archived_at: i.archivedAt,
            created_at: i.createdAt,
            updated_at: i.updatedAt,
          })),
        )}`;
      }

      // Chunked: one statement per 500 values keeps the parameter count sane.
      for (let i = 0; i < seed.itemColumnValues.length; i += 500) {
        const batch = seed.itemColumnValues.slice(i, i + 500);
        await tx`insert into public.item_column_values ${tx(
          batch.map((v) => ({ id: v.id, item_id: v.itemId, column_id: v.columnId, value_json: json(v.value), updated_at: v.updatedAt })),
        )}`;
      }

      if (seed.itemLinks.length) {
        await tx`insert into public.item_links ${tx(
          seed.itemLinks.map((l) => {
            // item_links_ordered_pair requires the smaller uuid first.
            const [a, b] = l.itemAId < l.itemBId ? [l.itemAId, l.itemBId] : [l.itemBId, l.itemAId];
            return { id: l.id, workspace_id: l.workspaceId, item_a_id: a, item_b_id: b, excluded: l.excluded, created_by: l.createdBy, created_at: l.createdAt };
          }),
        )}`;
      }

      if (seed.trackers.length) {
        await tx`insert into public.trackers ${tx(
          seed.trackers.map((t) => ({ id: t.id, workspace_id: t.workspaceId, team_id: t.teamId, name: t.name, description: t.description, created_by: t.createdBy })),
        )}`;
        await tx`insert into public.tracker_sheets ${tx(
          seed.trackerSheets.map((s) => ({
            id: s.id,
            tracker_id: s.trackerId,
            name: s.name,
            position: s.position,
            columns: json(s.columns),
            rows: json(s.rows),
            frozen_columns: s.frozenColumns,
          })),
        )}`;
      }

      if (seed.comments.length) {
        await tx`insert into public.comments ${tx(
          seed.comments.map((c) => ({ id: c.id, item_id: c.itemId, author_id: c.authorId, body: c.body, mention_user_ids: c.mentionUserIds, created_at: c.createdAt, updated_at: c.updatedAt })),
        )}`;
      }

      for (let i = 0; i < seed.activities.length; i += 500) {
        const batch = seed.activities.slice(i, i + 500);
        await tx`insert into public.activities ${tx(
          batch.map((a) => ({
            id: a.id,
            workspace_id: a.workspaceId,
            board_id: a.boardId,
            item_id: a.itemId,
            actor_id: a.actorId,
            event_type: a.eventType,
            metadata: json(a.metadata),
            created_at: a.createdAt,
          })),
        )}`;
      }

      if (seed.notifications.length) {
        await tx`insert into public.notifications ${tx(
          seed.notifications.map((n) => ({
            id: n.id,
            user_id: n.userId,
            type: n.type,
            title: n.title,
            body: n.body,
            entity_type: n.entityType,
            entity_id: n.entityId,
            board_id: n.boardId,
            actor_id: n.actorId,
            read_at: n.readAt,
            created_at: n.createdAt,
          })),
        )}`;
      }

      if (seed.boardVisits.length) {
        await tx`insert into public.board_visits ${tx(seed.boardVisits.map((v) => ({ user_id: v.userId, board_id: v.boardId, visited_at: v.visitedAt })))}
          on conflict (user_id, board_id) do update set visited_at = excluded.visited_at`;
      }
    });

    const counts = await sql`
      select
        (select count(*) from public.profiles)           as profiles,
        (select count(*) from public.teams)              as teams,
        (select count(*) from public.boards)             as boards,
        (select count(*) from public.items)              as items,
        (select count(*) from public.item_column_values) as values,
        (select count(*) from public.comments)           as comments,
        (select count(*) from public.trackers)           as trackers,
        (select count(*) from public.notifications)      as notifications
    `;
    console.log("Seeded:", Object.entries(counts[0]!).map(([k, v]) => `${v} ${k}`).join(", "));
    console.log(`\nSign in with admin@rmit.local / ${adminPassword}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
