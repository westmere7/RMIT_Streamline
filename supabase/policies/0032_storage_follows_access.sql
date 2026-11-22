-- =============================================================================
-- 0032_storage_follows_access.sql
--
-- Docs bucket (replaces the storage half of 0025). A doc's PDF lives at
-- <workspace id>/<doc id>/<file name>. It used to follow only the workspace,
-- so a member outside the doc's team (or a guest) could list, download,
-- overwrite and delete a team's PDFs. Now, while the doc row exists:
--
--   read           whoever can read the doc (member of its workspace who can
--                  see its team), the same rule as docs_select
--   write/delete   whoever can edit it (can_edit_trackers + can_see_team),
--                  the same rule as docs_update
--
-- Before the row exists (the app uploads first, then creates the doc under the
-- id it chose), anyone who can make a doc in that workspace may write there,
-- and only the uploader sees the file. After the row is gone the same holds,
-- so a deleted doc's PDF is nobody else's to read.
--
-- Public buckets (item-covers, avatars): public URLs never read these
-- policies, but the SELECT policy let anyone, signed in or not, LIST every
-- folder (task ids, user ids). Listing is now limited to what the caller can
-- write: the folders of tasks they can edit, their own avatar folder. Uploads
-- with upsert still see the row they write.
-- =============================================================================

-- Whether the caller may reach a file in the docs bucket. p_edit asks for
-- write rights; p_owner is the object's owner_id, for files whose doc row does
-- not exist (yet, or any more).
create or replace function private.can_reach_doc_file(p_name text, p_edit boolean, p_owner text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ws_text  text := (storage.foldername(p_name))[1];
  v_doc_text text := (storage.foldername(p_name))[2];
  v_ws       uuid;
  v_doc      public.docs%rowtype;
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  if v_ws_text is null or v_ws_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_ws := v_ws_text::uuid;

  if v_doc_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_doc from public.docs d where d.id = v_doc_text::uuid;
  end if;

  if v_doc.id is not null then
    return v_doc.workspace_id = v_ws
       and coalesce(private.is_workspace_member(v_doc.workspace_id), false)
       and coalesce(private.can_see_team(v_doc.team_id), false)
       and (not p_edit or coalesce(private.can_edit_trackers(v_doc.workspace_id), false));
  end if;

  -- No doc row: a file being uploaded for a doc about to be made, or left
  -- behind by a deleted one.
  if p_edit then
    return coalesce(private.can_edit_trackers(v_ws), false);
  end if;
  return p_owner is not null and p_owner = (select auth.uid())::text;
end;
$$;

revoke all on function private.can_reach_doc_file(text, boolean, text) from public;
grant execute on function private.can_reach_doc_file(text, boolean, text) to authenticated;

do $$
begin
  drop policy if exists docs_files_read on storage.objects;
  create policy docs_files_read on storage.objects
    for select to authenticated
    using (bucket_id = 'docs' and private.can_reach_doc_file(name, false, owner_id));

  drop policy if exists docs_files_write on storage.objects;
  create policy docs_files_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'docs' and private.can_reach_doc_file(name, true, owner_id));

  drop policy if exists docs_files_update on storage.objects;
  create policy docs_files_update on storage.objects
    for update to authenticated
    using (bucket_id = 'docs' and private.can_reach_doc_file(name, true, owner_id))
    with check (bucket_id = 'docs' and private.can_reach_doc_file(name, true, owner_id));

  drop policy if exists docs_files_delete on storage.objects;
  create policy docs_files_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'docs' and private.can_reach_doc_file(name, true, owner_id));

  -- Covers: listed only by those who can edit the task the folder is named after.
  drop policy if exists item_covers_read on storage.objects;
  create policy item_covers_read on storage.objects
    for select to authenticated
    using (
      bucket_id = 'item-covers'
      and case
            when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then coalesce(private.can_edit_item(((storage.foldername(name))[1])::uuid), false)
            else false
          end
    );

  -- Avatars: listed only by their owner.
  drop policy if exists avatars_read on storage.objects;
  create policy avatars_read on storage.objects
    for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
exception when insufficient_privilege or undefined_table then
  raise notice 'storage policies not replaced: %', sqlerrm;
end
$$;

-- A doc is deleted only by someone who could see and edit it (docs_delete
-- ignored the team).
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs
  for delete to authenticated
  using (private.can_edit_trackers(workspace_id) and private.can_see_team(team_id));
