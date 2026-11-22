-- =============================================================================
-- 0033_share_links_managers_only.sql
--
-- Share links (board_shares, item_shares, dashboard_shares) were readable,
-- token and password hash included, by everyone who could see the board, the
-- task or (for the dashboard) the workspace, guests too. The hash could be
-- cracked offline and the token opened the link. Now:
--
--   board_shares, item_shares   rows read by the board's managers
--                               (can_manage_board), who also write them
--   dashboard_shares            rows read by workspace admins, who write them
--
-- Everyone else on a board or task still learns that a link exists, and what
-- kind, through board_share_state() / item_share_state(): no token, no hash.
-- Visitors' reads of a link go through the service role (src/server/share.ts,
-- src/server/dashboard-share.ts) and are unaffected.
-- =============================================================================

drop policy if exists board_shares_select on public.board_shares;
create policy board_shares_select on public.board_shares
  for select to authenticated
  using (private.can_manage_board(board_id));

drop policy if exists item_shares_select on public.item_shares;
create policy item_shares_select on public.item_shares
  for select to authenticated
  using (private.can_manage_board(private.item_board(item_id)));

drop policy if exists dashboard_shares_select on public.dashboard_shares;
create policy dashboard_shares_select on public.dashboard_shares
  for select to authenticated
  using (private.is_workspace_admin(workspace_id));

-- Whether a board has a link, for anyone who can see the board.
create or replace function public.board_share_state(p_board_id uuid)
returns table (id uuid, board_id uuid, enabled boolean, expires_at date, access text, has_password boolean, created_by uuid, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.board_id, s.enabled, s.expires_at, s.access, s.password_hash is not null, s.created_by, s.created_at, s.updated_at
  from public.board_shares s
  where s.board_id = p_board_id
    and coalesce(private.can_view_board(p_board_id), false)
$$;

-- Whether a task has a link, for anyone who can see the task.
create or replace function public.item_share_state(p_item_id uuid)
returns table (id uuid, item_id uuid, enabled boolean, expires_at date, access text, has_password boolean, created_by uuid, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.item_id, s.enabled, s.expires_at, s.access, s.password_hash is not null, s.created_by, s.created_at, s.updated_at
  from public.item_shares s
  where s.item_id = p_item_id
    and coalesce(private.can_view_item(p_item_id), false)
$$;

revoke all on function public.board_share_state(uuid) from public, anon;
revoke all on function public.item_share_state(uuid) from public, anon;
grant execute on function public.board_share_state(uuid) to authenticated, service_role;
grant execute on function public.item_share_state(uuid) to authenticated, service_role;
