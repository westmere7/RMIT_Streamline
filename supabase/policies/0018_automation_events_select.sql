-- =============================================================================
-- 0018_automation_events_select.sql
--
-- Reading the queue, so a board can say its automations are at work.
--
-- 0017 left `automation_events` with RLS on and no policies, because nothing
-- in the app read it. Now one thing does: the "running" indicator on a board
-- and in the sidebar, which asks for the board ids of unprocessed rows and
-- nothing more (migrations/0054). The predicate is the one the log already
-- uses — if you may see the board, you may see that something is queued on it.
-- The actor ids this exposes are the same people the board's activity feed
-- names to the same audience. Still no insert, update or delete from a
-- browser; the runner alone writes here.
-- =============================================================================

drop policy if exists automation_events_select on public.automation_events;
create policy automation_events_select on public.automation_events
  for select to authenticated
  using (private.can_view_board(board_id));
