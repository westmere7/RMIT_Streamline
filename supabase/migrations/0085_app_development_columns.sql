-- =============================================================================
-- 0085_app_development_columns.sql
--
-- The App development board takes off what bug reports have no use for. It was
-- made (v0.52.0 to v0.53.0) with the special columns every board holds, the
-- ones a bug does not need left hidden: Due date, Timeline, Department, Size
-- and Assets recap. Hidden still offers them in the task panel and the column
-- menu, so they are taken off the board instead (removed, as a person taking a
-- special column off does), and a special column taken off is not added back.
-- The app does the same for a board it makes from now on; the Assets tab and
-- the views that need dates or a workload are left out in the app itself.
-- =============================================================================

update public.board_columns c
set removed = true, hidden = true
from public.boards b
where b.id = c.board_id
  and b.system = 'APP_DEVELOPMENT'
  and c.type in ('DATE', 'TIMELINE', 'STAKEHOLDER', 'SIZE', 'ASSETS_RECAP')
  and coalesce(c.removed, false) = false;
