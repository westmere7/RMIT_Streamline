-- =============================================================================
-- 0120_team_board_access.sql
--
-- A team decides who can see its boards and what its own members may do on
-- them (Edit team → Board access), instead of each board on its own:
--
--   board_visibility   'WORKSPACE'  everyone active in the workspace can see
--                                   the team's boards (read only), as before
--                      'TEAM'       only the team (and admins, and anyone
--                                   added to a board); the team itself is
--                                   hidden from everyone else
--   members_can_edit   the team's members edit every one of its boards that
--                      is not private, without being added to each
--
-- A board keeps one setting of its own: Private. The rules that read these
-- are in policies/0028_team_board_access_policies.sql.
--
-- The defaults are what every live team board had on 2026-11-19 (each one
-- WORKSPACE-visible, team members reading only), so nobody's access changes
-- when this lands.
-- =============================================================================

alter table public.teams
  add column if not exists board_visibility text not null default 'WORKSPACE',
  add column if not exists members_can_edit boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_board_visibility_check') then
    alter table public.teams
      add constraint teams_board_visibility_check check (board_visibility in ('WORKSPACE', 'TEAM'));
  end if;
end $$;
