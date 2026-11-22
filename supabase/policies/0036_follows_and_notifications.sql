-- =============================================================================
-- 0036_follows_and_notifications.sql
--
-- subscriptions (follows, 0092) were readable by everyone in the workspace,
-- which named boards a reader cannot see (private boards, Task Allocation)
-- and who follows them. A follow is now read by its owner, and by anyone who
-- can see the board it is on: the follower fan-out runs as the person who made
-- the change, on a board they can see, and still finds every follower there.
--
-- notifications could be written by any member, guests included, for anyone
-- in the workspace, with any type, title, body and link: a ready-made phishing
-- message from a colleague. A signed-in session may now write only what the
-- app writes from a session:
--
--   * as itself (actor_id), about a board it can edit (every notification a
--     session sends follows an edit there: a mention or reply, an assignment,
--     a status or date change, a link, a board seat, a followed change);
--   * of those kinds only (MENTION, COMMENT, BOARD_INVITE, ITEM_LINKED,
--     ASSIGNED, STATUS_CHANGED, DUE_DATE_CHANGED, SUBSCRIPTION); TASK_BOOKED
--     and MEMBER_JOINED are the server's (service role);
--   * pointing at that board, or at a task on it;
--   * to someone active or invited in the board's workspace who can see that
--     board, so a task's name or an update's words never reach someone who
--     could not open it;
--   * with a title and body of sensible length.
--
-- private.board_role_of(board, user) answers board_role() for someone other
-- than the caller, by the same rules (it runs board_role() with that person's
-- id in place of the caller's, then puts the caller's back).
-- public.board_viewers(board, users) is the app's way to ask which of the
-- people it is about to tell can see the board, so it drops the rest before
-- writing (NotificationService.deliver); a session may ask only about a board
-- it can see itself.
-- =============================================================================

create or replace function private.board_role_of(p_board_id uuid, p_user_id uuid)
returns public.board_role
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller text := current_setting('request.jwt.claim.sub', true);
  v_role   public.board_role;
begin
  if p_board_id is null or p_user_id is null then
    return null;
  end if;
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  v_role := private.board_role(p_board_id);
  perform set_config('request.jwt.claim.sub', coalesce(v_caller, ''), true);
  return v_role;
exception when others then
  perform set_config('request.jwt.claim.sub', coalesce(v_caller, ''), true);
  raise;
end;
$$;

revoke all on function private.board_role_of(uuid, uuid) from public, anon;
grant execute on function private.board_role_of(uuid, uuid) to authenticated, service_role;

create or replace function public.board_viewers(p_board uuid, p_users uuid[])
returns setof uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  if p_board is null or p_users is null then
    return;
  end if;
  if array_length(p_users, 1) > 1000 then
    raise exception 'board_viewers: at most 1000 people at a time';
  end if;
  if session_user = 'authenticator' and coalesce(auth.role(), '') <> 'service_role'
     and not (coalesce(private.is_workspace_member(private.board_workspace(p_board)), false)
              and coalesce(private.can_view_board(p_board), false)) then
    raise exception 'board_viewers: not allowed' using errcode = '42501';
  end if;
  for v_user in select distinct u from unnest(p_users) u where u is not null loop
    if private.board_role_of(p_board, v_user) is not null then
      return next v_user;
    end if;
  end loop;
end;
$$;

revoke all on function public.board_viewers(uuid, uuid[]) from public, anon;
grant execute on function public.board_viewers(uuid, uuid[]) to authenticated, service_role;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (private.is_workspace_member(workspace_id) and coalesce(private.can_view_board(board_id), false))
  );

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and type in ('MENTION', 'COMMENT', 'BOARD_INVITE', 'ITEM_LINKED', 'ASSIGNED', 'STATUS_CHANGED', 'DUE_DATE_CHANGED', 'SUBSCRIPTION')
    and board_id is not null
    and coalesce(private.can_edit_board(board_id), false)
    and case entity_type
          when 'ITEM' then private.item_board(entity_id) = board_id
          when 'BOARD' then entity_id = board_id
          else false
        end
    and workspace_id is not distinct from private.board_workspace(board_id)
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = private.board_workspace(notifications.board_id)
        and m.user_id = notifications.user_id
        and m.status in ('ACTIVE', 'INVITED')
    )
    and private.board_role_of(board_id, user_id) is not null
    and char_length(title) <= 1000
    and coalesce(char_length(body), 0) <= 4000
  );
