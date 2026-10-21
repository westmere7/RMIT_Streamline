-- =============================================================================
-- 0109_workspace_revisions.sql
--
-- A version number for each workspace's dashboard data, so a public dashboard
-- link left up on a wall screen can ask "has anything changed?" for a few
-- bytes instead of reading the whole workspace (~4.5 MB) every minute.
--
-- Every table the dashboard snapshot reads (loadDashboardSnapshot,
-- src/services/dashboard-service.ts) bumps its workspace's row here when one
-- of its rows is inserted, updated or deleted. The route reads the revision
-- *before* it reads the data, so a change that commits in between is reloaded
-- on the next poll rather than missed.
--
-- How a change reaches the counter, in two steps:
--
-- 1. A statement-level trigger on each table works out, in one set-based query
--    over the statement's rows, which workspaces it touched, and notes each
--    once a transaction in workspace_revision_pending. Per statement rather
--    than per row: a row trigger cost ~0.2 ms a row, 1.5 s on the commit of a
--    7,000-value bulk write.
-- 2. That note fires a deferred constraint trigger, which bumps the counter at
--    commit. Not before: a transaction holding the counter's row lock from its
--    first write would make every other writer in the workspace wait for it,
--    and could deadlock with one that locked rows in the other order. At
--    commit, the transaction has every other lock it will take.
--
-- A row whose parent is already gone (a board's items, deleted with the board)
-- resolves to no workspace and is skipped; the parent's own trigger counts it.
-- The bump checks the workspace still exists, so deleting a workspace does not
-- trip over its own foreign key.
--
-- Writes made with triggers off (snapshot restore) bump every workspace
-- themselves: src/server/snapshots.ts calls bump_all_workspace_revisions().
--
-- RLS on and no policies: only the service role reads it, only the triggers
-- write it.
-- =============================================================================

create table if not exists public.workspace_revisions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  revision     bigint not null default 0,
  changed_at   timestamptz not null default now()
);

comment on table public.workspace_revisions is
  'Bumped by trigger whenever data the workspace dashboard reads changes; a public dashboard link compares it before reloading.';

alter table public.workspace_revisions enable row level security;

-- Workspaces a transaction has changed, waiting for its commit. A row lives
-- only inside the transaction that wrote it: the commit-time trigger deletes
-- it, a rollback takes it away. Unlogged, since it is never meant to survive.
create unlogged table if not exists private.workspace_revision_pending (
  workspace_id uuid not null
);

-- Bump now. Called at commit by the pending row's trigger, and directly by
-- snapshot restore.
create or replace function private.bump_workspace_revision(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_revisions as r (workspace_id, revision, changed_at)
  select p_workspace_id, 1, clock_timestamp()
  where exists (select 1 from public.workspaces w where w.id = p_workspace_id)
  on conflict (workspace_id) do update
    set revision = r.revision + 1, changed_at = clock_timestamp();
end;
$$;

create or replace function private.bump_all_workspace_revisions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- In id order, so two of these never wait on each other crosswise.
  for v_id in select w.id from public.workspaces w order by w.id loop
    perform private.bump_workspace_revision(v_id);
  end loop;
end;
$$;

-- Note workspaces as changed by this transaction, once each.
create or replace function private.note_workspace_changes(p_workspace_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_flag text;
begin
  foreach v_id in array coalesce(p_workspace_ids, '{}') loop
    continue when v_id is null;
    -- Transaction-local, so a rolled back savepoint forgets it with its note.
    v_flag := 'streamline.rev_' || replace(v_id::text, '-', '');
    continue when coalesce(current_setting(v_flag, true), '') = '1';
    perform set_config(v_flag, '1', true);
    insert into private.workspace_revision_pending (workspace_id) values (v_id);
  end loop;
end;
$$;

create or replace function private.flush_workspace_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- The first note to fire bumps every workspace this transaction noted, in
  -- id order, so two transactions that touched the same two workspaces cannot
  -- take their counters crosswise. The rest find nothing left. Only this
  -- transaction's notes are visible here: nobody else's ever commit.
  for v_id in select distinct p.workspace_id from private.workspace_revision_pending p order by 1 loop
    perform private.bump_workspace_revision(v_id);
  end loop;
  -- A WHERE all the same: pg-safeupdate refuses a DELETE without one.
  delete from private.workspace_revision_pending p where p.workspace_id is not null;
  return null;
end;
$$;

drop trigger if exists workspace_revision_pending_flush on private.workspace_revision_pending;
create constraint trigger workspace_revision_pending_flush
  after insert on private.workspace_revision_pending
  deferrable initially deferred
  for each row execute function private.flush_workspace_revision();

-- The statement trigger: which workspaces did this statement's rows belong to?
-- `changed_rows` is the statement's transition table (its new rows, or its old
-- ones for a delete; an update runs this twice, once for each side).
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
    when 'boards', 'teams', 'stakeholder_departments', 'item_links' then
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
  end case;
  perform private.note_workspace_changes(v_ids);
  return null;
end;
$$;

-- People are shared across workspaces and edited rarely: a change counts for all.
create or replace function private.note_dashboard_statement_all()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.note_workspace_changes(array(select w.id from public.workspaces w order by w.id));
  return null;
end;
$$;

-- A trigger with a transition table answers to one event, so each table gets
-- three: inserts and updates see their new rows, deletes and updates their old.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'workspaces', 'teams', 'stakeholder_departments', 'boards', 'board_groups', 'board_columns',
    'items', 'item_column_values', 'item_assets', 'item_links', 'activities'
  ] loop
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

drop trigger if exists profiles_rev on public.profiles;
create trigger profiles_rev
  after insert or update or delete on public.profiles
  for each statement execute function private.note_dashboard_statement_all();

-- Start every workspace with a row, so the first poll has something to compare.
insert into public.workspace_revisions (workspace_id)
select w.id from public.workspaces w
on conflict (workspace_id) do nothing;
