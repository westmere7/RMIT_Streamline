-- =============================================================================
-- 0070_comment_reactions.sql
--
-- Reactions on updates and replies: one row per person per emoji per comment.
--
-- A table of their own rather than a column on the comment, because a comment
-- row is its author's to change (comments_update_author) and a reaction is
-- everybody else's. The item id rides along so the policies can ask the same
-- question the comments do — can this person see the task? — without a join.
--
-- Anyone who can see the task can react, viewers included: a thumbs-up is
-- reading, not editing. Each person adds and takes away only their own.
-- =============================================================================

create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

create index if not exists comment_reactions_item_idx on public.comment_reactions (item_id);

alter table public.comment_reactions enable row level security;
grant select, insert, delete on public.comment_reactions to authenticated;

drop policy if exists comment_reactions_select on public.comment_reactions;
create policy comment_reactions_select on public.comment_reactions
  for select to authenticated
  using (private.can_view_item(item_id));

drop policy if exists comment_reactions_insert on public.comment_reactions;
create policy comment_reactions_insert on public.comment_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_view_item(item_id)
    and exists (select 1 from public.comments c where c.id = comment_id and c.item_id = comment_reactions.item_id)
  );

drop policy if exists comment_reactions_delete on public.comment_reactions;
create policy comment_reactions_delete on public.comment_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Live, like the comments themselves: a reaction shows up on every open copy of the task.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_reactions') then
    execute 'alter publication supabase_realtime add table public.comment_reactions';
  end if;
end
$$;
