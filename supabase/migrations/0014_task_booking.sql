-- =============================================================================
-- 0014_task_booking.sql
--
-- Task booking. Stakeholders ask for work through a public form
-- (/book/<workspace slug>/<key>); each booking becomes an item on the
-- workspace's "Task Allocation" board, which lives in an "Admin" team. Both are
-- created by the app (see WorkspaceService.ensureSystemEntities) and marked as
-- system rows: they can be renamed but never archived or deleted, and only
-- workspace admins can see them (policies/0006_system_entities_policies.sql).
--
-- A team may choose a board of its own to receive bookings directly
-- (teams.booking_board_id); otherwise its bookings wait on Task Allocation.
-- =============================================================================

alter table public.teams add column if not exists system text;
alter table public.teams add column if not exists booking_board_id uuid references public.boards (id) on delete set null;
alter table public.boards add column if not exists system text;
alter table public.workspaces add column if not exists booking_key text;

comment on column public.teams.system is 'Set when the app created the team itself (ADMIN). Renamable, never removable, admins only.';
comment on column public.teams.booking_board_id is 'Board that receives this team''s bookings directly; null means Task Allocation.';
comment on column public.boards.system is 'Set when the app created the board itself (TASK_ALLOCATION). Renamable, never removable, admins only.';
comment on column public.workspaces.booking_key is 'Secret in the public booking link. Null until an admin first opens the workspace.';

-- At most one of each per workspace, so two admins loading at once cannot make twins.
create unique index if not exists teams_one_system_per_workspace on public.teams (workspace_id, system) where system is not null;
create unique index if not exists boards_one_system_per_workspace on public.boards (workspace_id, system) where system is not null;

-- Admins are told about each booking through the inbox.
alter type public.notification_type add value if not exists 'TASK_BOOKED';
