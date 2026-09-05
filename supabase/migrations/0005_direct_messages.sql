-- =============================================================================
-- 0005_direct_messages.sql
--
-- Direct messages between two people, avatars in storage, and the policy that
-- lets a workspace admin edit someone else's profile.
--
-- A thread is not a row: it is every message where the same two people are the
-- sender and the recipient, in either direction (see src/domain/message).
-- =============================================================================

create table if not exists public.direct_messages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body         text not null,
  -- Set when the recipient opens the thread.
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint direct_messages_not_self check (sender_id <> recipient_id),
  constraint direct_messages_body_not_empty check (length(btrim(body)) > 0)
);

-- Reading a thread looks up both directions, so index each side.
create index if not exists direct_messages_sender_idx on public.direct_messages (workspace_id, sender_id, created_at desc);
create index if not exists direct_messages_recipient_idx on public.direct_messages (workspace_id, recipient_id, created_at desc);
create index if not exists direct_messages_unread_idx on public.direct_messages (recipient_id, read_at);

alter table public.direct_messages enable row level security;

-- Only the two people involved ever see a message.
drop policy if exists direct_messages_select on public.direct_messages;
create policy direct_messages_select on public.direct_messages
  for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- You send as yourself, to someone you share a workspace with.
drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_workspace_member(workspace_id)
    and private.shares_workspace_with(recipient_id)
  );

-- The recipient marks a thread read; nobody edits the text after sending.
drop policy if exists direct_messages_update_recipient on public.direct_messages;
create policy direct_messages_update_recipient on public.direct_messages
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- The sender can take a message back.
drop policy if exists direct_messages_delete_sender on public.direct_messages;
create policy direct_messages_delete_sender on public.direct_messages
  for delete to authenticated
  using (sender_id = (select auth.uid()));

-- Live delivery, filtered by the policies above.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.direct_messages';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Workspace admins can edit the people in their workspace (name, job title,
-- department, avatar). profiles_update_self already covers editing your own.
-- -----------------------------------------------------------------------------
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (private.shares_workspace_with(id) and exists (
    select 1
    from public.workspace_members me
    where me.user_id = (select auth.uid())
      and me.status = 'ACTIVE'
      and me.role in ('OWNER', 'ADMIN')
      and exists (
        select 1 from public.workspace_members them
        where them.workspace_id = me.workspace_id and them.user_id = public.profiles.id
      )
  ))
  with check (private.shares_workspace_with(id));

-- -----------------------------------------------------------------------------
-- Avatars bucket. Images are converted to WebP in the browser before upload
-- (src/features/profile/avatar-upload.ts) and stored at "<user-id>.webp".
--
-- Storage objects belong to supabase_storage_admin; on a hosted project the
-- migration role can usually manage them, but not always. A failure here must
-- not block a deployment, so the whole block is advisory: if it cannot run,
-- create the bucket in the dashboard and the app falls back to an inline image.
-- -----------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 1048576, array['image/webp'])
  on conflict (id) do update set
    public = true,
    file_size_limit = 1048576,
    allowed_mime_types = array['image/webp'];

  -- Public read: avatars are shown all over the UI and carry nothing private.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_read') then
    execute $p$
      create policy avatars_read on storage.objects
        for select to public
        using (bucket_id = 'avatars')
    $p$;
  end if;

  -- Each person writes only their own file, named for their id.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_write_own') then
    execute $p$
      create policy avatars_write_own on storage.objects
        for insert to authenticated
        with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_update_own') then
    execute $p$
      create policy avatars_update_own on storage.objects
        for update to authenticated
        using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
        with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_delete_own') then
    execute $p$
      create policy avatars_delete_own on storage.objects
        for delete to authenticated
        using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$;
  end if;
exception
  when insufficient_privilege or undefined_table then
    raise notice 'Skipped the avatars bucket: %. Create it in Storage and re-run.', sqlerrm;
end
$$;
