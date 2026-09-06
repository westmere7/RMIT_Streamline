-- =============================================================================
-- 0013_item_covers.sql
--
-- Items can carry one cover image, shown on the details panel and kanban card.
-- The picture is re-encoded to WebP in the browser (3MB source cap) and stored
-- in the public `item-covers` bucket at <item-id>/cover.webp; the item keeps
-- the URL. Local mode inlines a data URL instead, so the column is plain text.
-- =============================================================================

alter table public.items add column if not exists cover_url text;

comment on column public.items.cover_url is 'Public URL of the item''s cover image (WebP), or null.';

-- Bucket and storage policies. Advisory, like the avatars bucket in 0005: if
-- the migration role may not touch storage, create the bucket by hand and the
-- app reports a clear message on upload.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('item-covers', 'item-covers', true, 3145728, array['image/webp'])
  on conflict (id) do update set
    public = true,
    file_size_limit = 3145728,
    allowed_mime_types = array['image/webp'];

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'item_covers_read') then
    execute $p$
      create policy item_covers_read on storage.objects
        for select to public
        using (bucket_id = 'item-covers')
    $p$;
  end if;

  -- The folder is the item id: anyone who may edit the item may set its cover.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'item_covers_write') then
    execute $p$
      create policy item_covers_write on storage.objects
        for insert to authenticated
        with check (bucket_id = 'item-covers' and private.can_edit_item(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'item_covers_update') then
    execute $p$
      create policy item_covers_update on storage.objects
        for update to authenticated
        using (bucket_id = 'item-covers' and private.can_edit_item(((storage.foldername(name))[1])::uuid))
        with check (bucket_id = 'item-covers' and private.can_edit_item(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'item_covers_delete') then
    execute $p$
      create policy item_covers_delete on storage.objects
        for delete to authenticated
        using (bucket_id = 'item-covers' and private.can_edit_item(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;
exception
  when insufficient_privilege or undefined_table then
    raise notice 'item-covers bucket not created (%). Create it in Supabase → Storage: public, 3MB, image/webp.', sqlerrm;
end $$;
