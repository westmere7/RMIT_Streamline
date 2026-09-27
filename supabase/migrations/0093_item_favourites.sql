-- =============================================================================
-- 0093_item_favourites.sql
--
-- Starring a task, the way a board is starred: strictly per person. Starred
-- tasks are listed in My Work's Starred tab, which reads each board's own
-- columns through their roles, so tasks from boards laid out differently sit
-- in one list. A done task drops into a folded Done section there, and Clear
-- done unstars them in one go. board_id is kept on the row so a workspace's
-- stars are read without joining items, and so a star follows the board's
-- visibility.
-- =============================================================================

create table if not exists public.item_favourites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  board_id   uuid not null references public.boards (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

create index if not exists item_favourites_user_idx on public.item_favourites (user_id);

alter table public.item_favourites enable row level security;

drop policy if exists item_favourites_select on public.item_favourites;
create policy item_favourites_select on public.item_favourites
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists item_favourites_insert on public.item_favourites;
create policy item_favourites_insert on public.item_favourites
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_view_board(board_id)
    and private.item_board(item_id) = board_id
  );

drop policy if exists item_favourites_delete on public.item_favourites;
create policy item_favourites_delete on public.item_favourites
  for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.item_favourites is 'Tasks a person has starred; listed in My Work, Starred.';
