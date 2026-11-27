-- =============================================================================
-- 0162_calendar.sql
--
-- The workspace Calendar: holidays, the leave roster, key dates and private
-- calendar feeds, plus one read for the page (calendar_tasks).
--
-- * workspace_holidays and calendar_key_dates: everyone in the workspace reads
--   them; workspace admins (OWNER/ADMIN) add, change and remove them.
-- * leave_entries: everyone in the workspace reads every row, kind and note
--   included; a person writes their own, admins anyone's. No approval step.
-- * calendar_feeds: a person's own feed token, read by the feed route with the
--   service role.
-- * calendar_tasks(workspace, from, to): every live task on a live team board
--   with a DATE or TIMELINE value meeting the range, with all its values and
--   deliverables, under the caller's own RLS (SECURITY INVOKER).
-- * Vietnam's public holidays for 2026 and 2027 go into every workspace once;
--   they are the workspace's to edit from then on.
-- =============================================================================

create table if not exists public.workspace_holidays (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  starts_on    date not null,
  ends_on      date not null,
  half_day     text,
  kind         text not null default 'PUBLIC',
  note         text,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint workspace_holidays_name check (char_length(btrim(name)) between 1 and 120),
  constraint workspace_holidays_span check (ends_on >= starts_on and ends_on - starts_on <= 60),
  constraint workspace_holidays_half check (half_day is null or (half_day in ('AM', 'PM') and starts_on = ends_on)),
  constraint workspace_holidays_kind check (kind in ('PUBLIC', 'CLOSURE', 'CAMPUS')),
  constraint workspace_holidays_note check (note is null or char_length(note) <= 500)
);
create index if not exists workspace_holidays_ws_idx on public.workspace_holidays (workspace_id, starts_on);

create table if not exists public.leave_entries (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  starts_on     date not null,
  ends_on       date not null,
  start_half    boolean not null default false,
  end_half      boolean not null default false,
  kind          text not null default 'ANNUAL',
  cover_user_id uuid references public.profiles (id) on delete set null,
  note          text,
  status        text not null default 'PLANNED',
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint leave_entries_span check (ends_on >= starts_on and ends_on - starts_on <= 366),
  constraint leave_entries_kind check (kind in ('ANNUAL', 'SICK', 'TRAINING', 'CONFERENCE', 'OTHER')),
  constraint leave_entries_status check (status in ('PLANNED', 'CANCELLED')),
  constraint leave_entries_note check (note is null or char_length(note) <= 500),
  constraint leave_entries_cover check (cover_user_id is null or cover_user_id <> user_id)
);
create index if not exists leave_entries_ws_idx on public.leave_entries (workspace_id, starts_on);
create index if not exists leave_entries_user_idx on public.leave_entries (user_id);

create table if not exists public.calendar_key_dates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  starts_on    date not null,
  ends_on      date not null,
  color        text not null default 'blue',
  note         text,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint calendar_key_dates_name check (char_length(btrim(name)) between 1 and 120),
  constraint calendar_key_dates_span check (ends_on >= starts_on and ends_on - starts_on <= 120),
  constraint calendar_key_dates_note check (note is null or char_length(note) <= 500)
);
create index if not exists calendar_key_dates_ws_idx on public.calendar_key_dates (workspace_id, starts_on);

create table if not exists public.calendar_feeds (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  token        text not null unique,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  constraint calendar_feeds_token check (token ~ '^[a-z0-9]{40}$')
);
create unique index if not exists calendar_feeds_one_live on public.calendar_feeds (workspace_id, user_id) where revoked_at is null;

drop trigger if exists workspace_holidays_set_updated_at on public.workspace_holidays;
create trigger workspace_holidays_set_updated_at before update on public.workspace_holidays for each row execute function public.set_updated_at();
drop trigger if exists leave_entries_set_updated_at on public.leave_entries;
create trigger leave_entries_set_updated_at before update on public.leave_entries for each row execute function public.set_updated_at();
drop trigger if exists calendar_key_dates_set_updated_at on public.calendar_key_dates;
create trigger calendar_key_dates_set_updated_at before update on public.calendar_key_dates for each row execute function public.set_updated_at();

-- ---- access -------------------------------------------------------------------
alter table public.workspace_holidays enable row level security;
alter table public.leave_entries enable row level security;
alter table public.calendar_key_dates enable row level security;
alter table public.calendar_feeds enable row level security;
revoke all on public.workspace_holidays, public.leave_entries, public.calendar_key_dates, public.calendar_feeds from anon;
grant select, insert, update, delete on public.workspace_holidays, public.leave_entries, public.calendar_key_dates to authenticated;
grant select, insert, update on public.calendar_feeds to authenticated;

