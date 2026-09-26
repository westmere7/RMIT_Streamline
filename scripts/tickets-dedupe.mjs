#!/usr/bin/env node
/**
 * One task, one ticket — the rule TicketService enforces on every write, applied
 * to rows that were written before it existed.
 *
 *   npm run tickets:dedupe          list what shares a ticket, change nothing
 *   npm run tickets:dedupe -- --apply
 *                                   renumber it
 *
 * Migration 0050 gave one number per distinct old code per workspace, so any two
 * tasks that shared a "TA-4F2K" back then still answer to one ticket now —
 * whether or not a link joins them. A link that carries the ticket is the one
 * case where sharing is meant, and is the exception TicketService.heldBy makes;
 * everything else is two tasks quoting one code at each other, which is exactly
 * what a ticket exists to prevent.
 *
 * So, per ticket:
 *
 *   * tasks joined by ticket-carrying links are one chain and keep one code;
 *   * the chain holding the oldest task keeps the code it has, because that is
 *     the one most likely to be in somebody's inbox already;
 *   * every other chain takes a fresh number from the workspace's counter.
 *
 * Numbers are taken, never reused, and the counter only moves forward — so this
 * is safe to run again, and a run with nothing to fix writes nothing.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv();
if (!process.env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL is not set. See supabase/README.md.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
/** A database on this machine (a disposable local stack) speaks no TLS; every other one must. */
function sslFor(url) {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) ? false : "require";
  } catch {
    return "require";
  }
}
const sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false, ssl: sslFor(process.env.SUPABASE_DB_URL) });

try {
  // Oldest first: the order decides which chain keeps the code.
  const items = await sql`
    select i.id, i.name, i.ticket, b.workspace_id
    from public.items i
    join public.boards b on b.id = i.board_id
    where i.ticket is not null and i.ticket <> ''
    order by i.created_at, i.id`;

  // Only links that carry the ticket, which is what ticketChainIds() walks.
  const links = await sql`
    select item_a_id, item_b_id from public.item_links where not ('ticket' = any (excluded))`;

  const neighbours = new Map();
  const connect = (a, b) => {
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    neighbours.get(a).add(b);
  };
  for (const link of links) {
    connect(link.item_a_id, link.item_b_id);
    connect(link.item_b_id, link.item_a_id);
  }

  /** Everything reachable from this task across links that carry the ticket. */
  const chainOf = (id) => {
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      for (const next of neighbours.get(queue.shift()) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen;
  };

  const byTicket = new Map();
  for (const item of items) {
    if (!byTicket.has(item.ticket)) byTicket.set(item.ticket, []);
    byTicket.get(item.ticket).push(item);
  }

  const renumber = [];
  for (const [ticket, holders] of byTicket) {
    if (holders.length < 2) continue;
    const chains = [];
    const placed = new Set();
    for (const holder of holders) {
      if (placed.has(holder.id)) continue;
      const chain = chainOf(holder.id);
      const members = holders.filter((h) => chain.has(h.id));
      for (const member of members) placed.add(member.id);
      chains.push(members);
    }
    // The first chain is the one with the oldest task. It keeps the code.
    for (const chain of chains.slice(1)) {
      renumber.push({ from: ticket, ids: chain.map((c) => c.id), names: chain.map((c) => c.name), workspaceId: chain[0].workspace_id });
    }
  }

  if (renumber.length === 0) {
    console.log("Nothing holds a ticket it is not entitled to share. No writes.");
    process.exit(0);
  }

  for (const row of renumber) console.log(`  ${row.from}  ${row.names.join(" + ")}`);
  console.log(`\n${renumber.length} chain${renumber.length === 1 ? "" : "s"} to renumber.`);
  if (!apply) {
    console.log("Nothing written. Pass --apply to renumber.");
    process.exit(0);
  }

  // One workspace at a time: the counter each number comes from is its own.
  const byWorkspace = new Map();
  for (const row of renumber) {
    if (!byWorkspace.has(row.workspaceId)) byWorkspace.set(row.workspaceId, []);
    byWorkspace.get(row.workspaceId).push(row);
  }

  console.log("");
  for (const [workspaceId, rows] of byWorkspace) {
    await sql.begin(async (tx) => {
      const [workspace] = await tx`
        update public.workspaces
           set ticket_counter = coalesce(ticket_counter, 0) + ${rows.length}, updated_at = now()
         where id = ${workspaceId}
         returning ticket_counter - ${rows.length} + 1 as first, coalesce(ticket_prefix, 'CP') as prefix`;
      let number = Number(workspace.first);
      for (const row of rows) {
        const ticket = `${workspace.prefix}_${String(number).padStart(3, "0")}`;
        await tx`update public.items set ticket = ${ticket} where id = any (${row.ids}::uuid[])`;
        console.log(`  ${row.from} -> ${ticket}  ${row.names.join(" + ")}`);
        number += 1;
      }
    });
  }
} finally {
  await sql.end();
}
