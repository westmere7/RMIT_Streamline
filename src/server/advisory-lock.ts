import postgres from "postgres";
import { HttpError } from "@/server/http";

/** A database on this machine (a disposable local stack) speaks no TLS; every other one must. */
function sslFor(url: string): "require" | false {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) ? false : "require";
  } catch {
    return "require";
  }
}

let client: postgres.Sql | null = null;
function db(): postgres.Sql | null {
  if (client) return client;
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) return null;
  client = postgres(url, { prepare: false, ssl: sslFor(url), max: 2, idle_timeout: 20, connect_timeout: 15 });
  return client;
}

/**
 * Runs `work` while holding a lock named `name`, or refuses with 409 when
 * another request holds it. The lock lives in a transaction kept open for the
 * whole of `work` (transaction-scoped, so it holds through Supabase's pooler)
 * and goes when that transaction ends, however `work` ends. Without
 * SUPABASE_DB_URL there is nothing to lock with and `work` just runs.
 */
export async function withExclusiveLock<T>(name: string, busyMessage: string, work: () => Promise<T>): Promise<T> {
  const sql = db();
  if (!sql) return work();
  let result!: T;
  await sql.begin(async (tx) => {
    const [row] = await tx<{ locked: boolean }[]>`select pg_try_advisory_xact_lock(hashtext(${name})) as locked`;
    if (!row?.locked) throw new HttpError(409, busyMessage);
    result = await work();
  });
  return result;
}
