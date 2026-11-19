-- =============================================================================
-- 0030_board_see_edit_policies.sql
--
-- Who can see and who can edit, as two settings (migration 0123). Mirrored by
-- boardRoleFor() in src/lib/permissions/permissions.ts.
--
--   board_role_for()      step 5: the board's "who can see" and "who can
--                         edit" decide, taken from its team while it follows
--                         one, else its own. Seeing: WORKSPACE (everyone but
--                         guests), TEAM (the team's members), PRIVATE (nobody
--                         beyond the earlier steps). Editing, for those who
--                         see: ADDED (nobody more), TEAM (its members),
--                         VIEWERS (all who see). Guests only ever reach a
--                         board they are added to, as before 0028.
--   has_board_in_team()   a team kept to itself still shows to anyone who can
--                         open one of its boards, now including a board set to
--                         be seen by the whole workspace.
--   guard                 only workspace admins change a team's two settings.
--   live                  changing who can see or edit touches the workspace
--                         row, as 0029 does for teams, so people who lose a
--                         board hear about it at once.
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
  --    the members-only kind is decided by its seats below.
  if p_system is not null and p_system <> 'APP_DEVELOPMENT' and not private.is_workspace_admin(p_workspace_id) then
    return null;
  end if;

  -- 1. An ACTIVE membership of this workspace, before anything else.
  v_ws_role := private.workspace_role(p_workspace_id);
  if v_ws_role is null then
    return null;
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

-- A team kept to itself still shows, by name, to anyone who can open one of its boards.
create or replace function private.has_board_in_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.boards b
    where b.team_id = p_team_id
      and b.archived_at is null
      and private.board_role(b.id) is not null
  )
$$;

-- Who sees and edits a team's boards is an admin's call.
create or replace function private.guard_team_board_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null or private.is_workspace_admin(new.workspace_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.board_visibility <> 'WORKSPACE' or new.members_can_edit or new.board_edit <> 'ADDED' then
      raise exception 'Only workspace admins can set who sees or edits a team''s boards.' using errcode = '42501';
    end if;
  elsif new.board_visibility is distinct from old.board_visibility
     or new.members_can_edit is distinct from old.members_can_edit
     or new.board_edit is distinct from old.board_edit then
    raise exception 'Only workspace admins can change who sees or edits a team''s boards.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Changing who can see or edit reaches everyone at once (see 0029).
drop trigger if exists teams_visibility_touches_workspace on public.teams;
create trigger teams_visibility_touches_workspace
  after update of board_visibility, board_edit on public.teams
  for each row execute function private.touch_workspace_on_team_visibility();

create or replace function private.touch_workspace_on_team_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.board_visibility is distinct from old.board_visibility or new.board_edit is distinct from old.board_edit then
    update public.workspaces set updated_at = now() where id = new.workspace_id;
  end if;
  return null;
end;
$$;

create or replace function private.touch_workspace_on_board_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.visibility is distinct from old.visibility
     or new.follows_team is distinct from old.follows_team
     or new.edit_scope is distinct from old.edit_scope
     or new.team_id is distinct from old.team_id then
    update public.workspaces set updated_at = now() where id = new.workspace_id;
  end if;
  return null;
end;
$$;

drop trigger if exists boards_access_touches_workspace on public.boards;
create trigger boards_access_touches_workspace
  after update of visibility, follows_team, edit_scope, team_id on public.boards
  for each row execute function private.touch_workspace_on_board_access();
