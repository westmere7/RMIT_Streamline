-- Shared saved views and Gantt baselines reach an open board live (v0.162.0).
--
-- A view a teammate saves and shares, or a baseline somebody sets, only
-- showed for everyone else after a reload: neither table was in the realtime
-- publication. Realtime keeps to each table's SELECT policy, so a view that is
-- not shared still reaches nobody but its maker, and a baseline only those who
-- can open the board.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['board_saved_views', 'item_baselines'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- Catching up when a page's live connection comes up (v0.162.0).
--
-- A page reads its data, then joins its realtime channel a moment later; a
-- change committed in between reached nobody until the next one. When the
-- channel is up, the page asks whether its workspace changed in the seconds
-- since it read, and reads again only if so: one tiny call rather than a
-- second full read of every board. workspace_revisions.changed_at is bumped
-- once per transaction that touches what a board, the dashboard or My Work is
-- drawn from (note_dashboard_statement), with the database's own clock, so the
-- browser's clock never enters into it.
--
-- Members of the workspace only, and all it tells them is whether something
-- changed: the revision table itself stays closed (no policy).
create or replace function public.workspace_changed_within(p_workspace_id uuid, p_seconds double precision)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_workspace_member(p_workspace_id)
     and exists (
       select 1
       from public.workspace_revisions r
       where r.workspace_id = p_workspace_id
         and r.changed_at > now() - make_interval(secs => least(greatest(coalesce(p_seconds, 0), 0), 3600))
     );
$$;

revoke all on function public.workspace_changed_within(uuid, double precision) from public, anon;
grant execute on function public.workspace_changed_within(uuid, double precision) to authenticated;
