-- =============================================================================
-- 0019_board_templates_policies.sql
--
-- Saved board layouts (migration 0077). Every member can see them and save one
-- of their own; only whoever saved a template, or an admin, can change or
-- delete it.
-- =============================================================================

alter table public.board_templates enable row level security;

drop policy if exists board_templates_select on public.board_templates;
create policy board_templates_select on public.board_templates
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists board_templates_insert on public.board_templates;
create policy board_templates_insert on public.board_templates
  for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and created_by = (select auth.uid()));

drop policy if exists board_templates_update on public.board_templates;
create policy board_templates_update on public.board_templates
  for update to authenticated
  using (created_by = (select auth.uid()) or private.is_workspace_admin(workspace_id))
  with check (created_by = (select auth.uid()) or private.is_workspace_admin(workspace_id));

drop policy if exists board_templates_delete on public.board_templates;
create policy board_templates_delete on public.board_templates
  for delete to authenticated
  using (created_by = (select auth.uid()) or private.is_workspace_admin(workspace_id));
