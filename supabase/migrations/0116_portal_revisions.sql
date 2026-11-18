-- =============================================================================
-- 0116_portal_revisions.sql
--
-- The stakeholder portal asks "has anything changed?" too.
--
-- A portal on screen refreshes every four seconds, and each refresh read the
-- portal whole: some ten queries on the server (requests, boards, columns,
-- items, values, deliverables, links, comments, people). One portal left open
-- for a day was 21,600 of those, most of the project's API log on 18 Nov.
-- The route now reads the workspace's revision (0109) first, and when it
-- matches the one the page holds, answers "unchanged" without the rest.
--
-- That only holds if every table the portal reads bumps the revision. 0109
-- covers the dashboard's tables, which the portal shares; the portal also
-- reads five more, which get the same statement triggers here:
--
--   department_portals   its own settings (columns, layout, what it shows)
--   portal_requests      which tasks are on it
--   comments             the updates under each task
--   comment_reactions    their reactions        (fetched with the comments)
--   comment_checks       their ticked checklist lines (fetched with them too)
--
-- A public dashboard link now also reloads after a comment, which it does not
-- show. That costs it a read now and then; a second counter would cost two of
-- everything for every write. The function below is 0109's, with the five
-- tables added: everything else in it is unchanged.
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
      -- Only status changes feed the dashboard; every other activity is noise here.
      select array_agg(distinct r.workspace_id) into v_ids from changed_rows r where r.event_type = 'ITEM_COLUMN_VALUE_UPDATED';
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

-- The same three triggers per table as 0109, for the five the portal adds.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['department_portals', 'portal_requests', 'comments', 'comment_reactions', 'comment_checks'] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_rev_ins', v_table);
    execute format('drop trigger if exists %I on public.%I', v_table || '_rev_upd_new', v_table);
    execute format('drop trigger if exists %I on public.%I', v_table || '_rev_upd_old', v_table);
    execute format('drop trigger if exists %I on public.%I', v_table || '_rev_del', v_table);
    execute format('create trigger %I after insert on public.%I referencing new table as changed_rows
                    for each statement execute function private.note_dashboard_statement()', v_table || '_rev_ins', v_table);
    execute format('create trigger %I after update on public.%I referencing new table as changed_rows
                    for each statement execute function private.note_dashboard_statement()', v_table || '_rev_upd_new', v_table);
    execute format('create trigger %I after update on public.%I referencing old table as changed_rows
                    for each statement execute function private.note_dashboard_statement()', v_table || '_rev_upd_old', v_table);
    execute format('create trigger %I after delete on public.%I referencing old table as changed_rows
                    for each statement execute function private.note_dashboard_statement()', v_table || '_rev_del', v_table);
  end loop;
end;
$$;

comment on table public.workspace_revisions is
  'Bumped by trigger whenever data the workspace dashboard or the stakeholder portal reads changes; a public dashboard link and a portal compare it before reloading.';
