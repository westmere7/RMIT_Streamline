-- =============================================================================
-- 0010_item_reads.sql
--
-- When a person last looked at an item's updates. The board shows a small
-- badge with the number of updates on each item; it reads as "new" when an
-- update by someone else is newer than this marker and newer than any read
-- notification about the item. Strictly per-user, like board_visits.
-- =============================================================================

create table if not exists public.item_reads (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  item_id  uuid not null references public.items (id) on delete cascade,
  seen_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index if not exists item_reads_user_idx on public.item_reads (user_id);

comment on table public.item_reads is
  'Per-user "caught up on this item''s updates" marker; drives the new-updates badge on boards.';

alter table public.item_reads enable row level security;

drop policy if exists item_reads_select on public.item_reads;
create policy item_reads_select on public.item_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists item_reads_insert on public.item_reads;
create policy item_reads_insert on public.item_reads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_view_item(item_id)
  );

drop policy if exists item_reads_update on public.item_reads;
create policy item_reads_update on public.item_reads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists item_reads_delete on public.item_reads;
create policy item_reads_delete on public.item_reads
  for delete to authenticated
  using (user_id = (select auth.uid()));
