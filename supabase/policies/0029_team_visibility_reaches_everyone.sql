-- =============================================================================
-- 0029_team_visibility_reaches_everyone.sql
--
-- When a team is kept to itself (policies/0028), everyone outside it should see
-- it go at once. Realtime only delivers a row to people allowed to read it, and
-- once the team is hidden its UPDATE is no longer theirs to read: the change
-- that hides it never reaches the people it hides it from. (Opening it up
-- works, because by then they can read it.)
--
-- So a change of who sees a team's boards also touches the workspace row,
-- which every member reads, and the app reloads its teams, boards, trackers and
-- docs on that (use-workspace-realtime.ts). Rare: only an admin changing the
-- setting fires it.
-- =============================================================================

create or replace function private.touch_workspace_on_team_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.board_visibility is distinct from old.board_visibility then
    update public.workspaces set updated_at = now() where id = new.workspace_id;
  end if;
  return null;
end;
$$;

drop trigger if exists teams_visibility_touches_workspace on public.teams;
create trigger teams_visibility_touches_workspace
  after update of board_visibility on public.teams
  for each row execute function private.touch_workspace_on_team_visibility();

-- -----------------------------------------------------------------------------
-- "Not found" or "not yours to open"?
--
-- A team, board, tracker or doc that someone may not see is simply absent to
-- them, so a link to it read "not found, it may have been removed": untrue, and
-- it sends people looking for something that is there. This says which, for a
-- caller who is a member of the workspace asked about, and only there: to
-- anyone else everything is 'missing', so nothing is learned about other
-- workspaces. Teams, trackers and docs are named by id, boards by their slug.
-- -----------------------------------------------------------------------------
create or replace function public.access_to(p_kind text, p_workspace_id uuid, p_ref text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid;
  v_team uuid;
begin
  if (select auth.uid()) is null or not private.is_workspace_member(p_workspace_id) then
    return 'missing';
  end if;

  if p_kind = 'team' then
    select t.id into v_id from public.teams t where t.workspace_id = p_workspace_id and t.id::text = p_ref;
    if v_id is null then return 'missing'; end if;
    return case
      when exists (
        select 1 from public.teams t
        where t.id = v_id
          and (t.system is null or private.is_workspace_admin(p_workspace_id))
          and private.can_see_team(t.id)
      ) then 'ok'
      else 'denied'
    end;
  elsif p_kind = 'board' then
    select b.id into v_id from public.boards b where b.workspace_id = p_workspace_id and b.slug = p_ref limit 1;
    if v_id is null then return 'missing'; end if;
    return case when private.board_role(v_id) is not null then 'ok' else 'denied' end;
  elsif p_kind = 'tracker' then
    select t.id, t.team_id into v_id, v_team from public.trackers t where t.workspace_id = p_workspace_id and t.id::text = p_ref;
    if v_id is null then return 'missing'; end if;
    return case when private.can_see_team(v_team) then 'ok' else 'denied' end;
  elsif p_kind = 'doc' then
    select d.id, d.team_id into v_id, v_team from public.docs d where d.workspace_id = p_workspace_id and d.id::text = p_ref;
    if v_id is null then return 'missing'; end if;
    return case when private.can_see_team(v_team) then 'ok' else 'denied' end;
  end if;
  return 'missing';
end;
$$;

revoke all on function public.access_to(text, uuid, text) from public, anon;
grant execute on function public.access_to(text, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- A team kept to itself still shows, by name, to someone added to one of its
-- boards (or owning one), so that board sits under its team rather than alone.
-- Only the team row and its member list: its other boards, its trackers and its
-- docs stay hidden from them (they follow can_see_team, which this leaves alone).
-- -----------------------------------------------------------------------------
create or replace function private.has_board_in_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.boards b
    where b.team_id = p_team_id
      and private.workspace_role(b.workspace_id) is not null
      and (
        b.owner_id = (select auth.uid())
        or exists (select 1 from public.board_members bm where bm.board_id = b.id and bm.user_id = (select auth.uid()))
      )
  )
$$;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated
  using (
    private.is_workspace_member(workspace_id)
    and (system is null or private.is_workspace_admin(workspace_id))
    and (
      board_visibility = 'WORKSPACE'
      or private.is_workspace_admin(workspace_id)
      or private.is_team_member(id)
      or private.has_board_in_team(id)
    )
  );
