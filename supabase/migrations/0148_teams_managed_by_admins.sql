-- =============================================================================
-- 0148_teams_managed_by_admins.sql
--
-- Teams are run by the workspace's admins (decided 2026-11-22, from the full
-- audit). Until now anyone in a team, guests included, could rename or archive
-- it, add or remove its people (outsiders too) and change where its bookings
-- land, and any member could create one. Teams decide who sees and edits
-- their boards, so changing a team is changing access: an admin's job.
--
-- private.can_manage_team and private.can_create_team now answer for
-- workspace admins (owner or admin) only. Everything that asked them follows:
-- teams_insert, teams_update, team_members_insert/update/delete. Anybody can
-- still leave a team themselves (team_members_delete: user_id = you).
-- =============================================================================

create or replace function private.can_manage_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(private.is_workspace_admin(private.team_workspace(p_team_id)), false)
$$;

create or replace function private.can_create_team(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(private.is_workspace_admin(p_workspace_id), false)
$$;
