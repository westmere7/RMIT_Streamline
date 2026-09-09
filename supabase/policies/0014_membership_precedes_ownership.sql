-- Deactivation has to reach the boards.
--
-- `private.board_role()` answered ownership and an explicit board seat *before*
-- checking that the caller is still an ACTIVE member of the workspace. So
-- deactivating somebody — the control an administrator uses when a colleague
-- leaves — left them full OWNER on every board they had created, and every
-- explicit seat intact, enforced by the database as well as the UI.
--
-- This replaces the definition from 0008_visibility_is_read_only.sql with the
-- membership check moved above steps 1 and 2. Everything else is unchanged,
-- including the system-board gate at step 0 and visibility staying read-only.
--
-- The TypeScript twin is `boardRoleFor()` in src/lib/permissions/permissions.ts;
-- the two are meant to be read side by side. Audit finding F-001.

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

  -- 1. An ACTIVE membership of this workspace, before anything else. Somebody
  --    deactivated, still invited, or from another workspace gets nothing —
  --    including on boards they own.
  v_ws_role := private.workspace_role(v_board.workspace_id);
  if v_ws_role is null then
    return null;
  end if;

  -- 2. Owner.
  if v_board.owner_id = v_uid then
    return 'OWNER';
  end if;

  -- 3. Explicit board membership wins over inherited access.
  select bm.role into v_explicit
  from public.board_members bm
  where bm.board_id = p_board_id and bm.user_id = v_uid;
  if v_explicit is not null then
    return v_explicit;
  end if;

  -- 4. Workspace admins can edit every board.
  if v_ws_role in ('OWNER', 'ADMIN') then
    return 'EDITOR';
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
