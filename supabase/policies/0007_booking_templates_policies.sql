-- =============================================================================
-- 0007_booking_templates_policies.sql
--
-- Saved booking forms (migrations/0019_booking_form_templates.sql). Every
-- member may read them; only workspace admins shape the form, so only they
-- may save, rename or delete a template. Mirrors canManageWorkspace in
-- src/lib/permissions/permissions.ts.
--
-- The live form itself sits on workspaces.booking_form and is covered by the
-- workspaces_update policy (admins only) from 0001.
-- =============================================================================

alter table public.booking_templates enable row level security;

drop policy if exists booking_templates_select on public.booking_templates;
create policy booking_templates_select on public.booking_templates
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists booking_templates_insert on public.booking_templates;
create policy booking_templates_insert on public.booking_templates
  for insert to authenticated
  with check (private.is_workspace_admin(workspace_id) and created_by = (select auth.uid()));

drop policy if exists booking_templates_update on public.booking_templates;
create policy booking_templates_update on public.booking_templates
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

drop policy if exists booking_templates_delete on public.booking_templates;
create policy booking_templates_delete on public.booking_templates
  for delete to authenticated
  using (private.is_workspace_admin(workspace_id));
