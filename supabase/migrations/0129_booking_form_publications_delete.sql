-- Past forms can be deleted (one at a time, or "Clean up" for all but the live
-- one), by the same people who can read them: the workspace's admins. The
-- service refuses the live form's own entry; the database only scopes by role.

drop policy if exists booking_form_publications_delete on public.booking_form_publications;
create policy booking_form_publications_delete on public.booking_form_publications
  for delete to authenticated
  using (private.is_workspace_admin(workspace_id));
