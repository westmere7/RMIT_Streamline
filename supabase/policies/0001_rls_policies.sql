-- =============================================================================
-- RMIT Streamline - row level security
--
-- Mirrors src/lib/permissions/permissions.ts. Each `can*` helper there has a
-- SECURITY DEFINER counterpart in the `private` schema so policies stay short
-- and never recurse into RLS-protected tables.
--
-- Conventions
--   * `(select auth.uid())` is used instead of bare `auth.uid()` so Postgres
--     evaluates it once per statement (initPlan) rather than once per row.
--   * Helper functions are STABLE + SECURITY DEFINER with a pinned search_path.
--     They are owned by the migration role, which owns the tables, so they read
--     membership tables without triggering RLS on them.
--   * `private` is not exposed by PostgREST, so helpers are not callable as RPC.
--
-- Apply after supabase/migrations/0001_initial_schema.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper schema
-- -----------------------------------------------------------------------------

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Functions default to EXECUTE for PUBLIC; tighten so only app roles can call.
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema private grant execute on functions to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Workspace helpers
-- -----------------------------------------------------------------------------

-- buildPermissionContext(): only ACTIVE memberships count.
create or replace function private.workspace_role(p_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.user_id = (select auth.uid())
    and m.status = 'ACTIVE'
  limit 1
$$;

create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.workspace_role(p_workspace_id) is not null
$$;

-- isWorkspaceAdmin(): OWNER or ADMIN.
create or replace function private.is_workspace_admin(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.workspace_role(p_workspace_id) in ('OWNER', 'ADMIN')
$$;

-- canCreateBoard(): any active member except GUEST.
create or replace function private.can_create_board(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(private.workspace_role(p_workspace_id) <> 'GUEST', false)
$$;

-- canCreateTeam(): OWNER, ADMIN or MEMBER.
create or replace function private.can_create_team(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.workspace_role(p_workspace_id) in ('OWNER', 'ADMIN', 'MEMBER')
$$;

-- True when the workspace has no members yet (used to bootstrap the first
-- OWNER row). Must be SECURITY DEFINER: a plain subquery inside the policy
-- would be filtered by RLS and look empty to any non-member.
create or replace function private.workspace_has_members(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members m where m.workspace_id = p_workspace_id
  )
$$;

-- True when the current user and p_user_id share at least one workspace
-- (either side may be any status; used for profile visibility so that invited
-- or deactivated colleagues still render with a name in history).
create or replace function private.shares_workspace_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user_id = (select auth.uid())
      or exists (
        select 1
        from public.workspace_members me
        join public.workspace_members them on them.workspace_id = me.workspace_id
        where me.user_id = (select auth.uid())
          and me.status = 'ACTIVE'
          and them.user_id = p_user_id
      )
$$;

-- -----------------------------------------------------------------------------
-- Team helpers
-- -----------------------------------------------------------------------------

create or replace function private.team_workspace(p_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.workspace_id from public.teams t where t.id = p_team_id
$$;

create or replace function private.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = (select auth.uid())
  )
$$;

-- canManageTeam(): workspace admin or a member of the team.
create or replace function private.can_manage_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_workspace_admin(private.team_workspace(p_team_id))
      or private.is_team_member(p_team_id)
$$;

-- -----------------------------------------------------------------------------
-- Board helpers
-- -----------------------------------------------------------------------------

create or replace function private.board_workspace(p_board_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.workspace_id from public.boards b where b.id = p_board_id
$$;

-- boardRoleFor(): effective role considering ownership, explicit membership,
-- workspace admin status and visibility. Order of checks matches permissions.ts.
create or replace function private.board_role(p_board_id uuid)
returns public.board_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_board    public.boards%rowtype;
  v_explicit public.board_role;
  v_ws_role  public.workspace_role;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_board from public.boards b where b.id = p_board_id;
  if not found then
    return null;
  end if;

  -- 1. Owner always has OWNER.
  if v_board.owner_id = v_uid then
    return 'OWNER';
  end if;

  -- 2. Explicit board membership wins over inherited access.
  select bm.role into v_explicit
  from public.board_members bm
  where bm.board_id = p_board_id and bm.user_id = v_uid;
  if v_explicit is not null then
    return v_explicit;
  end if;

  -- 3. Workspace admins can edit every board.
  v_ws_role := private.workspace_role(v_board.workspace_id);
  if v_ws_role in ('OWNER', 'ADMIN') then
    return 'EDITOR';
  end if;

  -- 4. Non-members get nothing.
  if v_ws_role is null then
    return null;
  end if;

  -- 5. Visibility-derived access.
  case v_board.visibility
    when 'WORKSPACE' then
      return case when v_ws_role = 'GUEST' then null else 'EDITOR' end;
    when 'TEAM' then
      return case
        when v_board.team_id is not null and private.is_team_member(v_board.team_id) then 'EDITOR'
        else null
      end;
    else -- 'PRIVATE'
      return null;
  end case;

  return null;
end;
$$;

-- canViewBoard()
create or replace function private.can_view_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.board_role(p_board_id) is not null
$$;

-- canEditBoard()
create or replace function private.can_edit_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.board_role(p_board_id) in ('OWNER', 'EDITOR')
$$;

-- canManageBoard(): OWNER role or workspace admin.
create or replace function private.can_manage_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.board_role(p_board_id) = 'OWNER'
      or private.is_workspace_admin(private.board_workspace(p_board_id))
$$;

-- canDeleteBoard(): literal owner or workspace admin.
create or replace function private.can_delete_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
           select 1 from public.boards b
           where b.id = p_board_id and b.owner_id = (select auth.uid())
         )
      or private.is_workspace_admin(private.board_workspace(p_board_id))
$$;

-- -----------------------------------------------------------------------------
-- Item helpers (values and comments hang off items, which hang off boards)
-- -----------------------------------------------------------------------------

create or replace function private.item_board(p_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.board_id from public.items i where i.id = p_item_id
$$;

create or replace function private.can_view_item(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.can_view_board(private.item_board(p_item_id))
$$;

create or replace function private.can_edit_item(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.can_edit_board(private.item_board(p_item_id))
$$;

-- canDeleteComment(): author or workspace admin of the item's workspace.
create or replace function private.can_delete_comment(p_item_id uuid, p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_author_id = (select auth.uid())
      or private.is_workspace_admin(private.board_workspace(private.item_board(p_item_id)))
$$;

-- -----------------------------------------------------------------------------
-- Enable RLS on every table
-- -----------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.workspaces         enable row level security;
alter table public.workspace_members  enable row level security;
alter table public.teams              enable row level security;
alter table public.team_members       enable row level security;
alter table public.boards             enable row level security;
alter table public.board_members      enable row level security;
alter table public.board_favourites   enable row level security;
alter table public.board_groups       enable row level security;
alter table public.board_columns      enable row level security;
alter table public.items              enable row level security;
alter table public.item_column_values enable row level security;
alter table public.comments           enable row level security;
alter table public.activities         enable row level security;
alter table public.notifications      enable row level security;
alter table public.board_visits       enable row level security;

-- =============================================================================
-- profiles
-- =============================================================================

-- Readable by yourself and by anyone who shares a workspace with you.
create policy profiles_select on public.profiles
  for select to authenticated
  using (private.shares_workspace_with(id));

-- Normally created by handle_new_user(); allow self-insert as a fallback.
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No delete policy: profiles are removed via auth.users cascade only.

-- =============================================================================
-- workspaces
-- =============================================================================

create policy workspaces_select on public.workspaces
  for select to authenticated
  using (private.is_workspace_member(id));

-- Any signed-in user may create a workspace; they must then insert their own
-- OWNER membership (see workspace_members_insert_bootstrap).
create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check ((select auth.uid()) is not null);

-- canManageWorkspace()
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (private.is_workspace_admin(id))
  with check (private.is_workspace_admin(id));

create policy workspaces_delete on public.workspaces
  for delete to authenticated
  using (private.workspace_role(id) = 'OWNER');

-- =============================================================================
-- workspace_members
-- =============================================================================

create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- canManageMembers(): admins add/invite members.
create policy workspace_members_insert_admin on public.workspace_members
  for insert to authenticated
  with check (private.is_workspace_admin(workspace_id));

-- Bootstrap: the creator of a brand-new (empty) workspace adds themselves as OWNER.
create policy workspace_members_insert_bootstrap on public.workspace_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'OWNER'
    and not private.workspace_has_members(workspace_id)
  );

create policy workspace_members_update_admin on public.workspace_members
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

-- Admins remove members; anyone may leave a workspace.
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (
    private.is_workspace_admin(workspace_id)
    or user_id = (select auth.uid())
  );

-- =============================================================================
-- teams
-- =============================================================================

create policy teams_select on public.teams
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- canCreateTeam()
create policy teams_insert on public.teams
  for insert to authenticated
  with check (private.can_create_team(workspace_id));

-- canManageTeam(): admin or team member may edit (rename, colour, archive).
create policy teams_update on public.teams
  for update to authenticated
  using (private.can_manage_team(id))
  with check (private.can_manage_team(id));

-- Hard delete is reserved for workspace admins (members archive instead).
create policy teams_delete on public.teams
  for delete to authenticated
  using (private.is_workspace_admin(workspace_id));

-- =============================================================================
-- team_members
-- =============================================================================

create policy team_members_select on public.team_members
  for select to authenticated
  using (private.is_workspace_member(private.team_workspace(team_id)));

create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (private.can_manage_team(team_id));

create policy team_members_update on public.team_members
  for update to authenticated
  using (private.can_manage_team(team_id))
  with check (private.can_manage_team(team_id));

-- Team managers remove members; anyone may leave a team.
create policy team_members_delete on public.team_members
  for delete to authenticated
  using (
    private.can_manage_team(team_id)
    or user_id = (select auth.uid())
  );

-- =============================================================================
-- boards
-- =============================================================================

-- canViewBoard(): PRIVATE boards only to owner/members/admins, TEAM boards per
-- team membership, WORKSPACE boards to every non-guest member.
create policy boards_select on public.boards
  for select to authenticated
  using (private.can_view_board(id));

-- canCreateBoard(): non-guest members create boards they own.
create policy boards_insert on public.boards
  for insert to authenticated
  with check (
    private.can_create_board(workspace_id)
    and owner_id = (select auth.uid())
  );

-- canManageBoard()
create policy boards_update on public.boards
  for update to authenticated
  using (private.can_manage_board(id))
  with check (private.can_manage_board(id));

-- canDeleteBoard()
create policy boards_delete on public.boards
  for delete to authenticated
  using (private.can_delete_board(id));

-- =============================================================================
-- board_members
-- =============================================================================

create policy board_members_select on public.board_members
  for select to authenticated
  using (private.can_view_board(board_id));

create policy board_members_insert on public.board_members
  for insert to authenticated
  with check (private.can_manage_board(board_id));

create policy board_members_update on public.board_members
  for update to authenticated
  using (private.can_manage_board(board_id))
  with check (private.can_manage_board(board_id));

create policy board_members_delete on public.board_members
  for delete to authenticated
  using (
    private.can_manage_board(board_id)
    or user_id = (select auth.uid())
  );

-- =============================================================================
-- board_favourites  (strictly per-user)
-- =============================================================================

create policy board_favourites_select on public.board_favourites
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy board_favourites_insert on public.board_favourites
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_view_board(board_id)
  );

create policy board_favourites_delete on public.board_favourites
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- board_visits  (strictly per-user)
-- =============================================================================

create policy board_visits_select on public.board_visits
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy board_visits_insert on public.board_visits
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_view_board(board_id)
  );

create policy board_visits_update on public.board_visits
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy board_visits_delete on public.board_visits
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- board_groups
-- =============================================================================

create policy board_groups_select on public.board_groups
  for select to authenticated
  using (private.can_view_board(board_id));

create policy board_groups_insert on public.board_groups
  for insert to authenticated
  with check (private.can_edit_board(board_id));

create policy board_groups_update on public.board_groups
  for update to authenticated
  using (private.can_edit_board(board_id))
  with check (private.can_edit_board(board_id));

create policy board_groups_delete on public.board_groups
  for delete to authenticated
  using (private.can_edit_board(board_id));

-- =============================================================================
-- board_columns
-- =============================================================================

create policy board_columns_select on public.board_columns
  for select to authenticated
  using (private.can_view_board(board_id));

create policy board_columns_insert on public.board_columns
  for insert to authenticated
  with check (private.can_edit_board(board_id));

create policy board_columns_update on public.board_columns
  for update to authenticated
  using (private.can_edit_board(board_id))
  with check (private.can_edit_board(board_id));

create policy board_columns_delete on public.board_columns
  for delete to authenticated
  using (private.can_edit_board(board_id));

-- =============================================================================
-- items
-- =============================================================================

create policy items_select on public.items
  for select to authenticated
  using (private.can_view_board(board_id));

create policy items_insert on public.items
  for insert to authenticated
  with check (
    private.can_edit_board(board_id)
    and created_by = (select auth.uid())
  );

-- Includes moving between groups, archiving and reordering. board_id is
-- effectively immutable (the with check re-validates the destination board).
create policy items_update on public.items
  for update to authenticated
  using (private.can_edit_board(board_id))
  with check (private.can_edit_board(board_id));

create policy items_delete on public.items
  for delete to authenticated
  using (private.can_edit_board(board_id));

-- =============================================================================
-- item_column_values
-- =============================================================================

create policy item_column_values_select on public.item_column_values
  for select to authenticated
  using (private.can_view_item(item_id));

create policy item_column_values_insert on public.item_column_values
  for insert to authenticated
  with check (private.can_edit_item(item_id));

create policy item_column_values_update on public.item_column_values
  for update to authenticated
  using (private.can_edit_item(item_id))
  with check (private.can_edit_item(item_id));

create policy item_column_values_delete on public.item_column_values
  for delete to authenticated
  using (private.can_edit_item(item_id));

-- =============================================================================
-- comments
-- =============================================================================

create policy comments_select on public.comments
  for select to authenticated
  using (private.can_view_item(item_id));

-- Editors of the board may comment, always as themselves.
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    private.can_edit_item(item_id)
    and author_id = (select auth.uid())
  );

-- canEditComment(): author only.
create policy comments_update_author on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- canDeleteComment(): author or workspace admin.
create policy comments_delete on public.comments
  for delete to authenticated
  using (private.can_delete_comment(item_id, author_id));

-- =============================================================================
-- activities  (append-only)
-- =============================================================================

create policy activities_select on public.activities
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Members write their own activity rows. When board_id is set the actor must
-- also be able to see that board, so a feed row cannot leak a private board.
create policy activities_insert on public.activities
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and actor_id = (select auth.uid())
    and (board_id is null or private.can_view_board(board_id))
  );

-- No update/delete policies: the feed is immutable from the client.

-- =============================================================================
-- notifications  (recipient-only)
-- =============================================================================

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Notifications are produced by the acting user for a colleague (mention,
-- assignment, ...). The actor must be the caller and must share a workspace
-- with the recipient. Move this to a trigger/edge function if abuse is a concern.
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and private.shares_workspace_with(user_id)
  );

-- markRead / markAllRead
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- Realtime (optional; see supabase/policies/README.md)
--
-- RLS is enforced on realtime "postgres_changes" streams, so adding these
-- tables to the publication is safe. Uncomment to enable:
--
-- alter publication supabase_realtime add table
--   public.items,
--   public.item_column_values,
--   public.comments,
--   public.activities,
--   public.notifications;
-- =============================================================================
