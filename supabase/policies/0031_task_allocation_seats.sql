-- =============================================================================
-- 0031_task_allocation_seats.sql
--
-- Task Allocation takes more people than the admins: whoever an admin adds to
-- it. And the Admin team takes admins only. Mirrored in
-- src/lib/permissions/permissions.ts (boardRoleFor, canManageBoard,
-- canSeeTeam) and WorkspaceService.
--
--   board_role_for()      Task Allocation: workspace admins as on any board,
--                         the people seated on it, and then its own "who can
--                         see" and "who can edit" (0125 starts them at people
--                         added), never the Admin team's, which every member
--                         could otherwise reach. Owning the row gives a
--                         non-admin nothing more than a seat. Other built-in
--                         boards are as they were.
--   can_manage_board()    only workspace admins run Task Allocation, its seats
--                         included.
--   teams_select          a built-in team shows, by name, to someone who can
--                         open one of its boards: an allocator sees the Admin
--                         team holding Task Allocation alone.
--   can_see_team()        a built-in team's trackers and docs stay its admins'
--                         (the Admin team is set to "everyone", which reached
--                         them through this).
--   guard                 only workspace owners and admins are in the Admin
--                         team (an invited one included: an invite writes its
--                         teams before the link is used); someone who stops
--                         being one, or is deactivated, leaves it.
-- =============================================================================

create or replace function private.board_role_for(
  p_board_id     uuid,
  p_workspace_id uuid,
  p_team_id      uuid,
  p_owner_id     uuid,
  p_visibility   public.board_visibility,
  p_system       text
)
returns public.board_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_explicit public.board_role;
  v_ws_role  public.workspace_role;
  v_follows  boolean;
  v_own_edit text;
  v_see      text;
  v_edit     text;
  v_in_team  boolean;
begin
  if v_uid is null then
    return null;
  end if;

  -- 0. Built-in boards are for workspace admins only, whoever owns the row;
  --    the members-only kind and Task Allocation are decided by their seats below.
  if p_system is not null and p_system not in ('APP_DEVELOPMENT', 'TASK_ALLOCATION') and not private.is_workspace_admin(p_workspace_id) then
    return null;
  end if;

  -- 1. An ACTIVE membership of this workspace, before anything else.
  v_ws_role := private.workspace_role(p_workspace_id);
  if v_ws_role is null then
    return null;
  end if;

  -- 1a. Task Allocation, for anyone but an admin: their seat, if an admin gave
  --     them one (an OWNER seat, a former admin who owns the row, is a seat
  --     like the rest); then the board's own "who can see" and "who can
  --     edit", never its team's (0125). Owning the row adds nothing.
  if p_system = 'TASK_ALLOCATION' and v_ws_role not in ('OWNER', 'ADMIN') then
    select bm.role into v_explicit
    from public.board_members bm
    where bm.board_id = p_board_id and bm.user_id = v_uid;
    if v_explicit is not null then
      return case when v_explicit = 'OWNER' then 'EDITOR'::public.board_role else v_explicit end;
    end if;
    if v_ws_role = 'GUEST' then
      return null;
    end if;
    select coalesce(b.edit_scope, 'ADDED') into v_edit from public.boards b where b.id = p_board_id;
    v_see := p_visibility::text;
    v_in_team := p_team_id is not null and private.is_team_member(p_team_id);
    if not (v_see = 'WORKSPACE' or (v_see = 'TEAM' and v_in_team)) then
      return null;
    end if;
    if v_edit = 'VIEWERS' or (v_edit = 'TEAM' and v_in_team) then
      return 'EDITOR';
    end if;
    return 'VIEWER';
  end if;

  -- 2. Owner. (Also what admits the creator of a row still being inserted,
  --    before step 5 would look the row up.)
  if p_owner_id = v_uid then
    return 'OWNER';
  end if;

  -- 3. Explicit board membership wins over inherited access.
  select bm.role into v_explicit
  from public.board_members bm
  where bm.board_id = p_board_id and bm.user_id = v_uid;
  if v_explicit is not null then
    return v_explicit;
  end if;

  -- 3a. The App development board: its owner and members, nobody else.
  if p_system = 'APP_DEVELOPMENT' then
    return null;
  end if;

  -- 4. Workspace admins can edit every board.
  if v_ws_role in ('OWNER', 'ADMIN') then
    return 'EDITOR';
  end if;

  -- 5. Who can see and who can edit. Guests reach only what they were added to.
  if v_ws_role = 'GUEST' or p_system is not null then
    return null;
  end if;

  select b.follows_team, b.edit_scope into v_follows, v_own_edit
  from public.boards b
  where b.id = p_board_id;

  if p_team_id is not null and coalesce(v_follows, true) then
    select t.board_visibility, t.board_edit into v_see, v_edit
    from public.teams t
    where t.id = p_team_id;
    v_see := coalesce(v_see, 'WORKSPACE');
    v_edit := coalesce(v_edit, 'ADDED');
  else
    v_see := p_visibility::text;
    v_edit := coalesce(v_own_edit, 'ADDED');
  end if;

  v_in_team := p_team_id is not null and private.is_team_member(p_team_id);
  if not (v_see = 'WORKSPACE' or (v_see = 'TEAM' and v_in_team)) then
    return null;
  end if;
  if v_edit = 'VIEWERS' or (v_edit = 'TEAM' and v_in_team) then
    return 'EDITOR';
  end if;
  return 'VIEWER';
