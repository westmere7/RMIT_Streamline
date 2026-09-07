-- =============================================================================
-- 0016_board_visit_view.sql
--
-- The view a person last used on a board (table, kanban, timeline, calendar,
-- gantt, workload, chart) is remembered per person and per board, so it follows
-- them between devices. It lives on the visit row that already records when they
-- last opened the board; the browser keeps a copy in localStorage for the first
-- paint. Null means "never chosen": the board opens on its table.
-- =============================================================================

alter table public.board_visits add column if not exists view text;
alter table public.board_visits add column if not exists view_settings jsonb not null default '{}'::jsonb;

comment on column public.board_visits.view is
  'Board view this person last used here (table | kanban | timeline | calendar | gantt | workload | chart); null = default.';
comment on column public.board_visits.view_settings is
  'Per-view settings this person chose on this board, keyed by view (kanban lanes, zoom, chart slicing …).';
