-- =============================================================================
-- 0008_visibility_is_read_only.sql
--
-- Visibility says who may read a board, not who may change it. Until now a
-- workspace-visible board was editable by everyone in the workspace, which made
-- "who is on this board" mean nothing on those boards.
--
-- From here, being in the workspace opens such a board to read alone. Editing it
-- takes a reason to be on it, and those are unchanged: its owner, someone added
-- to it explicitly, its team (for a team board), or a workspace admin.
--
-- The rest of private.board_role() is exactly as 0006 left it, including the
-- rule that system boards answer only to admins. Its twin in application code is
-- boardRoleFor in src/lib/permissions/permissions.ts; when one changes, so does
-- the other.
-- =============================================================================

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

  -- 5. Visibility-derived access: reading, not editing.
  case v_board.visibility
    when 'WORKSPACE' then
      return case when v_ws_role = 'GUEST' then null else 'VIEWER' end;
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
