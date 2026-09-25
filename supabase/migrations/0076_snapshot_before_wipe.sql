-- =============================================================================
-- 0076_snapshot_before_wipe.sql
--
-- Settings → Danger zone can wipe every board and its tasks (src/server/snapshots.ts,
-- wipeBoardData). It snapshots the workspace first, so the wipe can be undone
-- from Settings → Snapshots, and that snapshot is of its own kind.
-- =============================================================================

do $$
declare
  existing text;
begin
  select conname into existing
  from pg_constraint
  where conrelid = 'public.workspace_snapshots'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if existing is not null then
    execute format('alter table public.workspace_snapshots drop constraint %I', existing);
  end if;
end $$;

alter table public.workspace_snapshots
  add constraint workspace_snapshots_kind_check check (kind in ('manual', 'before_restore', 'before_wipe', 'upload'));
