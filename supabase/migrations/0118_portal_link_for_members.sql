-- =============================================================================
-- 0118_portal_link_for_members.sql
--
-- Portal and Booking shows every member the portal's two links, to open and to
-- hand out, though only admins change anything there. department_portals stays
-- admin-only (policies/0013): its rows carry the password hash. This function
-- is the one way a member reads the workspace's portal, and it leaves the hash
-- out, saying only whether there is one.
--
-- Active members of that workspace only, guests excluded (they are people from
-- outside the team); anyone else gets null. Request counts (portal_requests)
-- stay admin-only and are not part of it.
-- =============================================================================

create or replace function public.portal_link_for_member(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (to_jsonb(p) - 'password_hash')
         || jsonb_build_object('password_hash', null, 'has_password', p.password_hash is not null)
  from public.department_portals p
  where p.workspace_id = p_workspace_id
    and p.department_id is null
    and private.workspace_role(p_workspace_id) in ('OWNER', 'ADMIN', 'MEMBER')
  limit 1
$$;

revoke all on function public.portal_link_for_member(uuid) from public, anon;
grant execute on function public.portal_link_for_member(uuid) to authenticated;
