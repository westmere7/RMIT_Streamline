-- =============================================================================
-- 0004_realtime.sql
--
-- Publishes the collaborative tables on `supabase_realtime` so an open board
-- updates while other people work on it (src/features/boards/hooks/use-board-realtime.ts).
--
-- RLS is enforced on realtime streams, so a subscriber only receives rows it
-- could select. Adding a table twice raises an error, so each one is guarded —
-- supabase/policies/0002_item_links_policies.sql and 0003_trackers_policies.sql
-- already publish their own tables.
-- =============================================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  for t in select unnest(array[
    'items',
    'item_column_values',
    'board_groups',
    'board_columns',
    'comments',
    'activities',
    'notifications'
  ])
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
