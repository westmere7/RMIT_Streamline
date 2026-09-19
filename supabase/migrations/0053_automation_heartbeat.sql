-- =============================================================================
-- 0053_automation_heartbeat.sql
--
-- "Is anything actually calling the runner?"
--
-- Automations are carried out by a server on a timer (0052). That is what makes
-- them work with nobody signed in, and it is also what makes them impossible to
-- diagnose from inside the app: when a rule does not fire, "no matching change"
-- and "nothing has driven the runner since Tuesday" look exactly alike, because
-- both leave no trace at all. The run log only gains rows when a rule fires, so
-- an empty log is evidence of nothing.
--
-- This is one row that the runner stamps on every pass, whether or not it found
-- anything to do. It turns the invisible failure into a visible one: the board's
-- Automations screen can say "last checked two minutes ago", or say that nothing
-- has checked since yesterday and the scheduler needs looking at.
--
-- One row, by construction: the primary key is a boolean that may only be true.
-- =============================================================================

create table if not exists public.automation_heartbeat (
  id          boolean primary key default true,
  last_run_at timestamptz not null default now(),
  -- The DrainReport the runner returned: events, scheduled, ran, skipped, failed.
  report      jsonb not null default '{}'::jsonb,
  constraint automation_heartbeat_single_row check (id)
);

comment on table public.automation_heartbeat is
  'One row, stamped by the automation runner on every pass. Its age answers "is the scheduler alive", which nothing else in the schema can.';

insert into public.automation_heartbeat (id) values (true) on conflict (id) do nothing;

alter table public.automation_heartbeat enable row level security;

-- Readable by anybody signed in, and not scoped to a workspace: the row holds a
-- timestamp and five counts, names nothing and belongs to no board, and the
-- question it answers — "is the scheduler running" — is one any member may ask.
-- Writing is the runner's alone, under the service key, so there is no write
-- policy here at all.
drop policy if exists automation_heartbeat_select on public.automation_heartbeat;
create policy automation_heartbeat_select on public.automation_heartbeat
  for select to authenticated
  using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.automation_heartbeat;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
