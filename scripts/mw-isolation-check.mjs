// Cross-workspace isolation, table by table, against the DISPOSABLE local
// stack. One transaction, rolled back at the end: nothing it writes stays.
//
// Workspace A is the seeded one. Workspace B is built here with a bit of
// everything in it, and Tom is moved to B only. Then every table is read, and
// written, as each kind of person:
//   emily  admin of A only      jun  member of A only     ben  guest of A only
//   tom    member of B only     sarah admin of A and B    danh Owner
import postgres from "postgres";
import { readFileSync } from "node:fs";

const url = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/SUPABASE_DB_URL=(.*)/)[1].trim();
if (!url.includes("127.0.0.1")) throw new Error("Refusing: not the local stack");
const sql = postgres(url, { max: 1, onnotice: () => {} });

let failed = 0;
const lines = [];
const check = (name, ok, detail = "") => {
  lines.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
};

const people = Object.fromEntries((await sql`select id, split_part(email, '@', 1) as key from profiles`).map((p) => [p.key, p.id]));
const { danh, emily, jun, ben, tom, sarah } = people;
const [{ id: A }] = await sql`select id from workspaces order by created_at limit 1`;

try {
  await sql.begin(async (tx) => {
    // ---- build B ---------------------------------------------------------------
    const [{ id: B }] = await tx`insert into workspaces (name, slug) values ('Iso B', 'iso-b') returning id`;
    await tx`delete from team_members where user_id = ${tom}`;
    await tx`delete from board_members where user_id = ${tom}`;
    await tx`delete from workspace_members where user_id = ${tom} and workspace_id = ${A}`;
    await tx`insert into workspace_members (workspace_id, user_id, role, status) values (${B}, ${tom}, 'MEMBER', 'ACTIVE'), (${B}, ${sarah}, 'ADMIN', 'ACTIVE')`;
    const [team] = await tx`insert into teams (workspace_id, name) values (${B}, 'B team') returning id`;
    await tx`insert into team_members (team_id, user_id, role) values (${team.id}, ${tom}, 'MEMBER')`;
    const [board] = await tx`insert into boards (workspace_id, name, slug, owner_id, visibility) values (${B}, 'B board', 'b-board', ${danh}, 'WORKSPACE') returning id`;
    const [privateBoard] = await tx`insert into boards (workspace_id, name, slug, owner_id, visibility) values (${B}, 'B private', 'b-private', ${danh}, 'PRIVATE') returning id`;
    const [group] = await tx`insert into board_groups (board_id, name, position) values (${board.id}, 'G', 0) returning id`;
    const [column] = await tx`insert into board_columns (board_id, name, type, settings, position) values (${board.id}, 'Notes', 'TEXT', '{"kind":"none"}'::jsonb, 0) returning id`;
    const [item] = await tx`insert into items (board_id, group_id, name, position, created_by) values (${board.id}, ${group.id}, 'B task', 0, ${danh}) returning id`;
    await tx`insert into item_column_values (item_id, column_id, value_json) values (${item.id}, ${column.id}, ${tx.json({ type: "TEXT", text: "secret of B" })})`;
    await tx`insert into comments (item_id, author_id, body) values (${item.id}, ${danh}, 'B update')`;
    await tx`insert into item_assets (item_id, board_id, name, created_by) values (${item.id}, ${board.id}, 'B poster', ${danh})`;
    await tx`insert into activities (workspace_id, board_id, item_id, actor_id, event_type, metadata) values (${B}, ${board.id}, ${item.id}, ${danh}, 'ITEM_CREATED', '{}'::jsonb)`;
    const [tracker] = await tx`insert into trackers (workspace_id, name, created_by) values (${B}, 'B tracker', ${danh}) returning id`;
    await tx`insert into tracker_sheets (tracker_id, name) values (${tracker.id}, 'Sheet')`;
    await tx`insert into workspace_lists (workspace_id, list_key, name, color, position) values (${B}, 'ASSET_TYPES', 'B type', 'red', 0)`;
    await tx`insert into booking_templates (workspace_id, name, template, created_by) values (${B}, 'B form', '{}'::jsonb, ${danh})`;
    await tx`insert into board_templates (workspace_id, name, spec, created_by) values (${B}, 'B layout', '{}'::jsonb, ${danh})`;
    await tx`insert into booking_saved_blocks (workspace_id, name, block, created_by) values (${B}, 'B block', '{}'::jsonb, ${danh})`;
    await tx`insert into direct_messages (workspace_id, sender_id, recipient_id, body) values (${B}, ${danh}, ${tom}, 'hello in B')`;
    await tx`insert into notifications (user_id, type, title, entity_type, entity_id, board_id) values (${tom}, 'COMMENT', 'B note', 'ITEM', ${item.id}, ${board.id})`;
    await tx`insert into board_members (board_id, user_id, role) values (${privateBoard.id}, ${sarah}, 'VIEWER')`;
    // B's own portal and department registry.
    const [dept] = await tx`insert into stakeholder_departments (workspace_id, name, color, position, status) values (${B}, 'Comm.', 'blue', 0, 'ACTIVE') returning id`;
    const [portal] = await tx`insert into department_portals (workspace_id, department_id, token, enabled) values (${B}, null, 'isobportal000000000000000001', true) returning id`;
    // Jun is in A and, for these checks, in B as well.
    await tx`insert into workspace_members (workspace_id, user_id, role, status) values (${B}, ${jun}, 'MEMBER', 'ACTIVE')`;

    // What belongs to B, by the column that says so.
    const Bboards = [board.id, privateBoard.id];
    const Bitems = [item.id];
    const owned = {
      workspaces: ["id", [B]],
      workspace_members: ["workspace_id", [B]],
      teams: ["workspace_id", [B]],
      team_members: ["team_id", [team.id]],
      boards: ["workspace_id", [B]],
      board_members: ["board_id", Bboards],
      board_groups: ["board_id", Bboards],
      board_columns: ["board_id", Bboards],
      items: ["board_id", Bboards],
      item_column_values: ["item_id", Bitems],
      comments: ["item_id", Bitems],
      item_assets: ["board_id", Bboards],
      activities: ["workspace_id", [B]],
      trackers: ["workspace_id", [B]],
      tracker_sheets: ["tracker_id", [tracker.id]],
      workspace_lists: ["workspace_id", [B]],
      booking_templates: ["workspace_id", [B]],
      board_templates: ["workspace_id", [B]],
      booking_saved_blocks: ["workspace_id", [B]],
      direct_messages: ["workspace_id", [B]],
      notifications: ["workspace_id", [B]],
      stakeholder_departments: ["id", [dept.id]],
      department_portals: ["id", [portal.id]],
    };
    // And what belongs to A, for the other direction.
    const Aboards = (await tx`select id from boards where workspace_id = ${A}`).map((r) => r.id);
    const Ateams = (await tx`select id from teams where workspace_id = ${A}`).map((r) => r.id);

    async function as(user, fn) {
      await tx.unsafe("set local role authenticated");
      await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: "authenticated" })]);
      try {
        return await fn();
      } finally {
        await tx.unsafe("reset role");
      }
    }
    /** Runs a write that should be refused, in a savepoint so the refusal does not end the transaction. Returns rows touched, or -1 when it raised. */
    async function attempt(user, query) {
      try {
        return await tx.savepoint(async (sp) => {
          await sp.unsafe("set local role authenticated");
          await sp.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: "authenticated" })]);
          const rows = await query(sp);
          await sp.unsafe("reset role");
          return rows.count ?? rows.length;
        });
      } catch {
        return -1;
      }
    }
    async function visible(user) {
      return as(user, async () => {
        const out = {};
        for (const [table, [column, ids]] of Object.entries(owned)) {
          const [{ n }] = await tx.unsafe(`select count(*)::int as n from public.${table} where ${column} = any($1::uuid[])`, [ids]);
          out[table] = n;
        }
        return out;
      });
    }

    // ---- nobody outside B sees any of it -----------------------------------------
    for (const [name, user] of [["emily (admin of A)", emily], ["ben (guest of A)", ben]]) {
      const seen = await visible(user);
      const leaks = Object.entries(seen).filter(([, n]) => n > 0);
      check(`${name} sees nothing of B, in any of ${Object.keys(owned).length} tables`, leaks.length === 0, leaks.map(([t, n]) => `${t}:${n}`).join(" "));
      check(`${name} cannot add a board to B`, (await attempt(user, (sp) => sp`insert into boards (workspace_id, name, slug, owner_id, visibility) values (${B}, 'x', ${`x-${name.length}`}, ${user}, 'WORKSPACE')`)) === -1);
      check(`${name} cannot add a task to B's board`, (await attempt(user, (sp) => sp`insert into items (board_id, group_id, name, position, created_by) values (${board.id}, ${group.id}, 'x', 1, ${user})`)) === -1);
      check(`${name} cannot change B's board`, (await attempt(user, (sp) => sp`update boards set name = 'hijacked' where id = ${board.id} returning id`)) <= 0);
      check(`${name} cannot delete B's task`, (await attempt(user, (sp) => sp`delete from items where id = ${item.id} returning id`)) <= 0);
      check(`${name} cannot post in B`, (await attempt(user, (sp) => sp`insert into comments (item_id, author_id, body) values (${item.id}, ${user}, 'x')`)) === -1);
      check(`${name} cannot add themselves to B`, (await attempt(user, (sp) => sp`insert into workspace_members (workspace_id, user_id, role, status) values (${B}, ${user}, 'ADMIN', 'ACTIVE')`)) === -1);
      check(`${name} cannot rename B`, (await attempt(user, (sp) => sp`update workspaces set name = 'hijacked' where id = ${B} returning id`)) <= 0);
      check(`${name} cannot change B's lists`, (await attempt(user, (sp) => sp`insert into workspace_lists (workspace_id, list_key, name, color, position) values (${B}, 'ASSET_TYPES', 'x', 'red', 9)`)) === -1);
      check(`${name} cannot make a team in B`, (await attempt(user, (sp) => sp`insert into teams (workspace_id, name) values (${B}, 'x')`)) === -1);
      check(`${name} cannot message anyone as B`, (await attempt(user, (sp) => sp`insert into direct_messages (workspace_id, sender_id, recipient_id, body) values (${B}, ${user}, ${danh}, 'x')`)) === -1);
    }

    // ---- a member of B only sees B, and none of A -------------------------------
    const tomSees = await visible(tom);
    check("tom (B only) sees B's workspace, board, task, team and his own messages", tomSees.workspaces === 1 && tomSees.items === 1 && tomSees.teams === 1 && tomSees.direct_messages === 1 && tomSees.notifications === 1, JSON.stringify(tomSees));
    check("tom does not see B's private board", tomSees.boards === 1, `${tomSees.boards} boards`);
    const tomA = await as(tom, async () => {
      const [boards] = await tx`select count(*)::int as n from boards where id = any(${Aboards}::uuid[])`;
      const [teams] = await tx`select count(*)::int as n from teams where id = any(${Ateams}::uuid[])`;
      const [items] = await tx`select count(*)::int as n from items where board_id = any(${Aboards}::uuid[])`;
      const [members] = await tx`select count(*)::int as n from workspace_members where workspace_id = ${A}`;
      const [ws] = await tx`select count(*)::int as n from workspaces where id = ${A}`;
      const [acts] = await tx`select count(*)::int as n from activities where workspace_id = ${A}`;
      const [lists] = await tx`select count(*)::int as n from workspace_lists where workspace_id = ${A}`;
      const [dms] = await tx`select count(*)::int as n from direct_messages where workspace_id = ${A}`;
      const [profiles] = await tx`select count(*)::int as n from profiles`;
      return { boards: boards.n, teams: teams.n, items: items.n, members: members.n, ws: ws.n, acts: acts.n, lists: lists.n, dms: dms.n, profiles: profiles.n };
    });
    const [{ n: allProfiles }] = await tx`select count(*)::int as n from profiles`;
    check("tom sees nothing of A: boards, tasks, teams, members, activity, lists, messages", Object.entries(tomA).every(([k, n]) => k === "profiles" || n === 0), JSON.stringify(tomA));
    check("tom reads the whole directory of people", tomA.profiles === allProfiles, `${tomA.profiles}/${allProfiles}`);
    check("tom, a member, cannot change B's board", (await attempt(tom, (sp) => sp`update boards set name = 'x' where id = ${board.id} returning id`)) <= 0);
    check("tom cannot see another person's notification", (await as(tom, async () => (await tx`select count(*)::int as n from notifications where user_id <> ${tom}`)[0].n)) === 0);

    // ---- an admin of both sees both, and runs B -----------------------------------
    const sarahSees = await visible(sarah);
    check("sarah (admin of A and B) sees B's rows, the private board she has a seat on included", sarahSees.boards === 2 && sarahSees.items === 1 && sarahSees.trackers === 1, JSON.stringify(sarahSees));
    check("sarah does not read the messages and notifications of others", sarahSees.direct_messages === 0 && sarahSees.notifications === 0);
    check("sarah can rename B's board", (await attempt(sarah, (sp) => sp`update boards set name = 'renamed' where id = ${board.id} returning id`)) === 1);
    check("sarah still cannot touch an Owner's seat in B", (await attempt(sarah, (sp) => sp`update workspace_members set role = 'MEMBER' where workspace_id = ${B} and user_id = ${danh} returning id`)) === -1);
    check("sarah cannot delete B", (await attempt(sarah, (sp) => sp`delete from workspaces where id = ${B} returning id`)) <= 0);

    // ---- messages and notifications stay in their workspace ---------------------
    check("sarah cannot file a message under A to tom, who is in B only", (await attempt(sarah, (sp) => sp`insert into direct_messages (workspace_id, sender_id, recipient_id, body) values (${A}, ${sarah}, ${tom}, 'x')`)) === -1);
    check("sarah can message tom under B", (await attempt(sarah, (sp) => sp`insert into direct_messages (workspace_id, sender_id, recipient_id, body) values (${B}, ${sarah}, ${tom}, 'x')`)) !== -1);
    check("sarah cannot notify tom about A's board", (await attempt(sarah, (sp) => sp`insert into notifications (user_id, type, title, entity_type, entity_id, board_id, actor_id) values (${tom}, 'COMMENT', 'x', 'BOARD', ${Aboards[0]}, ${Aboards[0]}, ${sarah})`)) === -1);
    check("sarah can notify tom about B's board", (await attempt(sarah, (sp) => sp`insert into notifications (user_id, type, title, entity_type, entity_id, board_id, actor_id) values (${tom}, 'COMMENT', 'x', 'BOARD', ${board.id}, ${board.id}, ${sarah})`)) !== -1);
    check("emily cannot notify tom at all", (await attempt(emily, (sp) => sp`insert into notifications (user_id, type, title, entity_type, entity_id, board_id, actor_id) values (${tom}, 'COMMENT', 'x', 'BOARD', ${board.id}, ${board.id}, ${emily})`)) === -1);

    // ---- boards, tasks and rules stay in their workspace -----------------------
    const [aItem] = await tx`select id, board_id from items where board_id = any(${Aboards}::uuid[]) and parent_item_id is null limit 1`;
    check("An admin of both cannot move A's board into B", (await attempt(sarah, (sp) => sp`update boards set workspace_id = ${B} where id = ${aItem.board_id} returning id`)) === -1);
    check("Nor can an Owner", (await attempt(danh, (sp) => sp`update boards set workspace_id = ${B} where id = ${aItem.board_id} returning id`)) === -1);
    check("A board cannot take another workspace's team", (await attempt(danh, (sp) => sp`update boards set team_id = ${team.id} where id = ${aItem.board_id} returning id`)) === -1);
    check("A task cannot move to another workspace's board", (await attempt(danh, (sp) => sp`update items set board_id = ${board.id}, group_id = ${group.id} where id = ${aItem.id} returning id`)) === -1);
    check("A rule cannot sit in one workspace on another's board", (await attempt(danh, (sp) => sp`insert into automation_rules (workspace_id, board_id, name, trigger_json) values (${A}, ${board.id}, 'x', '{}'::jsonb)`)) === -1);
    check("A task still moves between boards of one workspace", (await attempt(danh, async (sp) => {
      const [other] = await sp`select b.id as board_id, g.id as group_id from boards b join board_groups g on g.board_id = b.id where b.workspace_id = ${A} and b.id <> ${aItem.board_id} and b.system is null limit 1`;
      return sp`update items set board_id = ${other.board_id}, group_id = ${other.group_id} where id = ${aItem.id} returning id`;
    })) === 1);

    // ---- profiles: one account, edited by whoever runs all of its workspaces ----
    check("emily (admin of A only) cannot edit tom, who is in B only", (await attempt(emily, (sp) => sp`update profiles set job_title = 'x' where id = ${tom} returning id`)) <= 0);
    check("emily cannot edit jun, who is also active in B, where she is not admin", (await attempt(emily, (sp) => sp`update profiles set job_title = 'x' where id = ${jun} returning id`)) <= 0);
    check("sarah (admin of A and B) cannot edit jun's details now he has joined", (await attempt(sarah, (sp) => sp`update profiles set job_title = 'Producer' where id = ${jun} returning id`)) === -1);
    check("…nor his email", (await attempt(sarah, (sp) => sp`update profiles set email = 'someone.else@rmit.local' where id = ${jun} returning id`)) === -1);
    check("Nor can an Owner", (await attempt(danh, (sp) => sp`update profiles set job_title = 'x' where id = ${jun} returning id`)) === -1);
    check("sarah can still switch jun's account off and on (deactivation)", (await attempt(sarah, (sp) => sp`update profiles set deactivated_at = now() where id = ${jun} returning id`)) === 1);
    check("A person can edit themselves", (await attempt(tom, (sp) => sp`update profiles set job_title = 'Me' where id = ${tom} returning id`)) === 1);
    const [pending] = await tx`select m.user_id from workspace_members m where m.workspace_id = ${A} and m.status = 'INVITED' and not exists (select 1 from workspace_members o where o.user_id = m.user_id and o.status <> 'INVITED') limit 1`;
    if (pending) check("An admin fills in the details of somebody still pending", (await attempt(emily, (sp) => sp`update profiles set job_title = 'Designer' where id = ${pending.user_id} returning id`)) === 1);

    // ---- comments: the author, or an admin who is on that board ------------------
    const [onBoard] = await tx`insert into comments (item_id, author_id, body) values (${item.id}, ${tom}, 'tom in B') returning id`;
    check("sarah, an admin of B with no seat on B's board, cannot delete tom's update", (await attempt(sarah, (sp) => sp`delete from comments where id = ${onBoard.id} returning id`)) <= 0);
    await tx`insert into board_members (board_id, user_id, role) values (${board.id}, ${sarah}, 'EDITOR')`;
    check("…and can once she is a member of that board", (await attempt(sarah, (sp) => sp`delete from comments where id = ${onBoard.id} returning id`)) === 1);
    const [second] = await tx`insert into comments (item_id, author_id, body) values (${item.id}, ${tom}, 'tom again') returning id`;
    check("danh, the board's owner and an Owner, can", (await attempt(danh, (sp) => sp`delete from comments where id = ${second.id} returning id`)) === 1);
    const [third] = await tx`insert into comments (item_id, author_id, body) values (${item.id}, ${tom}, 'tom once more') returning id`;
    check("tom, the author, can", (await attempt(tom, (sp) => sp`delete from comments where id = ${third.id} returning id`)) === 1);

    // ---- the portal and the booking link are B's -----------------------------------
    check("B's portal row is B's admins' alone: tom (a member) does not see it", tomSees.department_portals === 0);
    const sarahPortal = await as(sarah, async () => (await tx`select count(*)::int as n from department_portals where id = ${portal.id}`)[0].n);
    check("…and sarah, an admin of B, does", sarahPortal === 1);
    check("An admin of A cannot open B's portal row", (await attempt(emily, (sp) => sp`update department_portals set enabled = false where id = ${portal.id} returning id`)) <= 0);
    const [aBooking] = await tx`select booking_key from workspaces where id = ${A}`;
    const [bBooking] = await tx`select booking_key from workspaces where id = ${B}`;
    check("B has its own booking link, not A's", !aBooking.booking_key || bBooking.booking_key !== aBooking.booking_key);

    // ---- the Owner sees every workspace ----------------------------------------
    const danhSees = await visible(danh);
    check("danh (Owner) sees B without being added", danhSees.workspaces === 1 && danhSees.boards === 2 && danhSees.items === 1, JSON.stringify(danhSees));
    check("danh can delete B", (await attempt(danh, (sp) => sp`delete from workspaces where id = ${B} returning id`)) === 1);

    throw new Error("__rollback__");
  });
} catch (e) {
  if (e.message !== "__rollback__") {
    console.error(e);
    failed += 1;
  }
}

console.log(lines.join("\n"));
console.log(`\n${lines.length - (failed - lines.filter((l) => l.startsWith("FAIL")).length) - lines.filter((l) => l.startsWith("FAIL")).length}/${lines.length} passed`);
await sql.end();
process.exit(failed ? 1 : 0);
