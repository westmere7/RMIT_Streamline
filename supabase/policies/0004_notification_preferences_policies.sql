-- =============================================================================
-- 0004_notification_preferences_policies.sql
--
-- Your notification settings are yours: you are the only one who can read or
-- change the row.
--
-- Writing a notification, though, means knowing how its *recipient* wants to be
-- reached, and that happens while acting as the sender. `notification_delivery_rules`
-- is a definer view over the same table that answers exactly that question, and
-- only for people you share a workspace with. It exposes no more than the
-- settings screen would show them anyway.
--
-- These settings are a courtesy, not a security boundary: `notifications_insert`
-- already lets any member write a notification to a colleague, so a hand-rolled
-- request could still ignore someone's choice. Nothing here is sensitive enough
-- to warrant moving delivery into a trigger; if that changes, the decision has
-- one home (src/services/notification-service.ts) and can move wholesale.
-- =============================================================================

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notification_preferences_delete_own on public.notification_preferences;
create policy notification_preferences_delete_own on public.notification_preferences
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- The view the sender reads. security_invoker is off (the default for a view),
-- so it runs as its owner and can see the table; the where clause is what keeps
-- it to colleagues.
create or replace view public.notification_delivery_rules
  with (security_invoker = off) as
  select p.user_id, p.types, p.muted_board_ids, p.browser_enabled, p.updated_at
  from public.notification_preferences p
  where p.user_id = (select auth.uid()) or private.shares_workspace_with(p.user_id);

revoke all on public.notification_delivery_rules from anon;
grant select on public.notification_delivery_rules to authenticated;
