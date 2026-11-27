-- My Work and a person's profile read every value that names them, across the
-- boards the reader can see. Under RLS the planner has to run can_view_item on
-- every value of those boards before the cheap jsonb test (that operator is not
-- leakproof): about 9,000 calls to find 47 rows in Contents, 1.5 s a read.
-- Here the jsonb test runs first and access is checked on what is left.
create or replace function public.values_naming_user(p_board_ids uuid[], p_user_id uuid)
returns setof public.item_column_values
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.*
  from public.item_column_values v
  where v.board_id = any(p_board_ids)
    and v.value_json @> jsonb_build_object('userIds', jsonb_build_array(p_user_id::text))
    and private.can_view_item(v.item_id)
  order by v.id
$$;

revoke all on function public.values_naming_user(uuid[], uuid) from public, anon;
grant execute on function public.values_naming_user(uuid[], uuid) to authenticated;
