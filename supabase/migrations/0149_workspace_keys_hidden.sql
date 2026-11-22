-- =============================================================================
-- 0149_workspace_keys_hidden.sql
--
-- Signed-in sessions can no longer read workspaces.join_key or
-- workspaces.booking_key: SELECT on `workspaces` is granted column by column,
-- every column but those two. Admins and the server read the keys through
-- public.workspace_keys() (0140). Writing them is unchanged (admins, through
-- workspaces_update).
--
-- !! A column added to `workspaces` later is NOT readable by signed-in
-- !! sessions until it is granted: add
-- !!   grant select (<column>) on public.workspaces to authenticated;
-- !! to the migration that adds it (re-running this file's block does it too).
--
-- Ship after (or with) the app build that reads keys through workspace_keys():
-- an older build selects join_key and would be refused.
-- =============================================================================

do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into v_columns
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'workspaces'
    and c.column_name not in ('join_key', 'booking_key');

  revoke select on public.workspaces from anon, authenticated;
  execute format('grant select (%s) on public.workspaces to authenticated', v_columns);
end
$$;
