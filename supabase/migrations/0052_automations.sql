-- =============================================================================
-- 0052_automations.sql
--
-- Automations: "when this happens on this board, do that."
--
-- The whole point of this file is *where the firing happens*. A rule could have
-- been hung off ItemService, which every write in the app already goes through
-- — and it would have worked for exactly as long as somebody had the page open.
-- The app writes to Postgres from the browser, so "the code that saves a cell"
-- is code running on a laptop that closes at five.
--
-- So the firing lives here instead. Triggers on `items`, `item_column_values`
-- and `comments` raise a row in `automation_events`, and a server-side runner
-- drains that queue. Nothing can reach those tables without passing the
-- trigger: not the board, not the booking form, not a stakeholder portal, not
-- link propagation, not a hand-written UPDATE in the SQL editor. A rule fires
-- for all of them, and it fires with every browser shut.
--
-- What is deliberately *not* here: the rules themselves. Evaluating a condition
-- and carrying out an action means knowing what a STATUS value means, how a
-- notification is delivered, what link propagation must mirror and how a ticket
-- is issued — all of which already exist, in TypeScript, tested. Reimplementing
-- that in plpgsql would be a second copy of the domain that drifts from the
-- first. The database decides *that* something happened; the runner decides
-- what it means.
--
-- Loops are the real hazard of a feature like this: two rules that answer each
-- other will run until something stops them. `automation_marks` is what stops
-- them — see the comment on that table.
-- =============================================================================

-- The RLS helpers live in `private`, and policies/ runs after migrations/ — so on
-- a database being built from nothing this file is the first to want the schema.
create schema if not exists private;

-- ---- Rules ------------------------------------------------------------------

create table if not exists public.automation_rules (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  board_id        uuid not null references public.boards (id) on delete cascade,
  name            text not null,
  enabled         boolean not null default true,
  -- The TypeScript AutomationTrigger union (src/domain/automation/automation.ts)
  -- stored verbatim, the way board_columns.settings and item_column_values.value_json are.
  trigger_json    jsonb not null,
  condition_match text not null default 'all',
  conditions      jsonb not null default '[]'::jsonb,
  actions         jsonb not null default '[]'::jsonb,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_run_at     timestamptz,
  run_count       integer not null default 0,
  last_error      text,
  constraint automation_rules_trigger_is_object check (jsonb_typeof(trigger_json) = 'object'),
  constraint automation_rules_trigger_has_kind check (trigger_json ? 'kind'),
  constraint automation_rules_conditions_is_array check (jsonb_typeof(conditions) = 'array'),
  constraint automation_rules_actions_is_array check (jsonb_typeof(actions) = 'array'),
  constraint automation_rules_match_known check (condition_match in ('all', 'any')),
  constraint automation_rules_name_length check (char_length(name) between 1 and 200)
);

comment on table public.automation_rules is
  'One "when X then Y" on one board. trigger_json/conditions/actions hold the TypeScript union from src/domain/automation/automation.ts verbatim.';

-- Pulled out of the JSON so the enqueue check below is an index lookup rather
-- than a JSON scan on the hot path of every cell edit in the workspace.
alter table public.automation_rules
  add column if not exists trigger_kind text generated always as (trigger_json ->> 'kind') stored;

alter table public.automation_rules
  add column if not exists trigger_column_id uuid generated always as
    (nullif(trigger_json ->> 'columnId', '')::uuid) stored;

create index if not exists automation_rules_board_idx on public.automation_rules (board_id);
create index if not exists automation_rules_workspace_idx on public.automation_rules (workspace_id);
-- The one the triggers use: enabled rules on this board, by what wakes them.
create index if not exists automation_rules_live_idx
  on public.automation_rules (board_id, trigger_kind) where enabled;

drop trigger if exists automation_rules_set_updated_at on public.automation_rules;
create trigger automation_rules_set_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();

-- ---- The queue --------------------------------------------------------------

