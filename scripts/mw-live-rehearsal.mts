#!/usr/bin/env tsx
/**
 * Rehearses migration 0089 on a copy of the LIVE data, without changing live
 * or the stack.
 *
 * Reads every table of the live database in one READ ONLY transaction (the
 * URL comes from the main checkout's .env.local). Then, on the disposable
 * stack only, inside one transaction: empties every table, fills them with the
 * live rows exactly as a restore does, runs 0089 against them, checks what it
 * left, exercises the new rules on real data, and rolls everything back.
 */
import { readFileSync } from "node:fs";

const read = (path: string, key: string) => readFileSync(path, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";
const LIVE = read("E:/WORK_OFFLINE/apps/RMIT_Streamline/.env.local", "SUPABASE_DB_URL");
const STACK = read(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"), "SUPABASE_DB_URL");
if (!STACK.includes("127.0.0.1")) throw new Error("Refusing: the stack URL is not local");
if (!LIVE || LIVE.includes("127.0.0.1")) throw new Error("Refusing: no live URL");

const { default: postgres } = await import("postgres");
const { refill } = await import("../src/server/snapshots");

const live = postgres(LIVE, { prepare: false, ssl: "require", max: 1 });
const stack = postgres(STACK, { prepare: false, max: 1, onnotice: () => {} });

// ---- read live ---------------------------------------------------------------
const tables: Record<string, Array<Record<string, unknown>>> = {};
await live.begin("read only", async (tx) => {
  const names = await tx<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not in ('schema_migrations', 'workspace_snapshots') order by table_name`;
  for (const { table_name } of names) {
    const [row] = await tx.unsafe<{ rows: Array<Record<string, unknown>> }[]>(`select coalesce(json_agg(t), '[]'::json) as rows from public."${table_name}" t`);
    tables[table_name] = row?.rows ?? [];
  }
});
await live.end();
const liveOwners = new Set(tables.workspace_members!.filter((m) => m.role === "OWNER" && m.status === "ACTIVE").map((m) => m.user_id as string));
console.log(`Read ${Object.values(tables).reduce((n, rows) => n + rows.length, 0)} live rows in ${Object.keys(tables).length} tables; ${liveOwners.size} active OWNER seats.`);

// ---- rehearse on the stack ----------------------------------------------------
const lines: string[] = [];
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  lines.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
};
const migration = readFileSync(new URL("../supabase/migrations/0089_multi_workspace.sql", import.meta.url), "utf8");

class Rollback extends Error {}
try {
  await stack.begin(async (tx) => {
    const { rowCount, skippedTables } = await refill(tx, { format: "streamline-snapshot", version: 1, tables });
    check("Live rows load into the new schema", skippedTables.length === 0, `${rowCount} rows, skipped: ${skippedTables.join(",") || "none"}`);
    // A restore of a snapshot from before Owners existed rebuilds them from the OWNER seats (upToDate in snapshots.ts).
    const restored = (await tx<{ user_id: string }[]>`select user_id from public.app_owners`).map((r) => r.user_id);
    check("Restoring a snapshot from before Owners existed leaves the right Owners", restored.length === liveOwners.size && restored.every((id) => liveOwners.has(id)), `${restored.length}/${liveOwners.size}`);
    await tx`set local session_replication_role = origin`;
    // As live will be: the new tables and columns empty, then 0089 run.
    await tx`truncate public.app_owners`;
    await tx`update public.notifications set workspace_id = null`;
    await tx.unsafe(migration);

    const owners = (await tx<{ user_id: string }[]>`select user_id from public.app_owners`).map((r) => r.user_id);
    check("Owners are the live active OWNER seats, all of them", owners.length === liveOwners.size && owners.every((id) => liveOwners.has(id)), `${owners.length}/${liveOwners.size}`);
    const [ws] = await tx<{ id: string; show_portal_menu: boolean; name: string }[]>`select id, name, show_portal_menu from public.workspaces`;
    check("The live workspace keeps Portal and Booking in its menu", ws!.show_portal_menu === true, ws!.name);
    const [{ n: unscoped }] = await tx<{ n: number }[]>`select count(*)::int as n from public.notifications where workspace_id is null`;
    check("Every live notification now belongs to the workspace", unscoped === 0, `${unscoped} left`);
    const [{ n: ownerSeats }] = await tx<{ n: number }[]>`select count(*)::int as n from public.workspace_members where role = 'OWNER' and status = 'ACTIVE'`;
    check("OWNER seats unchanged", ownerSeats === liveOwners.size, `${ownerSeats}`);
    const [{ n: members }] = await tx<{ n: number }[]>`select count(*)::int as n from public.workspace_members`;
    check("No membership lost or added", members === tables.workspace_members!.length, `${members}/${tables.workspace_members!.length}`);

    // The new rules, on the real data.
    const owner = [...liveOwners][0]!;
    const admin = tables.workspace_members!.find((m) => m.role === "ADMIN" && m.status === "ACTIVE")?.user_id as string | undefined;
    const asUser = async (user: string) => {
      await tx.unsafe("set local role authenticated");
      await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: "authenticated" })]);
    };
    const attempt = async (user: string, run: (sp: postgres.TransactionSql) => Promise<unknown>) => {
      try {
        return await tx.savepoint(async (sp) => {
          await sp.unsafe("set local role authenticated");
          await sp.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: "authenticated" })]);
          const out = await run(sp);
          await sp.unsafe("reset role");
          return { ok: true as const, out };
        });
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    };
    // Undone as soon as it is counted, so the live workspace is the only one again below.
    const made = await attempt(owner, async (sp) => {
      await sp`insert into public.workspaces (name, slug) values ('Rehearsal', 'rehearsal-ws')`;
      const [row] = await sp<{ n: number }[]>`select count(*)::int as n from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where w.slug = 'rehearsal-ws' and m.role = 'OWNER'`;
      throw new Error(`seated:${row!.n}`);
    });
    const seated = !made.ok ? Number(/seated:(\d+)/.exec(made.error)?.[1] ?? -1) : -1;
    check("An Owner creates a second workspace on live data, and every Owner is seated in it", seated === liveOwners.size, `${seated} seated`);
    const [{ n: workspacesNow }] = await tx<{ n: number }[]>`select count(*)::int as n from public.workspaces`;
    check("…and it is undone again", workspacesNow === 1, `${workspacesNow}`);
    if (admin) {
      const refused = await attempt(admin, (sp) => sp`insert into public.workspaces (name, slug) values ('Nope', 'nope-ws')`);
      check("A live admin cannot create one", !refused.ok);
      const demote = await attempt(admin, (sp) => sp`update public.workspace_members set role = 'MEMBER' where user_id = ${owner} and workspace_id = ${ws!.id}`);
      check("A live admin cannot demote an Owner", !demote.ok);
    }
    const lastOne = await attempt(owner, (sp) => sp`delete from public.workspaces where id = ${ws!.id}`);
    check("The live workspace cannot be deleted while it is the only one", !lastOne.ok && /last workspace/.test(lastOne.error ?? ""), lastOne.ok ? "deleted!" : "");
    void asUser;
    throw new Rollback();
  });
} catch (e) {
  if (!(e instanceof Rollback)) {
    console.error(e);
    failed += 1;
  }
}
await stack.end();
console.log(lines.join("\n"));
console.log(`\n${lines.length - lines.filter((l) => l.startsWith("FAIL")).length}/${lines.length} passed; rolled back, the stack is as it was.`);
process.exit(failed ? 1 : 0);
