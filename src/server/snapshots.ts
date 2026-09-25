import { gunzipSync, gzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/server/http";

/**
 * Snapshots of the whole database: every table in the public schema, in one
 * gzipped JSON file kept in `workspace_snapshots` (see 0071).
 *
 * Everything means everything the app stores — boards, tasks, values, assets,
 * comments, activity, people's profiles and memberships, settings, portals,
 * automations and their history — as rows. What it does not hold is what
 * lives outside the public schema: sign-in accounts and their passwords
 * (Supabase Auth), and uploaded pictures (Storage), which a restore leaves as
 * they are.
 *
 * Talks to Postgres directly rather than through PostgREST: a snapshot has to
 * be read in one consistent transaction, and a restore has to empty and refill
 * every table in one, with triggers held off so refilling a table does not
 * fire the automations the rows once fired.
 *
 * The workspace id scopes who may see a snapshot, not what is in it. There is
 * one workspace today; when there are several, capture and restore have to be
 * narrowed to one workspace's rows.
 */

/** Never in a snapshot: the migration ledger belongs to the schema, the snapshots to themselves. */
const EXCLUDED_TABLES = new Set(["schema_migrations", "workspace_snapshots"]);

export const SNAPSHOT_FORMAT = "streamline-snapshot";
const SNAPSHOT_VERSION = 1;
/** Rows per INSERT when refilling a table. */
const INSERT_CHUNK = 500;

export const snapshotWorkspaceSchema = z.object({ workspaceId: z.uuid() });
export const createSnapshotSchema = z.object({ workspaceId: z.uuid(), name: z.string().trim().max(120).optional() });
export const restoreSnapshotSchema = z.object({ workspaceId: z.uuid(), password: z.string().min(1, "Enter your password").max(200) });

export interface SnapshotSummary {
  id: string;
  name: string;
  kind: "manual" | "before_restore" | "upload";
  createdAt: string;
  createdByName: string | null;
  appVersion: string | null;
  schemaVersion: string | null;
  sizeBytes: number;
  rowCount: number;
  tableCount: number;
  restoredAt: string | null;
  restoredByName: string | null;
}

interface Caller {
  userId: string;
  email: string | null;
  name: string;
}

let client: postgres.Sql | null = null;

function db(): postgres.Sql {
  if (client) return client;
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) throw new HttpError(503, "Snapshots are not configured on this server: set SUPABASE_DB_URL in the deployment's environment variables.");
  client = postgres(url, { prepare: false, ssl: "require", max: 1, idle_timeout: 20, connect_timeout: 15 });
  return client;
}

/** A table or column name as SQL, from the catalogue and checked, never from a request. */
function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new HttpError(500, `Unexpected identifier: ${name}`);
  return `"${name}"`;
}

/** The signed-in caller, who must be an active owner or admin of the workspace. */
export async function requireSnapshotAdmin(request: Request, workspaceId: string): Promise<Caller> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) throw new HttpError(401, "Sign in to manage snapshots.");
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");
  const [membership] = await db()<{ role: string; status: string; display_name: string | null }[]>`
    select m.role, m.status, p.display_name
    from public.workspace_members m left join public.profiles p on p.id = m.user_id
    where m.workspace_id = ${workspaceId} and m.user_id = ${data.user.id}`;
  if (!membership || membership.status !== "ACTIVE" || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
    throw new HttpError(403, "Only workspace admins can manage snapshots.");
  }
  return { userId: data.user.id, email: data.user.email ?? null, name: membership.display_name ?? data.user.email ?? "An admin" };
}

/**
 * The caller's own password, checked by signing in with it on a throwaway
 * client. The session that sign-in makes is signed out again on the spot, and
 * only that one: the browser the caller is using stays signed in.
 */
async function verifyPassword(caller: Caller, password: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new HttpError(503, "Sign-in is not configured on this server.");
  if (!caller.email) throw new HttpError(400, "Your account has no email to check a password against.");
  const probe = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await probe.auth.signInWithPassword({ email: caller.email, password });
  if (error || data.user?.id !== caller.userId) throw new HttpError(403, "That password is not right.");
  await probe.auth.signOut({ scope: "local" }).catch(() => undefined);
}

