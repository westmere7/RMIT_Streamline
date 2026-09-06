-- =============================================================================
-- 0006_system_entities_policies.sql
--
-- System rows (the "Admin" team and its "Task Allocation" board, see
-- migrations/0014_task_booking.sql) are for workspace admins only. Mirrors the
-- `system` checks in src/lib/permissions/permissions.ts and the filtering in
-- src/features/workspace/workspace-context.tsx.
--
-- Nothing here stops a rename: admins keep every right they had. What is taken
-- away is visibility for everyone else, and archive/delete are refused by the
-- services (there is no policy for "may set archived_at", so the guard stays in
-- application code on both providers).
-- =============================================================================

-- board_role(): a system board yields nothing unless the caller is a workspace
-- admin. Everything else is unchanged from 0001.
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

  -- 0. System boards are for workspace admins only, whoever owns the row.
  if v_board.system is not null and not private.is_workspace_admin(v_board.workspace_id) then
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

-- Teams: members see every ordinary team; system teams only show to admins.
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated
  using (
    private.is_workspace_member(workspace_id)
    and (system is null or private.is_workspace_admin(workspace_id))
  );

-- Team membership rows follow their team.
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated
  using (
    private.is_workspace_member(private.team_workspace(team_id))
    and exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and (t.system is null or private.is_workspace_admin(t.workspace_id))
    )
  );
