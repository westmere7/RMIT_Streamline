-- =============================================================================
-- 0005_workspace_invitations_policies.sql
--
-- Invitation links are written by the server only (service role, bypasses RLS).
-- Workspace admins may read the rows of their own workspace so the members page
-- can offer "copy invite link" again after the dialog that first showed it has
-- closed. Nobody else sees them, and no client can insert, change or delete one:
-- the join page resolves a token through the server, never through PostgREST.
-- =============================================================================

drop policy if exists workspace_invitations_select_admin on public.workspace_invitations;
create policy workspace_invitations_select_admin on public.workspace_invitations
  for select to authenticated
  using (private.is_workspace_admin(workspace_id));
