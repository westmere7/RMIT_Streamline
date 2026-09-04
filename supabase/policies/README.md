# Row Level Security – assumptions and notes

`0001_rls_policies.sql` is the database-side twin of
`src/lib/permissions/permissions.ts`. When one changes, change the other.

## Identity

- **`auth.uid()` = `public.profiles.id`.** Every `user_id`, `owner_id`,
  `actor_id`, `author_id`, `created_by` column references `profiles.id`, which is
  itself a foreign key to `auth.users.id`. The `handle_new_user()` trigger creates
  the profile row on sign-up; the app never inserts profiles itself (a self-insert
  policy exists only as a fallback).
- All policies are granted to the `authenticated` role. The `anon` role has no
  access to any table; unauthenticated visitors see nothing.
- **The service role bypasses RLS.** Seeding (`supabase/seed.sql`), migrations and
  any server-side maintenance run with the service key or as `postgres`. Never
  ship the service key to the browser.

## Helper functions (`private` schema)

| Function | Mirrors |
| --- | --- |
| `private.workspace_role(ws)` | `PermissionContext.workspaceRole` (ACTIVE membership only) |
| `private.is_workspace_member(ws)` | `workspaceRole !== null` |
| `private.is_workspace_admin(ws)` | `isWorkspaceAdmin` (OWNER or ADMIN) |
| `private.can_create_board(ws)` | `canCreateBoard` (any role except GUEST) |
| `private.can_create_team(ws)` | `canCreateTeam` (OWNER, ADMIN, MEMBER) |
| `private.is_team_member(team)` | `ctx.teamIds.has(teamId)` |
| `private.can_manage_team(team)` | `canManageTeam` |
| `private.board_role(board)` | `boardRoleFor` (same check order) |
| `private.can_view_board(board)` | `canViewBoard` |
| `private.can_edit_board(board)` | `canEditBoard` (OWNER or EDITOR) |
| `private.can_manage_board(board)` | `canManageBoard` (OWNER role or workspace admin) |
| `private.can_delete_board(board)` | `canDeleteBoard` (literal owner or workspace admin) |
| `private.can_view_item / can_edit_item(item)` | board checks via `items.board_id` |
| `private.can_delete_comment(item, author)` | `canDeleteComment` |
| `private.shares_workspace_with(user)` | used for profile visibility and notification fan-out |
| `private.workspace_has_members(ws)` | bootstrap check for the first OWNER row |

They are `SECURITY DEFINER` so they can read `workspace_members`, `team_members`,
`board_members` and `boards` without recursing into those tables' own policies.
`search_path` is pinned to `public, pg_temp`. The `private` schema is not in the
PostgREST exposed-schema list, so the helpers are not reachable as RPC.

Policies use `(select auth.uid())` rather than `auth.uid()` so the planner
evaluates it once per statement instead of once per row.

## How visibility interacts with membership

`board_role()` resolves in this order, exactly like `boardRoleFor`:

1. `boards.owner_id = auth.uid()` → `OWNER` (regardless of workspace status).
2. An explicit `board_members` row → that role (`OWNER` / `EDITOR` / `VIEWER`).
   An explicit `VIEWER` row therefore *downgrades* someone who would otherwise
   inherit `EDITOR` from visibility.
3. Workspace `OWNER`/`ADMIN` → `EDITOR` on every board (they can also manage it
   via `can_manage_board`).
4. No ACTIVE workspace membership → `null` (no access).
5. Visibility:
   - `WORKSPACE` → `EDITOR` for every member except `GUEST`.
   - `TEAM` → `EDITOR` if the user is in `boards.team_id`; otherwise `null`.
   - `PRIVATE` → `null`.

Consequences:

- **Private boards** are visible only to the owner, explicit members, and
  workspace admins.
- **Team boards** are visible to team members; anyone else needs an explicit
  `board_members` row (this is how the seed grants `VIEWER` access to the
  Masterclass and DOOH boards).
- **Guests** see only boards they own or are explicitly added to. They cannot
  create boards or teams. They can still read workspace-level rows (workspace,
  member list, teams, profiles of colleagues, activity feed) because they are
  ACTIVE members.
- `INVITED` and `DEACTIVATED` members have no workspace access at all; the app
  should treat those states in the UI, but the database enforces it too.
- Groups, columns, items, values and comments inherit the board decision: read
  needs `can_view_board`, write needs `can_edit_board`. `VIEWER` is read-only.
- Comments: editors may insert as themselves; only the author may update; the
  author or a workspace admin may delete.
- Board membership rows are managed by `can_manage_board` (owner or admin), and
  a user may always delete their own membership (leave).
- Team deletion is admin-only even though `canManageTeam` also covers team
  members; members should archive instead. Adjust `teams_delete` if that is
  too strict.

## Per-user tables

`board_favourites`, `board_visits` and `notifications` are keyed on
`user_id = auth.uid()`; nobody else can read them. Inserting a favourite or a
visit additionally requires `can_view_board`, so a user cannot probe for the
existence of hidden boards.

Notifications are created by the *acting* user for the recipient (mention,
assignment, etc.). The insert policy requires `actor_id = auth.uid()` and that
the recipient shares a workspace with the actor. If that is too permissive,
move notification creation into a database trigger or an Edge Function running
with the service role and drop `notifications_insert`.

## Activities

The feed is append-only from the client: members can `insert` rows where
`actor_id = auth.uid()`, and only for boards they can see. There are no
update/delete policies, so history cannot be rewritten by users.

## Workspace bootstrap

Creating a workspace from the client is a two-step insert:

1. `insert into workspaces` (any authenticated user).
2. `insert into workspace_members (workspace_id, user_id, role)` with the caller's
   own id and `role = 'OWNER'`. `workspace_members_insert_bootstrap` allows this
   only while the workspace has zero members (checked through a SECURITY DEFINER
   helper so RLS cannot hide existing rows).

Do both in one request (an RPC or a Postgres function) if you need atomicity.

## Realtime

- RLS **is** enforced for `postgres_changes` subscriptions: a client only
  receives change events for rows its `select` policy would return. Publishing
  these tables is therefore safe.
- Add the collaborative tables to the publication (commented at the end of the
  policies file):

  ```sql
  alter publication supabase_realtime add table
    public.items, public.item_column_values, public.comments,
    public.activities, public.notifications;
  ```

- Realtime evaluates the policy per subscriber per change. Because
  `board_role()` does three or four indexed lookups, this is cheap, but keep an
  eye on it for very active boards. `replica identity full` is only needed if you
  want old-row values on `UPDATE`/`DELETE` events (not required for the current
  client, which refetches on change).
- `DELETE` events are not filtered by RLS (Postgres does not have the old row
  to evaluate the policy against). On RLS-enabled tables Realtime therefore
  sends only the primary key of the deleted row, so nothing beyond the id can
  leak. Prefer soft-deletes (`archived_at`) for anything the UI must react to
  live; a real delete tells subscribers only *which* id vanished.

## Storage

See `supabase/README.md` for the `workspace-files` bucket and its object
policies; they reuse `private.is_workspace_member` on the first path segment.
