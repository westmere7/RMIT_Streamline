-- =============================================================================
-- 0044 – A column can be hidden on the board, in the panel, or in both
--
-- `board_columns.hidden` has always meant one thing: not shown in the table.
-- The task panel ignored it and listed every column, which is right for some —
-- a field you rarely set is still worth seeing when you open the task — and
-- wrong for others, where a column exists only to be sorted or filtered on and
-- is noise on the panel.
--
-- So hiding becomes two answers rather than one. `hidden` keeps its meaning
-- (the board's table); `hidden_in_panel` is the task panel's own. Hiding in
-- "both" sets the pair. Nothing changes for a column that existed before this:
-- the default is false, so every column stays on the panel exactly as it was.
-- =============================================================================

alter table public.board_columns
  add column if not exists hidden_in_panel boolean not null default false;
