-- =============================================================================
-- 0106_member_weekly_hours.sql
--
-- How many hours a week a person works in this workspace, for the Workload
-- view's capacity: the hours their tasks need, set against the hours they have.
--
-- On the seat rather than the profile: people are shared between workspaces,
-- and someone split across two works part of their week in each. Empty means
-- the usual full-time week (DEFAULT_WEEKLY_HOURS in src/domain/workspace).
-- Written by workspace admins, like the rest of a seat
-- (workspace_members_update_admin); the Owner guard only watches role, status
-- and which workspace and person the seat is for, so it is untouched.
-- =============================================================================

alter table public.workspace_members
  add column if not exists weekly_hours numeric(4, 1)
  check (weekly_hours is null or (weekly_hours >= 0 and weekly_hours <= 80));

comment on column public.workspace_members.weekly_hours is
  'Hours a week this person works in this workspace; null for the default full-time week.';
