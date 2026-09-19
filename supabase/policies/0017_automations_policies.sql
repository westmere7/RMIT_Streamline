-- =============================================================================
-- 0017_automations_policies.sql
--
-- Automations (migrations/0052_automations.sql). Three different answers for
-- four tables, because they are read by three different sorts of caller.
--
--   automation_rules            anyone who can see the board may read what it
--                               does on its own; only somebody who could manage
--                               the board may change it. Mirrors canViewBoard /
--                               canManageBoard in src/lib/permissions/permissions.ts.
--
--   automation_runs             the log reads like board activity, so it is
--                               visible to the same people. Nobody writes it
--                               from a browser: the runner holds the service
--                               key, which bypasses RLS entirely.
--
--   automation_events           the queue, and
--   automation_marks            the loop breaker, and
--   automation_schedule_fires   the receipts. RLS on, no policies at all, which
--                               is how this codebase already locks
--                               schema_migrations: the service role goes
--                               straight past, every browser sees an empty
--                               table. Nothing in the app has a reason to read
--                               them, and the actor ids in the queue are a
--                               record of who changed what, which the board's
--                               own activity feed already answers under its own
--                               permissions.
-- =============================================================================

-- ---- Rules ------------------------------------------------------------------

alter table public.automation_rules enable row level security;

drop policy if exists automation_rules_select on public.automation_rules;
create policy automation_rules_select on public.automation_rules
  for select to authenticated
  using (private.can_view_board(board_id));

drop policy if exists automation_rules_insert on public.automation_rules;
create policy automation_rules_insert on public.automation_rules
  for insert to authenticated
  with check (private.can_manage_board(board_id) and created_by = (select auth.uid()));

drop policy if exists automation_rules_update on public.automation_rules;
create policy automation_rules_update on public.automation_rules
  for update to authenticated
  using (private.can_manage_board(board_id))
  with check (private.can_manage_board(board_id));

drop policy if exists automation_rules_delete on public.automation_rules;
create policy automation_rules_delete on public.automation_rules
  for delete to authenticated
  using (private.can_manage_board(board_id));

-- ---- The log ----------------------------------------------------------------

alter table public.automation_runs enable row level security;

drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs
  for select to authenticated
  using (private.can_view_board(board_id));

-- Deliberately no insert, update or delete policy. Every row is written by the
-- runner with the service key; a browser that could forge one could tell
-- somebody an automation did something it never did.

-- ---- The runner's own tables ------------------------------------------------

alter table public.automation_events enable row level security;
alter table public.automation_marks enable row level security;
alter table public.automation_schedule_fires enable row level security;
