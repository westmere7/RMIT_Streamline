-- The App development board is its members' alone.
--
-- Bug reports land on a built-in board, system = 'APP_DEVELOPMENT', meant for
-- the one person who looks after the app. Until now every built-in board was
-- for workspace admins, and every other board gave a workspace admin EDITOR
-- whatever its visibility, so a private board with one member was still open to
-- every admin. Three changes, each mirrored in src/lib/permissions/permissions.ts:
--
--   board_role_for()    step 0 applies to built-in boards other than
--                       APP_DEVELOPMENT, and step 4 (admins edit every board)
--                       skips it: owner and explicit seats only.
--   can_manage_board()  an admin manages a board only while they can see it.
--                       On every other board that is always; here it is what
--                       stops an admin seating themselves on it.
--   can_delete_board()  the same for deleting.
--
-- Everything else is 0015's rule, step for step. Last, activity rows are
-- read only by people who can see their board.

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

  -- 0. Built-in boards are for workspace admins only, whoever owns the row;
  --    the members-only kind is decided by its seats below.
  if p_system is not null and p_system <> 'APP_DEVELOPMENT' and not private.is_workspace_admin(p_workspace_id) then
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

  -- 3a. The App development board: its owner and members, nobody else.
  if p_system = 'APP_DEVELOPMENT' then
    return null;
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

-- canManageBoard(): OWNER role, or a workspace admin who can see the board.
create or replace function private.can_manage_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.board_role(p_board_id) = 'OWNER'
      or (private.is_workspace_admin(private.board_workspace(p_board_id)) and private.board_role(p_board_id) is not null)
$$;

-- canDeleteBoard(): literal owner, or a workspace admin who can see the board.
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
      or (private.is_workspace_admin(private.board_workspace(p_board_id)) and private.board_role(p_board_id) is not null)
$$;

-- Activity rows follow their board. Reading them took only a workspace
-- membership, so a board somebody could not open still showed in their feed:
-- its tasks' names, and what changed on them. Rows about no board (a team, the
-- workspace) are read as before.
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select to authenticated
  using (
    private.is_workspace_member(workspace_id)
    and (board_id is null or private.can_view_board(board_id))
  );
