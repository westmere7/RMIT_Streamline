-- =============================================================================
-- 0026_tracker_sheet_assets_policies.sql
--
-- A sheet linked to a task (migration 0108) is that task's deliverables, so it
-- is edited by the people who may edit the task:
--
--   read        unchanged: every workspace member
--   edit        a tracker editor, and, while the sheet is linked, someone who
--               can edit the linked task's board. Linking a sheet to a task
--               needs the same: the with-check sees the new item_id.
--   delete      the same, since deleting a linked sheet removes the task's lines
--   trackers    deleting a tracker takes its sheets (and their lines) with it,
--               bypassing the sheets' own policy, so it is refused while any of
--               its sheets is linked to a task the caller cannot edit
--
-- private.can_edit_item answers NULL, not false, for somebody with no role on
-- the board, and NOT NULL is NULL: every use below is wrapped in coalesce so
-- "no answer" is "cannot edit", including where it is negated.
-- =============================================================================

create or replace function private.can_edit_tracker_sheet(p_tracker_id uuid, p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(private.can_edit_trackers(private.tracker_workspace(p_tracker_id)), false)
     and (p_item_id is null or coalesce(private.can_edit_item(p_item_id), false))
$$;

drop policy if exists tracker_sheets_update on public.tracker_sheets;
create policy tracker_sheets_update on public.tracker_sheets
  for update to authenticated
  using (private.can_edit_tracker_sheet(tracker_id, item_id))
  with check (private.can_edit_tracker_sheet(tracker_id, item_id));

drop policy if exists tracker_sheets_delete on public.tracker_sheets;
create policy tracker_sheets_delete on public.tracker_sheets
  for delete to authenticated
  using (private.can_edit_tracker_sheet(tracker_id, item_id));

-- A new sheet is never linked on the way in: linking is an update, checked above.
drop policy if exists tracker_sheets_insert on public.tracker_sheets;
create policy tracker_sheets_insert on public.tracker_sheets
  for insert to authenticated
  with check (private.can_edit_trackers(private.tracker_workspace(tracker_id)) and item_id is null);

drop policy if exists trackers_delete on public.trackers;
create policy trackers_delete on public.trackers
  for delete to authenticated
  using (
    private.can_edit_trackers(workspace_id)
    and not exists (
      select 1 from public.tracker_sheets s
      where s.tracker_id = trackers.id
        and s.item_id is not null
        and not coalesce(private.can_edit_item(s.item_id), false)
    )
  );
