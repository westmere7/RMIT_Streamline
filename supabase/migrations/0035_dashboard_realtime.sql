-- 0035_dashboard_realtime.sql
--
-- The dashboard already listens for `workspaces` (the output rates that turn
-- deliverables into hours live there), but the table was never published, so
-- correcting a rate only showed up when the safety refresh came round. Publish
-- it; RLS applies to Realtime, so a reader still only hears about the workspace
-- rows they could select.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspaces'
  ) then
    alter publication supabase_realtime add table public.workspaces;
  end if;
end
$$;
