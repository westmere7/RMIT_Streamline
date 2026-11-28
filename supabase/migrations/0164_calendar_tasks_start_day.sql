-- =============================================================================
-- 0164_calendar_tasks_start_day.sql
--
-- calendar_tasks (0162) also finds a task that runs across the range from its
-- Start day to its Due date with no timeline: a start on or before the range's
-- end and a deadline on or after its start. Otherwise unchanged: the caller's
-- own RLS (SECURITY INVOKER), live tasks on live team boards.
--
-- The type is compared as text, so this reads the same whether or not the
-- START_DATE value of 0163 is visible yet.
-- =============================================================================

create or replace function public.calendar_tasks(p_workspace_id uuid, p_from date, p_to date)
returns table (
  id uuid, board_id uuid, group_id uuid, parent_item_id uuid, name text, ticket text, created_at timestamptz,
  item_values jsonb, assets jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with live as (
    select v.item_id, c.type::text as type, v.value_json
    from public.item_column_values v
    join public.board_columns c on c.id = v.column_id
    join public.boards b on b.id = v.board_id
    where b.workspace_id = p_workspace_id and b.archived_at is null and b.system is null
      and coalesce(c.removed, false) = false
      and c.type::text in ('DATE', 'TIMELINE', 'START_DATE')
  ),
  dated as (
    select distinct l.item_id
    from live l
    where
      (l.type = 'DATE' and (l.value_json->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and (l.value_json->>'date')::date between p_from and p_to)
      or (l.type = 'TIMELINE' and (l.value_json->>'start') ~ '^\d{4}-\d{2}-\d{2}$'
          and (l.value_json->>'start')::date <= p_to
          and (case when (l.value_json->>'end') ~ '^\d{4}-\d{2}-\d{2}$' then (l.value_json->>'end')::date else (l.value_json->>'start')::date end) >= p_from)
      or (l.type = 'START_DATE' and (l.value_json->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and (l.value_json->>'date')::date <= p_to
          and exists (
            select 1 from live d
            where d.item_id = l.item_id and d.type = 'DATE'
              and (d.value_json->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and (d.value_json->>'date')::date >= p_from
          ))
  )
  select i.id, i.board_id, i.group_id, i.parent_item_id, i.name, i.ticket, i.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('columnId', v.column_id, 'value', v.value_json)) from public.item_column_values v where v.item_id = i.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('assetType', a.asset_type, 'quantity', a.quantity, 'dueDate', a.due_date, 'completedAt', a.completed_at, 'assigneeIds', a.assignee_ids)) from public.item_assets a where a.item_id = i.id), '[]'::jsonb)
  from public.items i
  join dated d on d.item_id = i.id
  where i.archived_at is null
  order by i.board_id, i.position
$$;
revoke all on function public.calendar_tasks(uuid, date, date) from public, anon;
grant execute on function public.calendar_tasks(uuid, date, date) to authenticated;
