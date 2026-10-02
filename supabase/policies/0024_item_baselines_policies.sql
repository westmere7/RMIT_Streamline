-- =============================================================================
-- 0024_item_baselines_policies.sql
--
-- Board baselines (migration 0105):
--
--   read    anyone who can see the board
--   write   anyone who can edit it: saving or clearing the baseline is an
--           edit to the board's plan
-- =============================================================================

alter table public.item_baselines enable row level security;

drop policy if exists item_baselines_select on public.item_baselines;
create policy item_baselines_select on public.item_baselines
  for select to authenticated
  using (private.can_view_board(board_id));

drop policy if exists item_baselines_insert on public.item_baselines;
create policy item_baselines_insert on public.item_baselines
  for insert to authenticated
  with check (private.can_edit_board(board_id));

drop policy if exists item_baselines_update on public.item_baselines;
create policy item_baselines_update on public.item_baselines
  for update to authenticated
  using (private.can_edit_board(board_id))
  with check (private.can_edit_board(board_id));

drop policy if exists item_baselines_delete on public.item_baselines;
create policy item_baselines_delete on public.item_baselines
  for delete to authenticated
  using (private.can_edit_board(board_id));
