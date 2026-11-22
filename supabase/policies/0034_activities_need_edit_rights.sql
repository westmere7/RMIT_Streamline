-- =============================================================================
-- 0034_activities_need_edit_rights.sql
--
-- The activity log could be forged: anyone who could see a board (viewers,
-- guests) could write history onto it, rows without a board went to the whole
-- workspace, a task could be filed under another board, and created_at was
-- whatever the browser sent. And when a board was deleted its rows lost their
-- board (ON DELETE SET NULL) and, having none, became readable by everyone in
-- the workspace, private boards' task names included.
--
--   insert   as yourself, on a board of that workspace you can edit; a task
--            named must be on that board. Every activity the app writes has a
--            board (board member changes, groups and tasks alike); nothing in
--            a session writes a workspace-level row.
--   time     a signed-in session's created_at is the server's clock, each row
--            of a transaction at least a millisecond after the one before
--            (the app staggered a batch by a millisecond to keep its order);
--            the service role and direct connections (seeds, snapshot
--            restore) keep the time they give.
--   select   a row about a board: whoever can see the board, as before. A row
--            with no board (its board was deleted, or older data): the person
--            who did it and the workspace's admins.
-- =============================================================================

drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and board_id is not null
    and private.is_workspace_member(workspace_id)
    and private.board_workspace(board_id) = workspace_id
    and coalesce(private.can_edit_board(board_id), false)
    and (item_id is null or private.item_board(item_id) = board_id)
  );

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select to authenticated
  using (
    private.is_workspace_member(workspace_id)
    and (
      case
        when board_id is not null then coalesce(private.can_view_board(board_id), false)
        else actor_id = (select auth.uid()) or coalesce(private.is_workspace_admin(workspace_id), false)
      end
    )
  );

create or replace function private.activities_server_time()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_last timestamptz := nullif(current_setting('streamline.activity_last_at', true), '')::timestamptz;
  v_at   timestamptz := clock_timestamp();
begin
  if session_user = 'authenticator' and coalesce(auth.role(), '') <> 'service_role' then
    if v_last is not null and v_at < v_last + interval '1 millisecond' then
      v_at := v_last + interval '1 millisecond';
    end if;
    perform set_config('streamline.activity_last_at', v_at::text, true);
    new.created_at := v_at;
  end if;
  return new;
end;
$$;

drop trigger if exists activities_server_time on public.activities;
create trigger activities_server_time
  before insert on public.activities
  for each row execute function private.activities_server_time();
