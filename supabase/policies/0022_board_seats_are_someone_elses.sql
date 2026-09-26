-- A seat on a board is somebody else's to change.
--
-- Whoever could manage a board could change any seat on it, their own
-- included, and anyone could delete their own seat. On the App development
-- board that let an admin who had been seated as a viewer make themselves an
-- editor. Two rules, mirrored in src/lib/permissions/permissions.ts
-- (canManageBoard, canEditBoardSeat) and BoardService:
--
--   can_manage_board()  on a members-only board (APP_DEVELOPMENT) the owner
--   can_delete_board()  alone manages or deletes it; a seated admin is a member
--                       like any other. Elsewhere it is 0021's rule.
--   board_members       nobody inserts, changes or deletes their own seat. The
--                       one exception is a board's owner writing their own
--                       OWNER seat, which is how a new board gets its first row.

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
    else private.board_role(p_board_id) = 'OWNER'
      or (private.is_workspace_admin(private.board_workspace(p_board_id)) and private.board_role(p_board_id) is not null)
  end
$$;

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
      or (
        not exists (select 1 from public.boards b where b.id = p_board_id and b.system = 'APP_DEVELOPMENT')
        and private.is_workspace_admin(private.board_workspace(p_board_id))
        and private.board_role(p_board_id) is not null
      )
$$;

create or replace function private.owns_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.boards b where b.id = p_board_id and b.owner_id = (select auth.uid()))
$$;

drop policy if exists board_members_insert on public.board_members;
create policy board_members_insert on public.board_members
  for insert to authenticated
  with check (
    private.can_manage_board(board_id)
    and (user_id <> (select auth.uid()) or (role = 'OWNER' and private.owns_board(board_id)))
  );

drop policy if exists board_members_update on public.board_members;
create policy board_members_update on public.board_members
  for update to authenticated
  using (private.can_manage_board(board_id) and user_id <> (select auth.uid()))
  with check (private.can_manage_board(board_id) and user_id <> (select auth.uid()));

drop policy if exists board_members_delete on public.board_members;
create policy board_members_delete on public.board_members
  for delete to authenticated
  using (private.can_manage_board(board_id) and user_id <> (select auth.uid()));
