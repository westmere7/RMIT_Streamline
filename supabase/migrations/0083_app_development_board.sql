-- =============================================================================
-- 0083_app_development_board.sql
--
-- The App development board becomes built in (system = 'APP_DEVELOPMENT'), so
-- it cannot be archived, moved or deleted from the app, and only its members
-- see it (policies/0021_members_only_boards.sql).
--
-- v0.52.0 made the board as an ordinary private one and remembered it in
-- workspaces.bug_board_id. Any such board is marked here. The app does the same
-- on the next report for a board this finds nothing to do for, and finds the
-- board by its kind from now on; bug_board_id stays as the pointer it sets
-- beside it.
-- =============================================================================

update public.boards b
set system = 'APP_DEVELOPMENT'
from public.workspaces w
where w.bug_board_id = b.id
  and b.system is null
  and b.archived_at is null
  and not exists (select 1 from public.boards o where o.workspace_id = b.workspace_id and o.system = 'APP_DEVELOPMENT');

comment on column public.boards.system is 'Set when the app created the board itself: TASK_ALLOCATION (admins only) or APP_DEVELOPMENT (its members only). Renamable, never removable.';
