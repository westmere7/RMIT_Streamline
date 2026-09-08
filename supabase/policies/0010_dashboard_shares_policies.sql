-- =============================================================================
-- 0010_dashboard_shares_policies.sql
--
-- Who may see and shape the workspace dashboard's public link
-- (migrations/0024_dashboard_shares.sql).
--
-- The dashboard sums up every board in the workspace, so handing it to the
-- internet is a workspace decision: only workspace admins (OWNER, ADMIN) may
-- create, change or remove the link, matching canManageDashboardShare in
-- src/lib/permissions/permissions.ts. Every member may read the row, so the
-- dashboard page can show that a link exists and who to ask.
--
-- Visitors are served by the service role and never reach these policies; the
-- anon and authenticated roles have no way to look a token up.
-- =============================================================================

alter table public.dashboard_shares enable row level security;

drop policy if exists dashboard_shares_select on public.dashboard_shares;
create policy dashboard_shares_select on public.dashboard_shares
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists dashboard_shares_insert on public.dashboard_shares;
create policy dashboard_shares_insert on public.dashboard_shares
  for insert to authenticated
  with check (private.is_workspace_admin(workspace_id) and created_by = (select auth.uid()));

drop policy if exists dashboard_shares_update on public.dashboard_shares;
create policy dashboard_shares_update on public.dashboard_shares
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

drop policy if exists dashboard_shares_delete on public.dashboard_shares;
create policy dashboard_shares_delete on public.dashboard_shares
  for delete to authenticated
  using (private.is_workspace_admin(workspace_id));
