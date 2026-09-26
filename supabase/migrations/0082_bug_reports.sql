-- =============================================================================
-- 0082_bug_reports.sql
--
-- Anybody can report a bug from About or their own menu. The report becomes a
-- task in the Bugs group of an ordinary board, App development, that only the
-- app's keeper is a member of. The first report makes the board; the workspace
-- remembers which board it is here, and a deleted board is simply made again.
--
-- Screenshots go to the public `bug-screenshots` bucket at
-- <workspace-id>/<random-id>.webp and are linked from the task's Screenshot
-- columns. Only the server writes there (src/server/bug-report.ts, with the
-- service role): a reporter cannot see the board, so no upload policy of the
-- item-covers kind could let them in. There is no select policy either, so the
-- bucket cannot be listed; a screenshot is opened by its link.
-- =============================================================================

alter table public.workspaces add column if not exists bug_board_id uuid references public.boards(id) on delete set null;

comment on column public.workspaces.bug_board_id is 'The App development board bug reports land on. Null until the first report makes it.';

-- Advisory, like the avatars and item-covers buckets: if the migration role may
-- not touch storage, create the bucket by hand and the route says so on upload.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('bug-screenshots', 'bug-screenshots', true, 2097152, array['image/webp'])
  on conflict (id) do update set
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/webp'];
exception
  when insufficient_privilege or undefined_table then
    raise notice 'bug-screenshots bucket not created (%). Create it in Supabase → Storage: public, 2MB, image/webp.', sqlerrm;
end $$;
