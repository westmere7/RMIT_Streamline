-- =============================================================================
-- 0023_board_saved_views_policies.sql
--
-- Saved board views (migration 0099). Mirrored in
-- src/features/boards/saved-views/saved-views.ts (canChangeView):
--
--   read    anyone who can see the board reads its shared views and their own
--   insert  anyone who can see the board saves a private view as themselves;
--           a shared one needs edit rights on the board
--   update  the saver changes their own; a shared view is also any editor's,
--   delete  and only an editor can leave a view shared
-- =============================================================================

alter table public.board_saved_views enable row level security;

drop policy if exists board_saved_views_select on public.board_saved_views;
create policy board_saved_views_select on public.board_saved_views
  for select to authenticated
  using (private.can_view_board(board_id) and (shared or created_by = (select auth.uid())));

drop policy if exists board_saved_views_insert on public.board_saved_views;
create policy board_saved_views_insert on public.board_saved_views
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.can_view_board(board_id)
    and (not shared or private.can_edit_board(board_id))
  );

drop policy if exists board_saved_views_update on public.board_saved_views;
create policy board_saved_views_update on public.board_saved_views
  for update to authenticated
  using (
    private.can_view_board(board_id)
    and (created_by = (select auth.uid()) or (shared and private.can_edit_board(board_id)))
  )
  with check (
    private.can_view_board(board_id)
    and (created_by = (select auth.uid()) or private.can_edit_board(board_id))
    and (not shared or private.can_edit_board(board_id))
  );

drop policy if exists board_saved_views_delete on public.board_saved_views;
create policy board_saved_views_delete on public.board_saved_views
  for delete to authenticated
  using (
    private.can_view_board(board_id)
    and (created_by = (select auth.uid()) or (shared and private.can_edit_board(board_id)))
  );
