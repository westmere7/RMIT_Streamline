-- The sidebar's task count beside every board: one read per board on every
-- page load (18 in Contents), each a HEAD request counting under RLS. One
-- read for all of them. SECURITY INVOKER on purpose: the caller's own RLS
-- decides what is counted, exactly as the per-board counts did.
create or replace function public.board_item_counts(p_board_ids uuid[])
returns table (board_id uuid, live bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select i.board_id, count(*)::bigint
  from public.items i
  where i.board_id = any(p_board_ids)
    and i.archived_at is null
    and i.parent_item_id is null
  group by i.board_id
$$;

revoke all on function public.board_item_counts(uuid[]) from public, anon;
grant execute on function public.board_item_counts(uuid[]) to authenticated;
