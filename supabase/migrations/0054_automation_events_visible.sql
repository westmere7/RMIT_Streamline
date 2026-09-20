-- =============================================================================
-- 0054_automation_events_visible.sql
--
-- The queue becomes something a board can watch.
--
-- Until now `automation_events` was the runner's alone: RLS on, no policies,
-- "never read by the browser". That kept it cheap and private, but it also
-- meant a person editing a board with rules had no sign that anything was
-- happening. The write returned, the nudge went off, and for the second or two
-- before the runner got round to it the board looked exactly as it would with
-- no automations at all — which is what "the notification doesn't work" looks
-- like from a chair.
--
-- So the queue joins the realtime publication, and policies/0018 lets anyone
-- who can see a board see its rows. The browser reads one thing from it: which
-- boards still have an unprocessed row. The board's automation icon turns
-- while its board is among them; the sidebar's does the same for boards the
-- person is not looking at.
-- =============================================================================

comment on table public.automation_events is
  'What happened on a board, as the database saw it. Drained by the server-side runner; the browser only watches which boards still have a pending row.';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.automation_events;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
