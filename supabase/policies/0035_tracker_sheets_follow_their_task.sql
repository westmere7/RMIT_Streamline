-- =============================================================================
-- 0035_tracker_sheets_follow_their_task.sql
--
-- A tracker sheet linked to a task (item_id set, migration 0108) was readable,
-- rows and all, by everyone who could see the tracker, so a private board's
-- task sheet reached the whole workspace (and its realtime). It is now read
-- only by those who can also see the task. Sheets with no task are unchanged.
--
-- trackers_delete asked "is any sheet here linked to a task I cannot edit?"
-- through a sub-select that the sheets' own policy filters: with hidden sheets
-- it would have answered no and let the tracker (and the hidden sheets) go.
-- The question is asked by a definer function instead. The delete also needs
-- the tracker's team to be one the caller can see, as its update does.
-- =============================================================================

drop policy if exists tracker_sheets_select on public.tracker_sheets;
create policy tracker_sheets_select on public.tracker_sheets
  for select to authenticated
  using (
    exists (
      select 1 from public.trackers t
      where t.id = tracker_sheets.tracker_id
        and private.is_workspace_member(t.workspace_id)
        and private.can_see_team(t.team_id)
    )
    and (item_id is null or coalesce(private.can_view_item(item_id), false))
  );

-- Whether a tracker holds a sheet linked to a task the caller cannot edit.
create or replace function private.tracker_has_sheet_beyond_caller(p_tracker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tracker_sheets s
    where s.tracker_id = p_tracker_id
      and s.item_id is not null
      and not coalesce(private.can_edit_item(s.item_id), false)
  )
$$;

revoke all on function private.tracker_has_sheet_beyond_caller(uuid) from public;
grant execute on function private.tracker_has_sheet_beyond_caller(uuid) to authenticated;

drop policy if exists trackers_delete on public.trackers;
create policy trackers_delete on public.trackers
  for delete to authenticated
  using (
    private.can_edit_trackers(workspace_id)
    and private.can_see_team(team_id)
    and not private.tracker_has_sheet_beyond_caller(id)
  );
