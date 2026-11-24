-- A dot on a board's count when tasks arrived since you last opened it (v0.163.0).
--
-- "Arrived" is how a task gets onto a board: made there (ITEM_CREATED), or
-- moved or allocated there from another board (an ITEM_MOVED that names the
-- board it came from; a move between groups names groups instead). Your own
-- arrivals do not count, and neither does a task that has since left the board,
-- been archived, or is a subitem. A board you have never opened has nothing to
-- compare with, so it gets no dot.
--
-- Runs as the caller: the board visits are their own, and the activity log and
-- the tasks are read through their usual policies, so a board they cannot see
-- never comes back. All it returns is board ids.
create or replace function public.boards_with_new_items(p_workspace_id uuid)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select v.board_id
  from public.board_visits v
  join public.boards b on b.id = v.board_id
  where v.user_id = (select auth.uid())
    and b.workspace_id = p_workspace_id
    and b.archived_at is null
    and exists (
      select 1
      from public.activities a
      join public.items i on i.id = a.item_id
      where a.board_id = v.board_id
        and a.created_at > v.visited_at
        and a.actor_id is distinct from (select auth.uid())
        and (a.event_type = 'ITEM_CREATED' or (a.event_type = 'ITEM_MOVED' and a.metadata ? 'from'))
        and i.board_id = v.board_id
        and i.archived_at is null
        and i.parent_item_id is null
    );
$$;

revoke all on function public.boards_with_new_items(uuid) from public, anon;
grant execute on function public.boards_with_new_items(uuid) to authenticated;
