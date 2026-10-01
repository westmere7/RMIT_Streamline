-- =============================================================================
-- 0100_board_default_view.sql
--
-- A board's Default view can be saved too: what everyone sees on the board
-- when no other view is open. It is one row per board in board_saved_views,
-- always shared, so (policies/0023) only the board's editors save it. The app
-- never renames, unshares or deletes it.
-- =============================================================================

alter table public.board_saved_views add column if not exists is_default boolean not null default false;

alter table public.board_saved_views drop constraint if exists board_saved_views_default_is_shared;
alter table public.board_saved_views add constraint board_saved_views_default_is_shared check (not is_default or shared);

create unique index if not exists board_saved_views_one_default on public.board_saved_views (board_id) where is_default;
