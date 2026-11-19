-- =============================================================================
-- 0028_team_board_access_policies.sql
--
-- The team decides access to its boards (migration 0120). Mirrored by
-- boardRoleFor() and canSeeTeam() in src/lib/permissions/permissions.ts.
--
--   board_role_for()   step 5, new: on a team's board that is neither private
--                      nor built in, the team's settings decide. Its members
--                      edit when members_can_edit is on and read otherwise
--                      (guests read only if they could anyway); everyone else
--                      reads when the team shows its boards to the workspace,
--                      and gets nothing when it keeps them to itself. The
--                      board's own WORKSPACE/TEAM value no longer counts there:
--                      Private is the one setting a team's board keeps.
--   teams_select       a team kept to itself is hidden from everyone but its
--                      members and workspace admins. Its member rows follow
--                      (team_members_select reads through teams).
--   trackers, docs     follow their team the same way: hidden with it.
--   the two settings   only a workspace admin may change them. A team member
--                      may still rename the team, as before, but not hand
--                      themselves edit rights or hide the team.
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
  v_uid             uuid := (select auth.uid());
  v_explicit        public.board_role;
  v_ws_role         public.workspace_role;
  v_team_visibility text;
  v_team_edit       boolean;
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

  -- 2. Owner.
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

  -- 5. A team's board, not private and not built in: the team decides.
  if p_team_id is not null and p_system is null and p_visibility <> 'PRIVATE' then
    select t.board_visibility, t.members_can_edit into v_team_visibility, v_team_edit
    from public.teams t
    where t.id = p_team_id;
    if private.is_team_member(p_team_id) then
      if coalesce(v_team_edit, false) then
        return 'EDITOR';
      end if;
      if v_ws_role <> 'GUEST' then
        return 'VIEWER';
      end if;
    end if;
    if coalesce(v_team_visibility, 'WORKSPACE') = 'WORKSPACE' and v_ws_role <> 'GUEST' then
      return 'VIEWER';
    end if;
    return null;
  end if;

  -- 6. Anything else (no team, or built in): its own visibility, reading only.
  case p_visibility
    when 'WORKSPACE' then
      return case when v_ws_role = 'GUEST' then null else 'VIEWER' end;
    when 'TEAM' then
      return case
        when p_team_id is not null and private.is_team_member(p_team_id) then 'EDITOR'
        else null
      end;
    else -- 'PRIVATE'
      return null;
  end case;

  return null;
end;
$$;

-- canSeeTeam(): no team, a team shown to the workspace, an admin, or one of its members.
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
             and (t.board_visibility = 'WORKSPACE'
                  or private.is_workspace_admin(t.workspace_id)
                  or private.is_team_member(t.id))
         )
$$;

-- Teams: system teams for admins (0006), and a team kept to itself for its own people.
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated
  using (
    private.is_workspace_member(workspace_id)
    and (system is null or private.is_workspace_admin(workspace_id))
    and (board_visibility = 'WORKSPACE' or private.is_workspace_admin(workspace_id) or private.is_team_member(id))
  );

-- Who sees and edits a team's boards is an admin's call.
create or replace function private.guard_team_board_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The server (service role) and migrations act as nobody.
  if (select auth.uid()) is null or private.is_workspace_admin(new.workspace_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.board_visibility <> 'WORKSPACE' or new.members_can_edit then
      raise exception 'Only workspace admins can set who sees or edits a team''s boards.' using errcode = '42501';
    end if;
  elsif new.board_visibility is distinct from old.board_visibility or new.members_can_edit is distinct from old.members_can_edit then
    raise exception 'Only workspace admins can change who sees or edits a team''s boards.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists teams_guard_board_access on public.teams;
create trigger teams_guard_board_access
  before insert or update on public.teams
  for each row execute function private.guard_team_board_access();

-- Trackers and docs are hidden with their team.
drop policy if exists trackers_select on public.trackers;
create policy trackers_select on public.trackers
  for select to authenticated
  using (private.is_workspace_member(workspace_id) and private.can_see_team(team_id));

drop policy if exists trackers_update on public.trackers;
create policy trackers_update on public.trackers
  for update to authenticated
  using (private.can_edit_trackers(workspace_id) and private.can_see_team(team_id))
  with check (private.can_edit_trackers(workspace_id) and private.can_see_team(team_id));

drop policy if exists tracker_sheets_select on public.tracker_sheets;
create policy tracker_sheets_select on public.tracker_sheets
  for select to authenticated
  using (
    exists (
      select 1 from public.trackers t
      where t.id = tracker_sheets.tracker_id
        and private.is_workspace_member(t.workspace_id)
        and private.can_see_team(t.team_id)
    )
  );

drop policy if exists docs_select on public.docs;
create policy docs_select on public.docs
  for select to authenticated
  using (private.is_workspace_member(workspace_id) and private.can_see_team(team_id));

drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs
  for update to authenticated
  using (private.can_edit_trackers(workspace_id) and private.can_see_team(team_id))
  with check (private.can_edit_trackers(workspace_id) and private.can_see_team(team_id));
