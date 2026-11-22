-- =============================================================================
-- 0144_task_rows_follow_moves.sql
--
-- A task's follows, baselines and favourites carry the board they were made
-- on. When the task changed boards (Move to board, allocating, re-allocating)
-- they kept the old one: a follower stopped hearing about the task (the
-- fan-out looks follows up by the board a change happened on), a baseline was
-- read against the wrong board, a favourite pointed at a board the task had
-- left. They now move with the task, subitems included, whoever moved it.
--
-- Security definer: the rows are other people's, which the mover cannot
-- update under their own session, and what changes is only the board of rows
-- about this very task.
-- =============================================================================

create or replace function private.task_rows_follow_move()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.board_id is distinct from old.board_id then
    update public.subscriptions set board_id = new.board_id where item_id = new.id and board_id is distinct from new.board_id;
    update public.item_baselines set board_id = new.board_id where item_id = new.id and board_id is distinct from new.board_id;
    update public.item_favourites set board_id = new.board_id where item_id = new.id and board_id is distinct from new.board_id;
  end if;
  return null;
end;
$$;

revoke all on function private.task_rows_follow_move() from public, anon, authenticated;

drop trigger if exists items_task_rows_follow_move on public.items;
create trigger items_task_rows_follow_move
  after update of board_id on public.items
  for each row execute function private.task_rows_follow_move();
