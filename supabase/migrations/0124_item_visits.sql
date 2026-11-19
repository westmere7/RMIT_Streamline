-- =============================================================================
-- 0124_item_visits.sql
--
-- When each person last opened each task, for "Recently visited" on Home, as
-- board_visits is for boards. Strictly per person: nobody reads anybody
-- else's. One row per person and task, moved forward on every visit, and only
-- for a task they can see.
-- =============================================================================

create table if not exists public.item_visits (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index if not exists item_visits_user_visited_idx on public.item_visits (user_id, visited_at desc);

comment on table public.item_visits is
  'Per-user "last opened this task"; drives the recently visited tasks on Home.';

alter table public.item_visits enable row level security;

drop policy if exists item_visits_select on public.item_visits;
create policy item_visits_select on public.item_visits
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists item_visits_insert on public.item_visits;
create policy item_visits_insert on public.item_visits
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_view_item(item_id));

drop policy if exists item_visits_update on public.item_visits;
create policy item_visits_update on public.item_visits
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.can_view_item(item_id));

drop policy if exists item_visits_delete on public.item_visits;
create policy item_visits_delete on public.item_visits
  for delete to authenticated
  using (user_id = (select auth.uid()));
