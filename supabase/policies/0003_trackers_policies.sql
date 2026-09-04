-- =============================================================================
-- RLS for trackers. Apply after policies/0002 and migrations/0003_trackers.sql.
-- Mirrors canEditTrackers(): any active workspace member can read; everyone but
-- guests can write.
-- =============================================================================

create or replace function private.can_edit_trackers(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(private.workspace_role(p_workspace_id) in ('OWNER', 'ADMIN', 'MEMBER'), false)
$$;

create or replace function private.tracker_workspace(p_tracker_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.workspace_id from public.trackers t where t.id = p_tracker_id
$$;

alter table public.trackers enable row level security;
alter table public.tracker_sheets enable row level security;

create policy trackers_select on public.trackers
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy trackers_insert on public.trackers
  for insert to authenticated
  with check (private.can_edit_trackers(workspace_id) and created_by = (select auth.uid()));

create policy trackers_update on public.trackers
  for update to authenticated
  using (private.can_edit_trackers(workspace_id))
  with check (private.can_edit_trackers(workspace_id));

create policy trackers_delete on public.trackers
  for delete to authenticated
  using (private.can_edit_trackers(workspace_id));

create policy tracker_sheets_select on public.tracker_sheets
  for select to authenticated
  using (private.is_workspace_member(private.tracker_workspace(tracker_id)));

create policy tracker_sheets_insert on public.tracker_sheets
  for insert to authenticated
  with check (private.can_edit_trackers(private.tracker_workspace(tracker_id)));

create policy tracker_sheets_update on public.tracker_sheets
  for update to authenticated
  using (private.can_edit_trackers(private.tracker_workspace(tracker_id)))
  with check (private.can_edit_trackers(private.tracker_workspace(tracker_id)));

create policy tracker_sheets_delete on public.tracker_sheets
  for delete to authenticated
  using (private.can_edit_trackers(private.tracker_workspace(tracker_id)));

alter publication supabase_realtime add table public.trackers;
alter publication supabase_realtime add table public.tracker_sheets;
