-- =============================================================================
-- 0049_realtime_everywhere.sql
--
-- Publishes the rest of the tables the app reads on screen, so nothing needs a
-- page refresh to be current.
--
-- The boards, the dashboard and My Work were live already (0004, 0024, 0035).
-- What was not was the frame around them: who is in the workspace, which teams
-- and boards exist, what a colleague is called, whether a link has been used,
-- what a stakeholder has just sent. Those tables were readable but silent, so
-- the only way to see a change in them was to reload.
--
-- Every table here is low-traffic — a membership, a name, a saved block, a
-- portal request — which is why a subscription to them can stay open on every
-- page (src/features/workspace/use-workspace-realtime.ts). The heavy tables
-- (items, values, assets) stay filtered and scoped to the page that needs them.
--
-- RLS is enforced on realtime streams, so a subscriber only receives rows it
-- could select. Adding a table twice raises an error, so each one is guarded.
--
-- Replica identity is left alone deliberately. `full` would make a filter match
-- a deletion, but deletions are not filtered by RLS, so the whole deleted row
-- would reach every subscriber to the table — private boards included. The
-- client subscribes to deletions unfiltered instead and refetches; the only
-- thing on the wire is an id. See src/lib/realtime/use-realtime.ts.
-- =============================================================================

do $$
declare
  t text;
begin
  for t in select unnest(array[
    -- Names and avatars: on every board, comment and assignment.
    'profiles',
    -- Who is here, at what level, and whether they have onboarded.
    'workspace_members',
    'workspace_invitations',
    -- Who belongs to which team and which board.
    'team_members',
    'board_members',
    -- The reader's own starred boards, so a second tab agrees.
    'board_favourites',
    -- Which updates the reader has caught up on, for the unread dot.
    'item_reads',
    'notification_preferences',
    -- The booking editor: what another admin saves while it is open.
    'booking_templates',
    'booking_saved_blocks',
    -- The portal card: its settings, its groups, and requests arriving from
    -- outside the workspace — the one change nobody here makes.
    'department_portals',
    'stakeholder_departments',
    'portal_requests'
  ])
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
