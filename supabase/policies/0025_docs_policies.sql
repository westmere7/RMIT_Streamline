-- =============================================================================
-- 0025_docs_policies.sql
--
-- Docs (migration 0107), as trackers are (policies/0003), mirrored by
-- canEditDocs() in src/lib/permissions:
--
--   read    anyone active in the workspace
--   write   anyone but guests; a new doc is made as yourself
--
-- The PDFs in the `docs` bucket follow the doc's workspace, the first folder of
-- their path: <workspace id>/<doc id>/<file name>.
-- =============================================================================

alter table public.docs enable row level security;

drop policy if exists docs_select on public.docs;
create policy docs_select on public.docs
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs
  for insert to authenticated
  with check (private.can_edit_trackers(workspace_id) and created_by = (select auth.uid()));

drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs
  for update to authenticated
  using (private.can_edit_trackers(workspace_id))
  with check (private.can_edit_trackers(workspace_id));

drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs
  for delete to authenticated
  using (private.can_edit_trackers(workspace_id));

do $$
begin
  drop policy if exists docs_files_read on storage.objects;
  create policy docs_files_read on storage.objects
    for select to authenticated
    using (bucket_id = 'docs' and private.is_workspace_member(((storage.foldername(name))[1])::uuid));

  drop policy if exists docs_files_write on storage.objects;
  create policy docs_files_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'docs' and private.can_edit_trackers(((storage.foldername(name))[1])::uuid));

  drop policy if exists docs_files_update on storage.objects;
  create policy docs_files_update on storage.objects
    for update to authenticated
    using (bucket_id = 'docs' and private.can_edit_trackers(((storage.foldername(name))[1])::uuid));

  drop policy if exists docs_files_delete on storage.objects;
  create policy docs_files_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'docs' and private.can_edit_trackers(((storage.foldername(name))[1])::uuid));
exception when insufficient_privilege or undefined_table then
  raise notice 'storage policies for "docs" not created: %', sqlerrm;
end
$$;
