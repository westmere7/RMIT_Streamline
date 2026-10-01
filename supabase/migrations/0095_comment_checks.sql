-- =============================================================================
-- 0095_comment_checks.sql
--
-- Checklists in updates: a line written "- [ ] Send the proof" is a box anyone
-- working on the task can tick. One row per ticked box; no row, not ticked.
--
-- A table of its own, like comment_reactions (0070), because a comment row is
-- its author's to change (comments_update_author) and a checklist is everyone's
-- to work through. The box is named by its text (check_key, worked out by
-- checklistKeys in src/lib/rich-text.ts), so the author adding a line above it
-- does not move a tick onto the wrong one, and rewording a line clears it.
--
-- Ticking is working on the task, so it takes the same right as commenting:
-- private.can_edit_item. Anyone with that right can untick, not only whoever
-- ticked. Who ticked it is kept for the tooltip and goes null, not the tick,
-- when that person is removed.
-- =============================================================================

create table if not exists public.comment_checks (
  comment_id uuid not null references public.comments (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  check_key  text not null check (char_length(check_key) between 1 and 240),
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz not null default now(),
  primary key (comment_id, check_key)
);

create index if not exists comment_checks_item_idx on public.comment_checks (item_id);

alter table public.comment_checks enable row level security;
grant select, insert, delete on public.comment_checks to authenticated;

drop policy if exists comment_checks_select on public.comment_checks;
create policy comment_checks_select on public.comment_checks
  for select to authenticated
  using (private.can_view_item(item_id));

drop policy if exists comment_checks_insert on public.comment_checks;
create policy comment_checks_insert on public.comment_checks
  for insert to authenticated
  with check (
    checked_by = (select auth.uid())
    and private.can_edit_item(item_id)
    and exists (select 1 from public.comments c where c.id = comment_id and c.item_id = comment_checks.item_id)
  );

drop policy if exists comment_checks_delete on public.comment_checks;
create policy comment_checks_delete on public.comment_checks
  for delete to authenticated
  using (private.can_edit_item(item_id));

-- Live, like the comments: a tick shows on every open copy of the task.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_checks') then
    execute 'alter publication supabase_realtime add table public.comment_checks';
  end if;
end
$$;