drop policy if exists workspace_holidays_select on public.workspace_holidays;
create policy workspace_holidays_select on public.workspace_holidays for select to authenticated using (private.is_workspace_member(workspace_id));
drop policy if exists workspace_holidays_write on public.workspace_holidays;
create policy workspace_holidays_write on public.workspace_holidays for all to authenticated
  using (private.is_workspace_admin(workspace_id)) with check (private.is_workspace_admin(workspace_id));

drop policy if exists calendar_key_dates_select on public.calendar_key_dates;
create policy calendar_key_dates_select on public.calendar_key_dates for select to authenticated using (private.is_workspace_member(workspace_id));
drop policy if exists calendar_key_dates_write on public.calendar_key_dates;
create policy calendar_key_dates_write on public.calendar_key_dates for all to authenticated
  using (private.is_workspace_admin(workspace_id)) with check (private.is_workspace_admin(workspace_id));

drop policy if exists leave_entries_select on public.leave_entries;
create policy leave_entries_select on public.leave_entries for select to authenticated using (private.is_workspace_member(workspace_id));
drop policy if exists leave_entries_write on public.leave_entries;
create policy leave_entries_write on public.leave_entries for all to authenticated
  using (private.is_workspace_admin(workspace_id) or (user_id = (select auth.uid()) and private.is_workspace_member(workspace_id)))
  with check (
    (private.is_workspace_admin(workspace_id) or (user_id = (select auth.uid()) and private.is_workspace_member(workspace_id)))
    -- The person on leave, and anyone covering, are seated in this workspace.
    and exists (select 1 from public.workspace_members m where m.workspace_id = leave_entries.workspace_id and m.user_id = leave_entries.user_id)
    and (cover_user_id is null or exists (select 1 from public.workspace_members m where m.workspace_id = leave_entries.workspace_id and m.user_id = leave_entries.cover_user_id))
  );

drop policy if exists calendar_feeds_own on public.calendar_feeds;
create policy calendar_feeds_own on public.calendar_feeds for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_workspace_member(workspace_id));

-- ---- live ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_holidays') then
    execute 'alter publication supabase_realtime add table public.workspace_holidays';
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_entries') then
    execute 'alter publication supabase_realtime add table public.leave_entries';
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calendar_key_dates') then
    execute 'alter publication supabase_realtime add table public.calendar_key_dates';
  end if;
end
$$;

-- The revision function as it was live before this migration, with the three calendar tables counted by workspace_id.

CREATE OR REPLACE FUNCTION private.note_dashboard_statement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids uuid[];
begin
  case tg_table_name
    when 'workspaces' then
      select array_agg(distinct r.id) into v_ids from changed_rows r;
    when 'boards', 'teams', 'stakeholder_departments', 'item_links', 'department_portals', 'portal_requests', 'booking_sendbacks', 'workspace_holidays', 'leave_entries', 'calendar_key_dates' then
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
$function$;

drop trigger if exists workspace_holidays_rev_ins on public.workspace_holidays;
create trigger workspace_holidays_rev_ins after insert on public.workspace_holidays referencing new table as changed_rows for each statement execute function private.note_dashboard_statement();
drop trigger if exists workspace_holidays_rev_upd_new on public.workspace_holidays;
create trigger workspace_holidays_rev_upd_new after update on public.workspace_holidays referencing new table as changed_rows for each statement execute function private.note_dashboard_statement();
drop trigger if exists workspace_holidays_rev_upd_old on public.workspace_holidays;
create trigger workspace_holidays_rev_upd_old after update on public.workspace_holidays referencing old table as changed_rows for each statement execute function private.note_dashboard_statement();
drop trigger if exists workspace_holidays_rev_del on public.workspace_holidays;
create trigger workspace_holidays_rev_del after delete on public.workspace_holidays referencing old table as changed_rows for each statement execute function private.note_dashboard_statement();

drop trigger if exists leave_entries_rev_ins on public.leave_entries;
create trigger leave_entries_rev_ins after insert on public.leave_entries referencing new table as changed_rows for each statement execute function private.note_dashboard_statement();
drop trigger if exists leave_entries_rev_upd_new on public.leave_entries;
create trigger leave_entries_rev_upd_new after update on public.leave_entries referencing new table as changed_rows for each statement execute function private.note_dashboard_statement();
drop trigger if exists leave_entries_rev_upd_old on public.leave_entries;
create trigger leave_entries_rev_upd_old after update on public.leave_entries referencing old table as changed_rows for each statement execute function private.note_dashboard_statement();
drop trigger if exists leave_entries_rev_del on public.leave_entries;
create trigger leave_entries_rev_del after delete on public.leave_entries referencing old table as changed_rows for each statement execute function private.note_dashboard_statement();

