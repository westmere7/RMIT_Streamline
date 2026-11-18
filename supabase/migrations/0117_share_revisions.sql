-- =============================================================================
-- 0117_share_revisions.sql
--
-- A shared board or task link asks "has anything changed?" too.
--
-- Board and task links refresh every four seconds while on screen, and each
-- refresh read the whole board again. They now go through the same workspace
-- revision as the dashboard link (0109) and the portal (0116), with one gap
-- closed: a shared board shows its recent history, and a shared task its own,
-- but 0109 counts only status changes among activities, since that is all the
-- dashboard reads. An activity is usually written a moment after the change
-- it describes, in a request of its own, so a refresh in between would take
-- the new revision and then never see the entry.
--
-- So every activity that belongs to a board now counts. They are few (a few
-- dozen a week on live) and nearly always arrive with a change that bumps the
-- revision anyway. Activities with no board (workspace membership) still do
-- not, as nothing that refreshes shows them.
--
-- The function below is 0116's with that one condition widened; everything
-- else in it is unchanged.
-- =============================================================================

create or replace function private.note_dashboard_statement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  case tg_table_name
    when 'workspaces' then
      select array_agg(distinct r.id) into v_ids from changed_rows r;
    when 'boards', 'teams', 'stakeholder_departments', 'item_links', 'department_portals', 'portal_requests' then
      select array_agg(distinct r.workspace_id) into v_ids from changed_rows r;
    when 'activities' then
      -- Status changes feed the dashboard; anything on a board feeds a shared
      -- board's or task's history.
      select array_agg(distinct r.workspace_id) into v_ids from changed_rows r
      where r.board_id is not null or r.event_type = 'ITEM_COLUMN_VALUE_UPDATED';
    when 'board_groups', 'board_columns', 'items', 'item_assets' then
      select array_agg(distinct b.workspace_id) into v_ids from changed_rows r join public.boards b on b.id = r.board_id;
    when 'item_column_values' then
      select array_agg(distinct b.workspace_id) into v_ids
      from (select distinct r.column_id from changed_rows r) r
      join public.board_columns c on c.id = r.column_id
      join public.boards b on b.id = c.board_id;
    when 'comments', 'comment_reactions', 'comment_checks' then
      -- Each carries its item; a row whose item is already gone was deleted
      -- with it, and the item's own trigger counted that.
      select array_agg(distinct b.workspace_id) into v_ids
      from (select distinct r.item_id from changed_rows r) r
      join public.items i on i.id = r.item_id
      join public.boards b on b.id = i.board_id;
  end case;
  perform private.note_workspace_changes(v_ids);
  return null;
end;
$$;
