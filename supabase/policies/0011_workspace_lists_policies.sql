-- =============================================================================
-- 0011_workspace_lists_policies.sql
--
-- Who may see and shape a workspace's shared lists
-- (migrations/0026_workspace_lists.sql).
--
-- The lists are the workspace's vocabulary: every member reads them, because
-- every picker offers them, and only workspace admins (OWNER, ADMIN) change
-- them — matching canManageWorkspace in src/lib/permissions/permissions.ts.
-- =============================================================================

alter table public.workspace_lists enable row level security;

drop policy if exists workspace_lists_select on public.workspace_lists;
create policy workspace_lists_select on public.workspace_lists
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists workspace_lists_insert on public.workspace_lists;
create policy workspace_lists_insert on public.workspace_lists
  for insert to authenticated
  with check (private.is_workspace_admin(workspace_id));

drop policy if exists workspace_lists_update on public.workspace_lists;
create policy workspace_lists_update on public.workspace_lists
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

drop policy if exists workspace_lists_delete on public.workspace_lists;
create policy workspace_lists_delete on public.workspace_lists
  for delete to authenticated
  using (private.is_workspace_admin(workspace_id));
