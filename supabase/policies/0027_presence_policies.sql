-- =============================================================================
-- 0027_presence_policies.sql
--
-- Who is online (src/lib/realtime/presence.ts). Supabase Realtime Presence
-- keeps the state in the Realtime server's memory; nothing is written to any
-- table. What Postgres decides is who may join the channel, through policies on
-- realtime.messages, which Realtime checks when a private channel is joined.
--
--   topic       presence:app, one channel for the whole app (people are
--               shared across workspaces)
--   read        an active member of any workspace hears who else is here
--   track       the same people may say they are here
--
-- Only presence on that one topic: no broadcast, and no other topic, is let
-- through by these policies.
-- =============================================================================

drop policy if exists "presence: members hear who is online" on realtime.messages;
create policy "presence: members hear who is online"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'presence:app'
    and extension = 'presence'
    and (select private.is_active_member_anywhere())
  );

drop policy if exists "presence: members say they are online" on realtime.messages;
create policy "presence: members say they are online"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.topic() = 'presence:app'
    and extension = 'presence'
    and (select private.is_active_member_anywhere())
  );
