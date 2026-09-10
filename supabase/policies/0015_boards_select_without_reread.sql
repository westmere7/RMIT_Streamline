-- Creating a board has to survive its own RETURNING clause.
--
-- `boards_select` was `private.can_view_board(id)`, and `can_view_board` ->
-- `private.board_role(id)` opens by re-reading the row it is being asked about:
--
--     select * into v_board from public.boards b where b.id = p_board_id;
--     if not found then return null; end if;
--
-- That read is fine for every table whose policy names a *parent* board, because
-- the parent already exists. It is not fine for `boards` itself. PostgREST turns
-- `insert(...).select(...)` into `INSERT ... RETURNING`, and RETURNING is filtered
-- by the SELECT policy. `board_role` is STABLE, so its query runs on the calling
-- statement's snapshot — which does not include the row that same statement is
-- inserting. The lookup finds nothing, the function returns null, and the insert
-- is rejected with:
--
--     new row violates row-level security policy for table "boards"
--
-- even though the INSERT's own WITH CHECK passed. The INSERT alone succeeds; only
-- `INSERT ... RETURNING` fails, which is why board creation failed from the app
-- while the seed (service role, RLS bypassed) was unaffected.
--
-- The fix is to stop re-reading. The policy already has the row: its columns are
-- in scope as ordinary column references. `board_role_for()` takes them as
-- arguments and answers the same question without touching `public.boards`, so it
-- is correct on a row that does not exist yet. It still reads `workspace_members`
-- and `board_members`, but those rows predate the statement and are visible.
--
-- The decision itself is unchanged, step for step, from
-- 0014_membership_precedes_ownership.sql: system boards to admins only, an ACTIVE
-- workspace membership before anything else, then owner, explicit seat, workspace
-- admin, and visibility last as read-only. `board_role(uuid)` is kept — a dozen
-- other policies call it about boards that already exist — and now delegates, so
-- there is one copy of the rule rather than two that can drift.
--
-- The TypeScript twin remains `boardRoleFor()` in src/lib/permissions/permissions.ts.

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
begin
  if v_uid is null then
    return null;
  end if;

  -- 0. System boards are for workspace admins only, whoever owns the row.
  if p_system is not null and not private.is_workspace_admin(p_workspace_id) then
    return null;
  end if;

  -- 1. An ACTIVE membership of this workspace, before anything else. Somebody
  --    deactivated, still invited, or from another workspace gets nothing —
  --    including on boards they own.
  v_ws_role := private.workspace_role(p_workspace_id);
  if v_ws_role is null then
    return null;
  end if;

  -- 2. Owner. This is the step that admits the creator to their own brand-new
  --    row during RETURNING, before any board_members seat has been written.
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

  -- 4. Workspace admins can edit every board.
  if v_ws_role in ('OWNER', 'ADMIN') then
    return 'EDITOR';
  end if;

  -- 5. Visibility-derived access: reading, not editing.
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

-- The by-id form every other policy uses. One lookup, then the same rule.
create or replace function private.board_role(p_board_id uuid)
returns public.board_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_board public.boards%rowtype;
begin
  select * into v_board from public.boards b where b.id = p_board_id;
  if not found then
    return null;
  end if;

  return private.board_role_for(
    v_board.id,
    v_board.workspace_id,
    v_board.team_id,
    v_board.owner_id,
    v_board.visibility,
    v_board.system
  );
end;
$$;

-- canViewBoard(), decided from the row in hand rather than a second read of it.
drop policy if exists boards_select on public.boards;
create policy boards_select on public.boards
  for select to authenticated
  using (private.board_role_for(id, workspace_id, team_id, owner_id, visibility, system) is not null);
