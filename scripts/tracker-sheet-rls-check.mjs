// Tracker sheets as task assets (migration 0108, policies 0026), checked as
// each kind of person against the DISPOSABLE local stack. Refuses to run
// against anything but 127.0.0.1. Everything happens inside one transaction
// that is rolled back, each check in a savepoint of its own.
//
//   node scripts/tracker-sheet-rls-check.mjs      (from the disposable worktree)
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

try {
  await sql.begin(async (tx) => {
    const [ws] = await tx`select id from workspaces order by created_at limit 1`;
    const members = await tx`select p.id, p.email from profiles p join workspace_members m on m.user_id = p.id where m.workspace_id = ${ws.id} and m.role = 'MEMBER' and m.status = 'ACTIVE' order by p.email limit 2`;
    if (members.length < 2) throw new Error("Need two active members in the seeded workspace");
    const [owner, outsider] = members;

    // A private board of owner's with one task, and a tracker with two sheets.
    const [board] = await tx`insert into boards (workspace_id, name, slug, owner_id, visibility) values (${ws.id}, 'RLS sheet board', ${"rls-sheet-" + Date.now()}, ${owner.id}, 'PRIVATE') returning id`;
    const [group] = await tx`insert into board_groups (board_id, name, position) values (${board.id}, 'G', 0) returning id`;
    const [item] = await tx`insert into items (board_id, group_id, name, position, created_by) values (${board.id}, ${group.id}, 'Kit', 0, ${owner.id}) returning id`;
    const [item2] = await tx`insert into items (board_id, group_id, name, position, created_by) values (${board.id}, ${group.id}, 'Kit two', 1, ${owner.id}) returning id`;
    const [tracker] = await tx`insert into trackers (workspace_id, name, created_by) values (${ws.id}, 'RLS tracker', ${owner.id}) returning id`;
    const [sheet] = await tx`insert into tracker_sheets (tracker_id, name, columns, rows) values (${tracker.id}, 'S1', '[]'::jsonb, '[]'::jsonb) returning id, updated_at`;
    const [sheet2] = await tx`insert into tracker_sheets (tracker_id, name, columns, rows, position) values (${tracker.id}, 'S2', '[]'::jsonb, '[]'::jsonb, 1) returning id`;

    /** Runs `fn` as `user` in a savepoint; returns { rows } or { error }. */
    const as = async (user, fn) => {
      try {
        let rows;
        await tx.savepoint(async (sp) => {
          await sp.unsafe(`set local role authenticated`);
          await sp.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user.id, role: "authenticated" })]);
          rows = await fn(sp);
          await sp.unsafe(`reset role`);
        });
        return { rows };
      } catch (e) {
        await tx.unsafe(`reset role`).catch(() => {});
        return { error: e.message };
      }
    };

    // Linking
    let r = await as(outsider, (sp) => sp`update tracker_sheets set item_id = ${item.id} where id = ${sheet.id} returning id`);
    check("Somebody who cannot edit the task cannot link a sheet to it", !!r.error || r.rows.length === 0, r.error?.slice(0, 70) ?? `${r.rows?.length} rows`);
    r = await as(owner, (sp) => sp`update tracker_sheets set item_id = ${item.id} where id = ${sheet.id} returning id`);
    check("The task's editor links the sheet", !r.error && r.rows.length === 1, r.error?.slice(0, 70));
    await tx`update tracker_sheets set item_id = ${item.id} where id = ${sheet.id}`;

    r = await as(owner, (sp) => sp`update tracker_sheets set item_id = ${item.id} where id = ${sheet2.id} returning id`);
    check("A task takes one sheet: a second link is refused", !!r.error && /unique|duplicate/i.test(r.error), r.error?.slice(0, 70));

    // Editing a linked sheet
    r = await as(outsider, (sp) => sp`update tracker_sheets set rows = '[{"id":"x","kind":"data","cells":{}}]'::jsonb where id = ${sheet.id} returning id`);
    check("A tracker editor who cannot edit the task cannot change its sheet", !!r.error || r.rows.length === 0, r.error?.slice(0, 70) ?? `${r.rows?.length} rows`);
    r = await as(outsider, (sp) => sp`update tracker_sheets set rows = '[]'::jsonb where id = ${sheet2.id} returning id`);
    check("…but still edits the tracker's unlinked sheets", !r.error && r.rows.length === 1, r.error?.slice(0, 70));
    r = await as(owner, (sp) => sp`update tracker_sheets set name = 'S1 renamed' where id = ${sheet.id} returning id`);
    check("The task's editor changes the linked sheet", !r.error && r.rows.length === 1, r.error?.slice(0, 70));

    // The save only lands on the version it was made from.
    // (One transaction has one now(), so an older version is simulated by an older stamp.)
    r = await as(owner, (sp) => sp`update tracker_sheets set frozen_columns = 2 where id = ${sheet.id} and updated_at = '2000-01-01T00:00:00Z' returning id`);
    check("A save made from an old version matches nothing", !r.error && r.rows.length === 0, r.error?.slice(0, 70));
    // As text, the way the app holds it: a JS Date would round off the microseconds.
    const [stamp] = await tx`select updated_at::text as at from tracker_sheets where id = ${sheet.id}`;
    r = await as(owner, (sp) => sp`update tracker_sheets set frozen_columns = 2 where id = ${sheet.id} and updated_at = ${stamp.at}::text::timestamptz returning id`);
    check("…and one made from the current version lands", !r.error && r.rows.length === 1, r.error?.slice(0, 70) ?? `${r.rows?.length} rows at ${stamp.at}`);

    // Inserting
    r = await as(owner, (sp) => sp`insert into tracker_sheets (tracker_id, name, item_id) values (${tracker.id}, 'Born linked', ${item2.id}) returning id`);
    check("A sheet is never created linked", !!r.error, r.error?.slice(0, 70));

    // Deleting
    r = await as(outsider, (sp) => sp`delete from tracker_sheets where id = ${sheet.id} returning id`);
    check("A tracker editor who cannot edit the task cannot delete its sheet", !r.error && r.rows.length === 0, r.error?.slice(0, 70) ?? `${r.rows?.length} rows`);
    r = await as(outsider, (sp) => sp`delete from trackers where id = ${tracker.id} returning id`);
    check("…nor the tracker holding it", !r.error && r.rows.length === 0, r.error?.slice(0, 70) ?? `${r.rows?.length} rows`);

    // The lines
    r = await as(owner, (sp) => sp`insert into item_assets (item_id, board_id, name, created_by, tracker_sheet_id, tracker_row_id) values (${item.id}, ${board.id}, 'Row one', ${owner.id}, ${sheet.id}, 'r1') returning id`);
    check("The task's editor writes the sheet's lines", !r.error && r.rows.length === 1, r.error?.slice(0, 70));
    r = await as(owner, (sp) => sp`insert into item_assets (item_id, board_id, name, created_by, tracker_sheet_id, tracker_row_id) values (${item.id}, ${board.id}, 'Again', ${owner.id}, ${sheet.id}, 'r1') returning id`);
    check("One line a sheet row", !!r.error && /unique|duplicate/i.test(r.error), r.error?.slice(0, 70));
    r = await as(owner, (sp) => sp`insert into item_assets (item_id, board_id, name, created_by) values (${item.id}, ${board.id}, 'By hand', ${owner.id}), (${item.id}, ${board.id}, 'By hand too', ${owner.id}) returning id`);
    check("Lines added by hand never collide", !r.error && r.rows.length === 2, r.error?.slice(0, 70));
    r = await as(outsider, (sp) => sp`select id from item_assets where tracker_sheet_id = ${sheet.id}`);
    check("Somebody who cannot see the task does not see its sheet's lines", !r.error && r.rows.length === 0, r.error?.slice(0, 70));

    r = await as(owner, (sp) => sp`delete from tracker_sheets where id = ${sheet.id} returning id`);
    const [{ n: left }] = await tx`select count(*)::int as n from item_assets where tracker_sheet_id = ${sheet.id}`;
    check("Deleting the sheet takes its lines with it", !r.error && r.rows.length === 1 && left === 0, r.error?.slice(0, 70) ?? `${left} left`);

    // A deleted task lets go of its sheet.
    await tx`update tracker_sheets set item_id = ${item2.id} where id = ${sheet2.id}`;
    await tx`delete from items where id = ${item2.id}`;
    const [after] = await tx`select item_id from tracker_sheets where id = ${sheet2.id}`;
    check("Deleting the task unlinks its sheet", after.item_id === null);

    throw new Error("__rollback__");
  });
} catch (e) {
  if (e.message !== "__rollback__") {
    console.error(e);
    failed += 1;
  }
}
console.log(results.join("\n"));
console.log(failed ? `\n${failed} FAILED` : `\nAll ${results.length} passed`);
await sql.end();
process.exit(failed ? 1 : 0);
