-- =============================================================================
-- 0101_last_updated_and_button_columns.sql
--
-- Two column types, neither of which stores anything in item_column_values:
--
--   LAST_UPDATED  who last changed a task and when, read off the activity log.
--                 board_last_activity() hands back one row a task, the newest
--                 activity of the kinds the column counts, so the board does
--                 not page through its whole history to find them.
--   BUTTON        a button that runs a few steps on its task, as the person
--                 pressing it. All of it is the column's settings.
--
-- New enum values cannot be used in the transaction that adds them, and nothing
-- here uses them. The function runs as the caller (security invoker), so the
-- activities policies decide what it can see, exactly as a plain select would.
-- =============================================================================

alter type public.column_type add value if not exists 'LAST_UPDATED';
alter type public.column_type add value if not exists 'BUTTON';

create or replace function public.board_last_activity(p_board_id uuid, p_event_types text[], p_skip_synced boolean default false)
returns table (item_id uuid, actor_id uuid, created_at timestamptz, event_type text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select distinct on (a.item_id) a.item_id, a.actor_id, a.created_at, a.event_type::text
  from public.activities a
  where a.board_id = p_board_id
    and a.item_id is not null
    and a.event_type::text = any (p_event_types)
    and (not p_skip_synced or a.metadata ->> 'syncedFrom' is null)
  order by a.item_id, a.created_at desc
$$;

grant execute on function public.board_last_activity(uuid, text[], boolean) to authenticated;
