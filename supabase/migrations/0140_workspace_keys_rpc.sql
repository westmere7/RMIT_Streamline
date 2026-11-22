-- =============================================================================
-- 0140_workspace_keys_rpc.sql
--
-- A workspace's join key (the /invite/<key> link) and booking key (the public
-- booking form) were plain columns of `workspaces`, so everyone in the
-- workspace, guests included, could read them: a guest could join again as a
-- member through the link, or pass the booking form round. 0141 takes the two
-- columns away from signed-in sessions; this is how the people who need them
-- still read them:
--
--   workspace admins   their workspaces' keys (Members → Join link, the
--                      booking page's Copy link)
--   the service role   every workspace's (server routes: booking, self-join)
--
-- Shipped one deploy ahead of 0141 is safe: the app reads the keys through this
-- function either way.
-- =============================================================================

create or replace function public.workspace_keys(p_workspace_ids uuid[])
returns table (workspace_id uuid, join_key text, booking_key text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id, w.join_key, w.booking_key
  from public.workspaces w
  where w.id = any(p_workspace_ids)
    and (
      coalesce(auth.role(), '') = 'service_role'
      or session_user <> 'authenticator'
      or coalesce(private.is_workspace_admin(w.id), false)
    )
$$;

revoke all on function public.workspace_keys(uuid[]) from public, anon;
grant execute on function public.workspace_keys(uuid[]) to authenticated, service_role;