end;
$$;

-- Task Allocation is run by workspace admins alone, its seats included.
create or replace function private.can_manage_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from public.boards b where b.id = p_board_id and b.system = 'APP_DEVELOPMENT')
      then private.board_role(p_board_id) = 'OWNER'
    when exists (select 1 from public.boards b where b.id = p_board_id and b.system = 'TASK_ALLOCATION')
      then private.is_workspace_admin(private.board_workspace(p_board_id)) and private.board_role(p_board_id) is not null
    else private.board_role(p_board_id) = 'OWNER'
      or (private.is_workspace_admin(private.board_workspace(p_board_id)) and private.board_role(p_board_id) is not null)
  end
$$;

-- A built-in team's trackers and docs are its admins'; an ordinary team's as before (0029).
create or replace function private.can_see_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_team_id is null
      or exists (
           select 1 from public.teams t
           where t.id = p_team_id
             and (private.is_workspace_admin(t.workspace_id)
                  or (t.system is null and (t.board_visibility = 'WORKSPACE' or private.is_team_member(t.id))))
         )
$$;

-- A built-in team shows, by name, to someone who can open one of its boards.
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated
  using (
    private.is_workspace_member(workspace_id)
    and (
      private.is_workspace_admin(workspace_id)
      or private.has_board_in_team(id)
      or (system is null and (board_visibility = 'WORKSPACE' or private.is_team_member(id)))
    )
  );

-- Only workspace owners and admins are in the Admin team.
create or replace function private.guard_admin_team_members()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.teams t where t.id = new.team_id and t.system = 'ADMIN')
     and not exists (
       select 1
       from public.teams t
       join public.workspace_members wm on wm.workspace_id = t.workspace_id and wm.user_id = new.user_id
       where t.id = new.team_id and wm.role in ('OWNER', 'ADMIN') and wm.status <> 'DEACTIVATED'
     ) then
    raise exception 'Only workspace owners and admins can be in the Admin team.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_admin_only on public.team_members;
create trigger team_members_admin_only
  before insert or update of team_id, user_id on public.team_members
  for each row execute function private.guard_admin_team_members();

-- Someone who stops being an owner or admin leaves the Admin team.
create or replace function private.leave_admin_team_on_demotion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role not in ('OWNER', 'ADMIN') or new.status = 'DEACTIVATED' then
    delete from public.team_members tm
    using public.teams t
    where t.id = tm.team_id and t.system = 'ADMIN' and t.workspace_id = new.workspace_id and tm.user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_members_leave_admin_team on public.workspace_members;
create trigger workspace_members_leave_admin_team
  after update of role, status on public.workspace_members
  for each row
  when (old.role is distinct from new.role or old.status is distinct from new.status)
  execute function private.leave_admin_team_on_demotion();
