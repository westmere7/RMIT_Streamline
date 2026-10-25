-- =============================================================================
-- 0112_team_rights_need_a_seat.sql
--
-- Being on a team counts only while you are active in the team's workspace.
--
-- private.is_team_member read team_members alone, and deactivating somebody
-- (WorkspaceService.setMemberActive) leaves their team rows in place. So a
-- person deactivated in one workspace, still able to sign in through another,
-- kept private.can_manage_team on that workspace's teams: renaming and
-- archiving them (teams_update) and adding or removing their members
-- (team_members_insert/update/delete), which hands out edit rights on the
-- team's TEAM boards. Deactivation is the offboarding control (Audit F-001); it
-- has to reach the teams too.
--
-- The seat check goes in is_team_member, so can_manage_team (admin, or a team
-- member) and every other caller follow it. private.board_role_for already asks
-- for an active seat before it gets to the team, so boards are unchanged.
-- Leaving a team stays open to anybody (team_members_delete: user_id = you).
-- =============================================================================

create or replace function private.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_workspace_member(private.team_workspace(p_team_id))
     and exists (
       select 1
       from public.team_members tm
       where tm.team_id = p_team_id
         and tm.user_id = (select auth.uid())
     )
$$;