drop trigger if exists calendar_key_dates_rev_ins on public.calendar_key_dates;
create trigger calendar_key_dates_rev_ins after insert on public.calendar_key_dates referencing new table as changed_rows for each statement execute function private.note_dashboard_statement();
drop trigger if exists calendar_key_dates_rev_upd_new on public.calendar_key_dates;
create trigger calendar_key_dates_rev_upd_new after update on public.calendar_key_dates referencing new table as changed_rows for each statement execute function private.note_dashboard_statement();
drop trigger if exists calendar_key_dates_rev_upd_old on public.calendar_key_dates;
create trigger calendar_key_dates_rev_upd_old after update on public.calendar_key_dates referencing old table as changed_rows for each statement execute function private.note_dashboard_statement();
drop trigger if exists calendar_key_dates_rev_del on public.calendar_key_dates;
create trigger calendar_key_dates_rev_del after delete on public.calendar_key_dates referencing old table as changed_rows for each statement execute function private.note_dashboard_statement();

-- ---- the page's read -----------------------------------------------------------
create or replace function public.calendar_tasks(p_workspace_id uuid, p_from date, p_to date)
returns table (
  id uuid, board_id uuid, group_id uuid, parent_item_id uuid, name text, ticket text, created_at timestamptz,
  item_values jsonb, assets jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with dated as (
    select distinct v.item_id
    from public.item_column_values v
    join public.board_columns c on c.id = v.column_id
    join public.boards b on b.id = v.board_id
    where b.workspace_id = p_workspace_id and b.archived_at is null and b.system is null
      and coalesce(c.removed, false) = false
      and (
        (c.type = 'DATE' and (v.value_json->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and (v.value_json->>'date')::date between p_from and p_to)
        or (c.type = 'TIMELINE' and (v.value_json->>'start') ~ '^\d{4}-\d{2}-\d{2}$'
            and (v.value_json->>'start')::date <= p_to
            and (case when (v.value_json->>'end') ~ '^\d{4}-\d{2}-\d{2}$' then (v.value_json->>'end')::date else (v.value_json->>'start')::date end) >= p_from)
      )
  )
  select i.id, i.board_id, i.group_id, i.parent_item_id, i.name, i.ticket, i.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('columnId', v.column_id, 'value', v.value_json)) from public.item_column_values v where v.item_id = i.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('assetType', a.asset_type, 'quantity', a.quantity, 'dueDate', a.due_date, 'completedAt', a.completed_at, 'assigneeIds', a.assignee_ids)) from public.item_assets a where a.item_id = i.id), '[]'::jsonb)
  from public.items i
  join dated d on d.item_id = i.id
  where i.archived_at is null
  order by i.board_id, i.position
$$;
revoke all on function public.calendar_tasks(uuid, date, date) from public, anon;
grant execute on function public.calendar_tasks(uuid, date, date) to authenticated;

-- ---- Vietnam's public holidays, once per workspace --------------------------------
insert into public.workspace_holidays (workspace_id, name, starts_on, ends_on, kind, created_by)
select w.id, h.name, h.starts_on, h.ends_on, 'PUBLIC', null
from public.workspaces w
cross join (values
    ('New Year''s Day', date '2026-01-01', date '2026-01-01'),
    ('Tết (Lunar New Year)', date '2026-02-14', date '2026-02-22'),
    ('Hùng Kings Commemoration', date '2026-04-26', date '2026-04-27'),
    ('Reunification Day', date '2026-04-30', date '2026-04-30'),
    ('Labour Day', date '2026-05-01', date '2026-05-01'),
    ('National Day', date '2026-09-01', date '2026-09-02'),
    ('Vietnam Culture Day', date '2026-11-24', date '2026-11-24'),
    ('New Year''s Day', date '2027-01-01', date '2027-01-01'),
    ('Tết (Lunar New Year)', date '2027-02-04', date '2027-02-10'),
    ('Hùng Kings Commemoration', date '2027-04-16', date '2027-04-16'),
    ('Reunification Day', date '2027-04-30', date '2027-04-30'),
    ('Labour Day', date '2027-05-01', date '2027-05-01'),
    ('National Day', date '2027-09-01', date '2027-09-02'),
    ('Vietnam Culture Day', date '2027-11-24', date '2027-11-24')
  ) as h(name, starts_on, ends_on)
where not exists (select 1 from public.workspace_holidays x where x.workspace_id = w.id);
