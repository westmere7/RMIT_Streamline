#!/usr/bin/env tsx
/**
 * Gives the demo workspace's finished work some rework, so the dashboard's
 * Sent back has something to read (src/data/seed/seed-rework.ts).
 *
 *   npm run db:seed:rework            # says what it would add
 *   npm run db:seed:rework -- --apply # adds it
 *   --share 0.3                        # of the eligible finished tasks (default: the seed's)
 *
 * Only inserts status-change activities, dated inside the stretch before each
 * chosen task's final Done; nothing is updated or deleted, and a task that
 * already went back is left alone, so a second run adds nothing. Only the seed
 * workspace is touched. Needs SUPABASE_DB_URL in .env.local.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { ActivityMetadata } from "../src/domain";
import { SEED_WORKSPACE_ID } from "../src/data/seed/seed-data";
import { planRework, type HistoryChange } from "../src/data/seed/seed-rework";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      const key = match?.[1];
      if (!key || process.env[key]) continue;
      process.env[key] = (match[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("Missing in .env.local:\n  SUPABASE_DB_URL");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const shareAt = process.argv.indexOf("--share");
  const share = shareAt > 0 ? Number(process.argv[shareAt + 1]) : undefined;
  if (share !== undefined && !(share > 0 && share <= 1)) {
    console.error("--share takes a number above 0, up to 1.");
    process.exit(1);
  }
  const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 30, onnotice: () => {} });
  try {
    const rows = await sql<Array<{ item_id: string; board_id: string | null; workspace_id: string; actor_id: string; created_at: Date; metadata: ActivityMetadata }>>`
      select item_id, board_id, workspace_id, actor_id, created_at, metadata
      from public.activities
      where workspace_id = ${SEED_WORKSPACE_ID}
        and event_type = 'ITEM_COLUMN_VALUE_UPDATED'
        and metadata->>'columnType' = 'STATUS'
        and item_id is not null
      order by created_at, id`;
    const history: HistoryChange[] = rows.map((r) => ({ itemId: r.item_id, boardId: r.board_id, workspaceId: r.workspace_id, actorId: r.actor_id, at: r.created_at.toISOString(), metadata: r.metadata }));
    const finished = new Set<string>();
    const last = new Map<string, HistoryChange>();
    for (const change of history) last.set(change.itemId, change);
    for (const [id, change] of last) if (change.metadata.to && /^done$/i.test(change.metadata.to)) finished.add(id);
    const items = await sql<Array<{ id: string; created_at: Date }>>`select id, created_at from public.items where id in ${sql([...new Set(history.map((c) => c.itemId))])}`;
    const planned = planRework(history, share, new Map(items.map((i) => [i.id, i.created_at.toISOString()])));
    const tasks = new Set(planned.map((c) => c.itemId));
    console.log(`${history.length} status changes, ${finished.size} tasks whose last change is to Done.`);
    console.log(`Would send back ${tasks.size} of them (${planned.length} changes): ${planned.filter((c) => c.metadata.to === "In Review").length} to review, ${planned.filter((c) => c.metadata.to === "Done").length} reopened.`);
    if (!apply) {
      console.log("Dry run. Add --apply to write.");
      return;
    }
    await sql.begin(async (tx) => {
      for (const change of planned) {
        await tx`
          insert into public.activities (id, workspace_id, board_id, item_id, actor_id, event_type, metadata, created_at)
          values (${randomUUID()}, ${change.workspaceId}, ${change.boardId}, ${change.itemId}, ${change.actorId}, ${change.eventType}, ${tx.json(change.metadata as never)}, ${change.at})`;
      }
    });
    console.log(`Added ${planned.length} changes.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
