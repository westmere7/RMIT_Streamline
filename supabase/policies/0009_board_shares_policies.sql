-- =============================================================================
-- 0009_board_shares_policies.sql
--
-- Who may see and shape a board's public link (migrations/0020_board_shares.sql).
--
-- Giving a board away to the internet is a manager's decision, so the rules
-- match canManageBoard in src/lib/permissions/permissions.ts: the board's owner,
-- anyone made an OWNER of it, and workspace admins. Everyone else on the board
-- may read the row, so the board bar can show that a link exists and who to ask.
--
-- Visitors are served by the service role and never reach these policies; the
-- anon and authenticated roles have no way to look a token up.
-- =============================================================================

alter table public.board_shares enable row level security;

drop policy if exists board_shares_select on public.board_shares;
create policy board_shares_select on public.board_shares
  for select to authenticated
  using (private.can_view_board(board_id));

drop policy if exists board_shares_insert on public.board_shares;
create policy board_shares_insert on public.board_shares
  for insert to authenticated
  with check (private.can_manage_board(board_id) and created_by = (select auth.uid()));

drop policy if exists board_shares_update on public.board_shares;
create policy board_shares_update on public.board_shares
  for update to authenticated
  using (private.can_manage_board(board_id))
  with check (private.can_manage_board(board_id));

drop policy if exists board_shares_delete on public.board_shares;
create policy board_shares_delete on public.board_shares
  for delete to authenticated
  using (private.can_manage_board(board_id));
