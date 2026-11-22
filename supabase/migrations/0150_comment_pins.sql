-- =============================================================================
-- 0150_comment_pins.sql
--
-- Pinned updates. Anyone who can edit a task can pin one of its updates (a
-- top-level update, not a reply) so it stays at the top of the Updates tab,
-- and one of them per task can be pinned to the overview, where it shows above
-- the description.
--
-- Pins live in their own table, like comment_checks (0095), rather than on the
-- comment: comments_set_updated_at bumps updated_at on any update of the row,
-- which the app reads as "(edited)", and comments_update is the author's alone
-- while pinning is anybody's who can edit the task.
--
-- One row per pinned update; `overview` marks the task's overview pin, at most
-- one per task (a partial unique index). Fetched with the comments, and counted
-- by the revision triggers so a shared link or portal reloads when a pin moves.
-- =============================================================================

create table if not exists public.comment_pins (
  comment_id uuid primary key references public.comments (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  overview   boolean not null default false,
  pinned_by  uuid references public.profiles (id) on delete set null,
  pinned_at  timestamptz not null default now()
);

create index if not exists comment_pins_item_idx on public.comment_pins (item_id);
create unique index if not exists comment_pins_one_overview on public.comment_pins (item_id) where overview;

alter table public.comment_pins enable row level security;
grant select, insert, update, delete on public.comment_pins to authenticated;

drop policy if exists comment_pins_select on public.comment_pins;
create policy comment_pins_select on public.comment_pins
  for select to authenticated
  using (private.can_view_item(item_id));

drop policy if exists comment_pins_insert on public.comment_pins;
create policy comment_pins_insert on public.comment_pins
  for insert to authenticated
  with check (
    pinned_by = (select auth.uid())
    and coalesce(private.can_edit_item(item_id), false)
    and exists (select 1 from public.comments c where c.id = comment_id and c.item_id = comment_pins.item_id and c.parent_id is null)
  );

drop policy if exists comment_pins_update on public.comment_pins;
create policy comment_pins_update on public.comment_pins
  for update to authenticated
  using (coalesce(private.can_edit_item(item_id), false))
  with check (
    coalesce(private.can_edit_item(item_id), false)
    and exists (select 1 from public.comments c where c.id = comment_id and c.item_id = comment_pins.item_id and c.parent_id is null)
  );

drop policy if exists comment_pins_delete on public.comment_pins;
create policy comment_pins_delete on public.comment_pins
  for delete to authenticated
  using (coalesce(private.can_edit_item(item_id), false));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_pins') then
    execute 'alter publication supabase_realtime add table public.comment_pins';
  end if;
end
$$;

-- The revision function of 0117, with comment_pins counted like comment_checks.
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
    when 'comments', 'comment_reactions', 'comment_checks', 'comment_pins' then
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

do $$
declare
  v_table text := 'comment_pins';
begin
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
end;
$$;