/** The public tables a snapshot covers, each with the columns that can be written. */
async function tablesNow(sql: postgres.Sql | postgres.TransactionSql): Promise<Map<string, string[]>> {
  const rows = await sql<{ table_name: string; column_name: string }[]>`
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.is_generated = 'NEVER'
    order by c.table_name, c.ordinal_position`;
  const tables = new Map<string, string[]>();
  for (const row of rows) {
    if (EXCLUDED_TABLES.has(row.table_name)) continue;
    const columns = tables.get(row.table_name) ?? [];
    columns.push(row.column_name);
    tables.set(row.table_name, columns);
  }
  return tables;
}

interface Captured {
  file: Buffer;
  tableCounts: Record<string, number>;
  rowCount: number;
  schemaVersion: string | null;
}

/**
 * Reads every table in one repeatable-read transaction, so the snapshot is the
 * database at one instant rather than a table here and a table a second later.
 * The rows arrive as JSON text from Postgres and go into the file as they are.
 */
export async function capture(meta: { name: string; createdAt: string; createdByName: string }): Promise<Captured> {
  return db().begin("isolation level repeatable read read only", async (tx) => {
    const tables = await tablesNow(tx);
    const [ledger] = await tx<{ name: string }[]>`select name from public.schema_migrations order by name desc limit 1`;
    const tableCounts: Record<string, number> = {};
    const parts: string[] = [];
    for (const table of [...tables.keys()].sort()) {
      const [row] = await tx.unsafe<{ n: number; rows: string }[]>(`select count(*)::int as n, coalesce(json_agg(t), '[]'::json)::text as rows from public.${ident(table)} t`);
      tableCounts[table] = row?.n ?? 0;
      parts.push(`${JSON.stringify(table)}:${row?.rows ?? "[]"}`);
    }
    const header = {
      format: SNAPSHOT_FORMAT,
      version: SNAPSHOT_VERSION,
      name: meta.name,
      createdAt: meta.createdAt,
      createdBy: meta.createdByName,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
      schemaVersion: ledger?.name ?? null,
      tableCounts,
    };
    const json = `${JSON.stringify(header).slice(0, -1)},"tables":{${parts.join(",")}}}`;
    return {
      file: gzipSync(Buffer.from(json, "utf8"), { level: 9 }),
      tableCounts,
      rowCount: Object.values(tableCounts).reduce((a, b) => a + b, 0),
      schemaVersion: ledger?.name ?? null,
    };
  });
}

interface SnapshotRow {
  id: string;
  name: string;
  kind: SnapshotSummary["kind"];
  created_at: Date;
  created_by_name: string | null;
  app_version: string | null;
  schema_version: string | null;
  size_bytes: string | number;
  row_count: number;
  table_counts: Record<string, number>;
  restored_at: Date | null;
  restored_by_name: string | null;
}

function summary(row: SnapshotRow): SnapshotSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    appVersion: row.app_version,
    schemaVersion: row.schema_version,
    sizeBytes: Number(row.size_bytes),
    rowCount: row.row_count,
    tableCount: Object.keys(row.table_counts ?? {}).length,
    restoredAt: row.restored_at ? row.restored_at.toISOString() : null,
    restoredByName: row.restored_by_name,
  };
}

const SUMMARY_COLUMNS = ["id", "name", "kind", "created_at", "created_by_name", "app_version", "schema_version", "size_bytes", "row_count", "table_counts", "restored_at", "restored_by_name"];

export async function listSnapshots(workspaceId: string): Promise<SnapshotSummary[]> {
  const sql = db();
  const rows = await sql<SnapshotRow[]>`select ${sql(SUMMARY_COLUMNS)} from public.workspace_snapshots where workspace_id = ${workspaceId} order by created_at desc`;
  return rows.map(summary);
}

