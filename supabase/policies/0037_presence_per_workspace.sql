-- =============================================================================
-- 0037_presence_per_workspace.sql
--
-- Who is online (src/lib/realtime/presence.ts), one channel per workspace
-- instead of one for the whole app (S19). 0027's presence:app let any active
-- member of any workspace hear everyone online in every workspace, and say
-- they were there among them.
--
--   topic   presence:<workspace id>
--   read    an active member of that workspace hears who else is in it
--   track   the same people may say they are here
--
-- The app joins the channel of each workspace the person is active in, so a
-- colleague still sees them online wherever the two share a workspace.
--
-- What it cannot do: Realtime checks these policies when the channel is
-- joined, and the presence key a tab tracks under is its own choice, not part
-- of what the policy sees. A member can still claim to be another member of
-- the same workspace (light up their dot); no more than that.
--
-- presence:app has no policy any more, so a tab still running the old build
-- joins nothing and shows no dots until it reloads.
-- =============================================================================

-- Whether the caller is an active member of the workspace a presence topic
-- names. Anything that is not presence:<uuid> is no one's.
create or replace function private.can_use_presence_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_topic ~ '^presence:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      exists (
        select 1 from public.workspace_members m
        where m.workspace_id = substr(p_topic, 10)::uuid
          and m.user_id = (select auth.uid())
          and m.status = 'ACTIVE'
      )
    else false
  end;
$$;

revoke all on function private.can_use_presence_topic(text) from public, anon;
grant execute on function private.can_use_presence_topic(text) to authenticated;

drop policy if exists "presence: members hear who is online" on realtime.messages;
drop policy if exists "presence: members say they are online" on realtime.messages;

drop policy if exists "presence: workspace members hear who is online" on realtime.messages;
create policy "presence: workspace members hear who is online"
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'presence'
    and (select private.can_use_presence_topic(realtime.topic()))
  );

drop policy if exists "presence: workspace members say they are online" on realtime.messages;
create policy "presence: workspace members say they are online"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension = 'presence'
    and (select private.can_use_presence_topic(realtime.topic()))
  );
