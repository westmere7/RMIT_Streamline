-- =============================================================================
-- 0102_board_primary_action.sql
--
-- The board toolbar's first button is a slot: New item, unless the board has
-- put one of its quick runs there. Null is New item. The JSON shape is
-- src/domain/board/board.ts (BoardPrimaryAction), read back through
-- boardPrimaryAction(); a quick run that has since been deleted reads as New
-- item in the app, so nothing here has to follow a rule's deletion.
--
-- Written by whoever may change the board's settings, under the boards
-- policies already in place.
-- =============================================================================

alter table public.boards add column if not exists primary_action jsonb;

comment on column public.boards.primary_action is 'The toolbar''s first button: null for New item, or {kind: "quick_run", ruleId, label}.';
