-- =============================================================================
-- 0016_booking_saved_blocks_policies.sql
--
-- Saved brief blocks (migrations/0039_booking_saved_blocks.sql). The same rule
-- as booking_templates: every member may read them, only workspace admins may
-- save or delete one. Mirrors canManageWorkspace in
-- src/lib/permissions/permissions.ts.
-- =============================================================================

alter table public.booking_saved_blocks enable row level security;

drop policy if exists booking_saved_blocks_select on public.booking_saved_blocks;
create policy booking_saved_blocks_select on public.booking_saved_blocks
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists booking_saved_blocks_insert on public.booking_saved_blocks;
create policy booking_saved_blocks_insert on public.booking_saved_blocks
  for insert to authenticated
  with check (private.is_workspace_admin(workspace_id) and created_by = (select auth.uid()));

drop policy if exists booking_saved_blocks_update on public.booking_saved_blocks;
create policy booking_saved_blocks_update on public.booking_saved_blocks
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

drop policy if exists booking_saved_blocks_delete on public.booking_saved_blocks;
create policy booking_saved_blocks_delete on public.booking_saved_blocks
  for delete to authenticated
  using (private.is_workspace_admin(workspace_id));
