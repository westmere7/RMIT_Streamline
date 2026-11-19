-- =============================================================================
-- 0123_board_see_edit.sql
--
-- Who can see a board and who can edit it, as two settings (policies/0030):
--
--   teams.board_edit       who edits the team's boards, beyond admins and the
--                          people added to each: 'ADDED' (nobody else),
--                          'TEAM' (its members), 'VIEWERS' (everyone who can
--                          see it). Replaces members_can_edit (true = 'TEAM'),
--                          which stays for now but is no longer read.
--   boards.follows_team    a team's board takes its team's two settings; off,
--                          it has its own. A board with no team has its own.
--   boards.edit_scope      the board's own "who can edit", used when it does not
--                          follow a team: 'ADDED', 'TEAM' (team boards only),
--                          'VIEWERS'. Its own "who can see" is `visibility`
--                          (WORKSPACE / TEAM / PRIVATE), as before.
--
-- Nobody's access changes: each team's board_edit is what members_can_edit
-- said, a private team board keeps its own settings (private, added people
-- edit), every other team board follows its team, and a board with no team
-- keeps its visibility with added people editing, which is what it had.
-- =============================================================================

alter table public.teams
  add column if not exists board_edit text not null default 'ADDED';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_board_edit_check') then
    alter table public.teams add constraint teams_board_edit_check check (board_edit in ('ADDED', 'TEAM', 'VIEWERS'));
  end if;
end $$;

update public.teams set board_edit = case when members_can_edit then 'TEAM' else 'ADDED' end;

alter table public.boards
  add column if not exists follows_team boolean not null default true,
  add column if not exists edit_scope text not null default 'ADDED';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'boards_edit_scope_check') then
    alter table public.boards add constraint boards_edit_scope_check check (edit_scope in ('ADDED', 'TEAM', 'VIEWERS'));
  end if;
end $$;

-- A private team board was already its own: keep it so.
update public.boards set follows_team = false where team_id is not null and visibility = 'PRIVATE';