async function store(workspaceId: string, caller: Caller, kind: SnapshotSummary["kind"], name: string, captured: Captured, appVersion: string | null): Promise<SnapshotSummary> {
  const [row] = await db()<SnapshotRow[]>`
    insert into public.workspace_snapshots (workspace_id, name, kind, created_by, created_by_name, app_version, schema_version, size_bytes, row_count, table_counts, file)
    values (${workspaceId}, ${name}, ${kind}, ${caller.userId}, ${caller.name}, ${appVersion}, ${captured.schemaVersion}, ${captured.file.length}, ${captured.rowCount}, ${db().json(captured.tableCounts)}, ${captured.file})
    returning ${db()(SUMMARY_COLUMNS)}`;
  return summary(row!);
}

function defaultName(date: Date): string {
  return `Snapshot ${date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: process.env.AUTOMATION_TIMEZONE || "Asia/Ho_Chi_Minh" })}`;
}

export async function createSnapshot(workspaceId: string, caller: Caller, name?: string, kind: SnapshotSummary["kind"] = "manual"): Promise<SnapshotSummary> {
  const now = new Date();
  const title = name?.trim() || defaultName(now);
  const captured = await capture({ name: title, createdAt: now.toISOString(), createdByName: caller.name });
  return store(workspaceId, caller, kind, title, captured, process.env.NEXT_PUBLIC_APP_VERSION ?? null);
}

export async function snapshotFile(workspaceId: string, id: string): Promise<{ name: string; createdAt: string; file: Buffer }> {
  const [row] = await db()<{ name: string; created_at: Date; file: Buffer }[]>`select name, created_at, file from public.workspace_snapshots where id = ${id} and workspace_id = ${workspaceId}`;
  if (!row) throw new HttpError(404, "That snapshot no longer exists.");
  return { name: row.name, createdAt: row.created_at.toISOString(), file: row.file };
}

export async function deleteSnapshot(workspaceId: string, id: string): Promise<void> {
  const rows = await db()`delete from public.workspace_snapshots where id = ${id} and workspace_id = ${workspaceId} returning id`;
  if (rows.length === 0) throw new HttpError(404, "That snapshot no longer exists.");
}

export interface SnapshotDocument {
  format: string;
  version: number;
  name?: string;
  createdAt?: string;
  appVersion?: string | null;
  schemaVersion?: string | null;
  tables: Record<string, Array<Record<string, unknown>>>;
}

