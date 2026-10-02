-- =============================================================================
-- 0104_board_status_since.sql
--
-- How long each task on a board has sat in its status: the time of its newest
-- status change, one row a task, so the Kanban can say "12d" on a card that has
-- not moved without paging through the board's whole history.
--
-- A status change is logged as ITEM_COLUMN_VALUE_UPDATED with columnType STATUS
-- in its metadata (ItemService.setValue). Changes copied from a linked task
-- count: the task did change status, whichever side it was done from. Runs as
-- the caller (security invoker), so the activities policies decide what it can
-- see, exactly as a plain select would.
-- =============================================================================

create or replace function public.board_status_since(p_board_id uuid)
returns table (item_id uuid, changed_at timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select distinct on (a.item_id) a.item_id, a.created_at
  from public.activities a
  where a.board_id = p_board_id
    and a.item_id is not null
    and a.event_type = 'ITEM_COLUMN_VALUE_UPDATED'
    and a.metadata ->> 'columnType' = 'STATUS'
  order by a.item_id, a.created_at desc
$$;

grant execute on function public.board_status_since(uuid) to authenticated;
