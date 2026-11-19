-- =============================================================================
-- 0122_member_approval.sql
--
-- Joining through the workspace's join link (/invite/<key>) no longer lets
-- anyone in on its own: the person finishes their profile and then waits, as
-- AWAITING_APPROVAL, until an admin approves them (Members, or the inbox item
-- the admins get). Someone an admin added from Members is let in on finishing,
-- as before: an admin already chose them.
--
--   workspace_invitations.needs_approval  set on the links the join link makes
--   my_waiting_workspaces()               the workspaces the caller is waiting
--                                         on, for their waiting screen; they
--                                         can read nothing else there yet
-- =============================================================================

alter table public.workspace_invitations
  add column if not exists needs_approval boolean not null default false;

create or replace function public.my_waiting_workspaces()
returns table (workspace_id uuid, workspace_name text, workspace_slug text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id, w.name, w.slug
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = (select auth.uid())
    and m.status = 'AWAITING_APPROVAL'
  order by w.name
$$;

revoke all on function public.my_waiting_workspaces() from public, anon;
grant execute on function public.my_waiting_workspaces() to authenticated;