/** Opens a snapshot file, gzipped or not, and refuses anything that is not one. */
export function readSnapshotFile(file: Buffer): SnapshotDocument {
  let text: string;
  try {
    text = (file[0] === 0x1f && file[1] === 0x8b ? gunzipSync(file) : file).toString("utf8");
  } catch {
    throw new HttpError(400, "That file could not be opened.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "That file is not a Streamline snapshot.");
  }
  const doc = parsed as Partial<SnapshotDocument> | null;
  if (!doc || doc.format !== SNAPSHOT_FORMAT || typeof doc.tables !== "object" || doc.tables === null) throw new HttpError(400, "That file is not a Streamline snapshot.");
  if (typeof doc.version !== "number" || doc.version > SNAPSHOT_VERSION) throw new HttpError(400, "That snapshot was made by a newer version of Streamline.");
  for (const rows of Object.values(doc.tables)) if (!Array.isArray(rows)) throw new HttpError(400, "That snapshot is damaged.");
  return doc as SnapshotDocument;
}

/** Keeps an uploaded snapshot file beside the ones taken here, ready to restore. */
export async function uploadSnapshot(workspaceId: string, caller: Caller, file: Buffer, fileName: string | null): Promise<SnapshotSummary> {
  const doc = readSnapshotFile(file);
  const tableCounts = Object.fromEntries(Object.entries(doc.tables).map(([table, rows]) => [table, rows.length]));
  const gz = file[0] === 0x1f && file[1] === 0x8b ? file : gzipSync(file, { level: 9 });
  const name = doc.name?.trim() || fileName?.replace(/\.json(\.gz)?$/i, "") || "Uploaded snapshot";
  return store(workspaceId, caller, "upload", name, { file: gz, tableCounts, rowCount: Object.values(tableCounts).reduce((a, b) => a + b, 0), schemaVersion: doc.schemaVersion ?? null }, doc.appVersion ?? null);
}

export interface RestoreResult {
  restored: SnapshotSummary;
  safetySnapshot: SnapshotSummary;
  rowCount: number;
  /** Tables in the file that this database no longer has; their rows were left out. */
  skippedTables: string[];
}

/**
 * Puts the database back to a snapshot.
 *
 * The password is checked first, then the current state is snapshotted, so a
 * restore is itself undoable. The restore is one transaction: every table is
 * emptied and refilled, or nothing changes. Triggers and foreign-key checks are
 * held off for its length (`session_replication_role = replica`), which lets
 * the tables be filled in any order and keeps automations from firing on rows
 * that are only being put back.
 *
 * A column the snapshot does not have takes its default, so a snapshot from an
 * older schema still restores; a column it has that the table no longer does
 * is dropped.
 */
export async function restoreSnapshot(workspaceId: string, id: string, caller: Caller, password: string): Promise<RestoreResult> {
  await verifyPassword(caller, password);
  const [row] = await db()<(SnapshotRow & { file: Buffer })[]>`select ${db()([...SUMMARY_COLUMNS, "file"])} from public.workspace_snapshots where id = ${id} and workspace_id = ${workspaceId}`;
  if (!row) throw new HttpError(404, "That snapshot no longer exists.");
  const doc = readSnapshotFile(row.file);

  const safetySnapshot = await createSnapshot(workspaceId, caller, `Before restoring “${row.name}”`, "before_restore");

  const { rowCount, skippedTables } = await db().begin((tx) => refill(tx, doc));

  const [restored] = await db()<SnapshotRow[]>`
    update public.workspace_snapshots set restored_at = now(), restored_by_name = ${caller.name}
    where id = ${id} returning ${db()(SUMMARY_COLUMNS)}`;
  return { restored: summary(restored!), safetySnapshot, rowCount, skippedTables };
}

/**
 * Empties every table a snapshot covers and fills it again from `doc`, inside
 * the caller's transaction, with triggers and foreign-key checks held off for
 * its length. Exported so scripts/snapshot-rehearsal.mts can run it and roll
 * it back, which proves a snapshot restores without changing anything.
 */
export async function refill(tx: postgres.TransactionSql, doc: SnapshotDocument): Promise<{ rowCount: number; skippedTables: string[] }> {
  await tx`set local session_replication_role = replica`;
  await tx`set local statement_timeout = '55s'`;
  const tables = await tablesNow(tx);
  const names = [...tables.keys()];
  if (names.length) await tx.unsafe(`truncate table ${names.map((t) => `public.${ident(t)}`).join(", ")}`);
  let rowCount = 0;
  const skippedTables: string[] = [];
  for (const [table, rows] of Object.entries(doc.tables)) {
    const columns = tables.get(table);
    if (!columns) {
      if (rows.length) skippedTables.push(table);
      continue;
    }
    if (rows.length === 0) continue;
    const present = new Set<string>();
    for (const r of rows) for (const key of Object.keys(r)) present.add(key);
    const cols = columns.filter((c) => present.has(c)).map(ident).join(", ");
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      // OVERRIDING SYSTEM VALUE: an identity column takes the id the row had, not a new one.
      await tx.unsafe(`insert into public.${ident(table)} (${cols}) overriding system value select ${cols} from jsonb_populate_recordset(null::public.${ident(table)}, $1::text::jsonb)`, [JSON.stringify(chunk)]);
    }
    rowCount += rows.length;
  }
  // An identity column's counter carries on from the highest id put back, so the next row does not collide with one.
  const identities = await tx<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns where table_schema = 'public' and is_identity = 'YES'`;
  for (const { table_name, column_name } of identities) {
    if (!tables.has(table_name)) continue;
    await tx.unsafe(
      `select setval(pg_get_serial_sequence('public.${ident(table_name)}', '${column_name}'), coalesce((select max(${ident(column_name)}) from public.${ident(table_name)}), 0) + 1, false)`,
    );
  }
  return { rowCount, skippedTables };
}
