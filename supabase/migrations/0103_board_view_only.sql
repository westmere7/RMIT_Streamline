-- =============================================================================
-- 0103_board_view_only.sql
--
-- A board can be set view only for everyone on it, against accidental change.
-- A safety catch, not a permission: the app stops offering edits while it is
-- on, and a board manager turns it off again. Nothing here changes who may
-- write; the boards policies already say who may set it.
-- =============================================================================

alter table public.boards add column if not exists view_only boolean not null default false;

comment on column public.boards.view_only is 'View only for everyone, against accidental change. Not a permission.';