create table if not exists public.automation_events (
  id           bigint generated always as identity primary key,
  board_id     uuid not null references public.boards (id) on delete cascade,
  item_id      uuid references public.items (id) on delete cascade,
  kind         text not null,
  column_id    uuid references public.board_columns (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  payload      jsonb not null default '{}'::jsonb,
  depth        integer not null default 0,
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  processed_at timestamptz,
  attempts     integer not null default 0,
  error        text,
  constraint automation_events_kind_known
    check (kind in ('item_created', 'value_changed', 'item_moved', 'item_archived', 'comment_added'))
);

comment on table public.automation_events is
  'What happened on a board, as the database saw it. Drained by the server-side runner; never read by the browser.';

-- The drain query: oldest unprocessed first. Partial, so the index stays the
-- size of the backlog rather than the size of every edit ever made.
create index if not exists automation_events_pending_idx
  on public.automation_events (created_at)
  where processed_at is null;

create index if not exists automation_events_board_idx on public.automation_events (board_id, created_at desc);
create index if not exists automation_events_item_idx on public.automation_events (item_id);

-- ---- Loop breaker -----------------------------------------------------------

-- A rule's own writes raise events of their own — that is what makes a chain of
-- automations possible, and what makes an infinite one possible too. Before the
-- runner carries out an action it leaves a mark on the task saying how deep it
-- already is; the trigger reads the mark and stamps the depth onto whatever the
-- action raises. Past MAX_EVENT_DEPTH the runner stops acting.
--
-- Marks are short-lived by construction: written immediately before an action
-- and deleted immediately after, with `expires_at` as the backstop for a runner
-- that dies mid-flight. A human edit that lands on the same task inside that
-- window inherits the depth, which costs it some headroom and nothing else.
create table if not exists public.automation_marks (
  item_id    uuid primary key references public.items (id) on delete cascade,
  depth      integer not null default 0,
  expires_at timestamptz not null default now() + interval '2 minutes'
);

-- ---- Scheduled firings ------------------------------------------------------

-- "Two days before the due date" must fire once, not once per tick. A row here
-- is the receipt. `fire_key` is the rule's own idea of the occasion — a date
-- for a deadline rule, a date and hour for a recurring one — so the uniqueness
-- is the rule's, not the clock's.
create table if not exists public.automation_schedule_fires (
  rule_id    uuid not null references public.automation_rules (id) on delete cascade,
  item_id    uuid references public.items (id) on delete cascade,
  fire_key   text not null,
  created_at timestamptz not null default now(),
  primary key (rule_id, fire_key, item_id)
);

-- A scheduled rule with no task behind it (a recurring one) still needs the
-- receipt to be unique, and NULL does not compare equal to NULL in a primary
-- key. This is the row that covers those.
create unique index if not exists automation_schedule_fires_ruleless_idx
  on public.automation_schedule_fires (rule_id, fire_key)
  where item_id is null;

-- ---- The log ----------------------------------------------------------------

create table if not exists public.automation_runs (
  id         uuid primary key default gen_random_uuid(),
  rule_id    uuid not null references public.automation_rules (id) on delete cascade,
  board_id   uuid not null references public.boards (id) on delete cascade,
  item_id    uuid references public.items (id) on delete set null,
  status     text not null,
  summary    text not null,
  detail     text,
  created_at timestamptz not null default now(),
  constraint automation_runs_status_known check (status in ('ran', 'skipped', 'failed'))
);

comment on table public.automation_runs is
  'What each rule did and to what. Skipped runs are kept too: "why did my automation not fire" is the question people actually ask.';

create index if not exists automation_runs_rule_idx on public.automation_runs (rule_id, created_at desc);
create index if not exists automation_runs_board_idx on public.automation_runs (board_id, created_at desc);

-- =============================================================================
-- The triggers that fill the queue
-- =============================================================================

-- Is there anything on this board that could care? One index probe, so the
-- common case — a board with no automations — costs a single lookup per write.
create or replace function private.automation_board_listens(p_board_id uuid, p_kinds text[], p_column_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.automation_rules r
    where r.board_id = p_board_id
      and r.enabled
      and r.trigger_kind = any (p_kinds)
      and (p_column_id is null or r.trigger_column_id is null or r.trigger_column_id = p_column_id)
  );
$$;

-- How deep whatever we are about to record already is.
create or replace function private.automation_depth_for(p_item_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select m.depth + 1 from public.automation_marks m where m.item_id = p_item_id and m.expires_at > now()),
    0
  );
$$;

-- ---- items ------------------------------------------------------------------

