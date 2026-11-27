-- =============================================================================
-- 0158 – Sending a booking back to its requester
--        (domain: src/domain/booking/send-back.ts)
--
-- When a booking leaves out what the team needs, the team sends the task back:
-- the requester gets a link of their own, opens the form with their answers in
-- it, and sends it again. The same task takes the new answers, ticket and all.
--
--   booking_requests   the booking as last sent, answers and all, one per
--                      task, so the form can open filled in. It holds the
--                      requester's email: no policy, the service role alone.
--   booking_sendbacks  each time a task is sent back: what the team asked
--                      for, the secret in the requester's link, when it runs
--                      out, and how it ended. One open per task at a time.
--
-- Both are new and empty: nothing that exists changes, and no running page
-- reads them until the release that uses them is deployed.
-- =============================================================================

-- The task's journey says each time it went back, came back, or was taken
-- back: three kinds of activity (src/domain/activity/activity.ts). Nothing in
-- this file uses them, so they are safe to add inside its transaction.
alter type public.activity_event_type add value if not exists 'BOOKING_SENT_BACK';
alter type public.activity_event_type add value if not exists 'BOOKING_RESUBMITTED';
alter type public.activity_event_type add value if not exists 'BOOKING_SEND_BACK_CANCELLED';

create table if not exists public.booking_requests (
  item_id      uuid primary key references public.items (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  request      jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint booking_requests_is_object check (jsonb_typeof(request) = 'object')
);

comment on table public.booking_requests is
  'The booking as last sent (answers, assets, requester), so a task sent back opens the form filled in. Service role only: it holds the requester''s email.';

create index if not exists booking_requests_workspace_idx on public.booking_requests (workspace_id);

create table if not exists public.booking_sendbacks (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  item_id        uuid not null references public.items (id) on delete cascade,
  note           text not null,
  token          text not null unique,
  sent_by        uuid not null references public.profiles (id),
  sent_at        timestamptz not null default now(),
  expires_at     timestamptz not null,
  resubmitted_at timestamptz,
  cancelled_at   timestamptz,
  constraint booking_sendbacks_token_shape check (token ~ '^[a-z0-9]{32}$'),
  constraint booking_sendbacks_note_length check (char_length(btrim(note)) between 1 and 2000),
  constraint booking_sendbacks_ends_once check (resubmitted_at is null or cancelled_at is null),
  constraint booking_sendbacks_expires_after_sent check (expires_at > sent_at)
);

comment on table public.booking_sendbacks is
  'A task sent back to its requester for missing information. Read by people who can edit the task (the token is the requester''s link); written by the server routes with the service role.';

-- One waiting on the requester per task.
create unique index if not exists booking_sendbacks_one_open
  on public.booking_sendbacks (item_id)
  where resubmitted_at is null and cancelled_at is null;

create index if not exists booking_sendbacks_item_idx on public.booking_sendbacks (item_id);
create index if not exists booking_sendbacks_sent_by_idx on public.booking_sendbacks (sent_by);

-- The portals (Guest and Internal) show a task waiting on its requester as
-- "Sent back", and refresh only when the workspace's revision moves (0109,
-- 0116). A send-back, its cancelling and its answer move it as any change the
-- portal shows does: 0150's function with booking_sendbacks added beside the
-- other tables that carry their workspace. Everything else is unchanged.
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
    when 'boards', 'teams', 'stakeholder_departments', 'item_links', 'department_portals', 'portal_requests', 'booking_sendbacks' then
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


-- The same three statement triggers as every other table the portal reads.
do $$
declare
  v_table text := 'booking_sendbacks';
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
