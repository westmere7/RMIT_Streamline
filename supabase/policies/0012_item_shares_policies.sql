-- =============================================================================
-- 0012_item_shares_policies.sql
--
-- Who may see and shape the link to one task (migrations/0029_item_shares.sql).
--
-- The same rule as a board's link, one level down: anyone who can see the task
-- can see that a link exists, and whoever may manage the board it sits on may
-- create, change or remove it. Handing work outside is a board decision, not a
-- per-task one, so it is can_manage_board that decides — matching
-- canManageBoard in src/lib/permissions/permissions.ts.
--
-- Visitors are served by the service role and never reach these policies; the
-- anon and authenticated roles have no way to look a token up.
-- =============================================================================

alter table public.item_shares enable row level security;

drop policy if exists item_shares_select on public.item_shares;
create policy item_shares_select on public.item_shares
  for select to authenticated
  using (private.can_view_item(item_id));

drop policy if exists item_shares_insert on public.item_shares;
create policy item_shares_insert on public.item_shares
  for insert to authenticated
  with check (private.can_manage_board(private.item_board(item_id)) and created_by = (select auth.uid()));

drop policy if exists item_shares_update on public.item_shares;
create policy item_shares_update on public.item_shares
  for update to authenticated
  using (private.can_manage_board(private.item_board(item_id)))
  with check (private.can_manage_board(private.item_board(item_id)));

drop policy if exists item_shares_delete on public.item_shares;
create policy item_shares_delete on public.item_shares
  for delete to authenticated
  using (private.can_manage_board(private.item_board(item_id)));