create or replace function public.automation_capture_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_payload jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    -- An archived task arriving is a restore or an import, not a creation.
    if new.archived_at is not null then return new; end if;
    v_kind := 'item_created';
    v_payload := jsonb_build_object('toGroupId', new.group_id, 'parentItemId', new.parent_item_id);
  elsif new.archived_at is not null and old.archived_at is null then
    v_kind := 'item_archived';
  elsif new.group_id is distinct from old.group_id then
    v_kind := 'item_moved';
    v_payload := jsonb_build_object('fromGroupId', old.group_id, 'toGroupId', new.group_id);
  else
    return new;
  end if;

  if not private.automation_board_listens(
    new.board_id,
    case v_kind
      when 'item_created' then array['item_created']
      when 'item_moved' then array['item_moved_to_group']
      else array['item_archived']
    end
  ) then
    return new;
  end if;

  insert into public.automation_events (board_id, item_id, kind, actor_id, payload, depth)
  values (
    new.board_id,
    new.id,
    v_kind,
    coalesce((select auth.uid()), new.created_by),
    v_payload,
    private.automation_depth_for(new.id)
  );
  return new;
end;
$$;

drop trigger if exists items_automation_capture on public.items;
create trigger items_automation_capture
  after insert or update of group_id, archived_at on public.items
  for each row execute function public.automation_capture_item();

-- ---- item_column_values -----------------------------------------------------

create or replace function public.automation_capture_value()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb := null;
  v_board uuid;
begin
  if tg_op = 'UPDATE' then
    -- The app writes the same value back more often than you would think:
    -- a cell re-saved unchanged, a link propagating what is already there.
    if new.value_json is not distinct from old.value_json then return new; end if;
    v_before := old.value_json;
  end if;

  -- board_id is denormalised onto the row and NOT NULL since 0036, put there for
  -- realtime filtering; it saves this trigger a join on the hottest write path
  -- in the app.
  v_board := new.board_id;

  if not private.automation_board_listens(
    v_board,
    array['column_changed', 'column_set_to', 'person_assigned'],
    new.column_id
  ) then
    return new;
  end if;

  insert into public.automation_events (board_id, item_id, kind, column_id, actor_id, payload, depth)
  values (
    v_board,
    new.item_id,
    'value_changed',
    new.column_id,
    (select auth.uid()),
    jsonb_strip_nulls(jsonb_build_object('before', v_before, 'after', new.value_json)),
    private.automation_depth_for(new.item_id)
  );
  return new;
end;
$$;

drop trigger if exists item_column_values_automation_capture on public.item_column_values;
create trigger item_column_values_automation_capture
  after insert or update of value_json on public.item_column_values
  for each row execute function public.automation_capture_value();

-- ---- comments ---------------------------------------------------------------

create or replace function public.automation_capture_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_board uuid;
begin
  select i.board_id into v_board from public.items i where i.id = new.item_id;
  if v_board is null then return new; end if;
  if not private.automation_board_listens(v_board, array['comment_added']) then return new; end if;

  insert into public.automation_events (board_id, item_id, kind, actor_id, payload, depth)
  values (
    v_board,
    new.item_id,
    'comment_added',
    new.author_id,
    jsonb_build_object('commentId', new.id, 'body', left(new.body, 2000)),
    private.automation_depth_for(new.item_id)
  );
  return new;
end;
$$;

drop trigger if exists comments_automation_capture on public.comments;
create trigger comments_automation_capture
  after insert on public.comments
  for each row execute function public.automation_capture_comment();

-- =============================================================================
-- Housekeeping
-- =============================================================================

-- Processed events and old log rows are not evidence of anything after a month,
-- and the queue index is only cheap while the table is small. Called by the
-- runner rather than scheduled here, so there is one thing to point at when
-- asking why the tables are the size they are.
create or replace function public.automation_sweep(p_keep_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_removed integer := 0;
  v_count integer;
begin
  delete from public.automation_events
   where processed_at is not null and processed_at < now() - make_interval(days => p_keep_days);
  get diagnostics v_count = row_count;
  v_removed := v_removed + v_count;

  delete from public.automation_runs where created_at < now() - make_interval(days => p_keep_days);
  get diagnostics v_count = row_count;
  v_removed := v_removed + v_count;

  delete from public.automation_schedule_fires where created_at < now() - make_interval(days => p_keep_days);
  get diagnostics v_count = row_count;
  v_removed := v_removed + v_count;

  delete from public.automation_marks where expires_at < now();
  get diagnostics v_count = row_count;
  return v_removed + v_count;
end;
$$;

revoke all on function public.automation_sweep(integer) from public;
grant execute on function public.automation_sweep(integer) to service_role;

-- Realtime: the rules list and the run log are worth watching while somebody
-- has the board's automations open. The queue is not — it is the runner's.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.automation_rules;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.automation_runs;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
