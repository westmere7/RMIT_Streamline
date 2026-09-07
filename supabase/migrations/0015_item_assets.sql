-- =============================================================================
-- 0015_item_assets.sql
--
-- Asset lines: the deliverables of one task, listed line by line (what, which
-- asset type, how many, who is in charge, due when). Every item has an "Assets"
-- tab; a board may add an "Assets recap" column whose value is a summary the
-- app recomputes whenever the lines change ({"type":"ASSETS_RECAP",...}).
--
-- board_id is denormalised so a whole board's lines can be read in one query
-- (the recap cells); a trigger keeps it equal to the item's board.
-- =============================================================================

alter type public.column_type add value if not exists 'ASSETS_RECAP';

create table if not exists public.item_assets (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items (id) on delete cascade,
  board_id    uuid not null references public.boards (id) on delete cascade,
  name        text not null,
  asset_type  text,
  quantity    integer check (quantity is null or quantity >= 0),
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date    date,
  notes       text,
  position    double precision not null default 0,
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint item_assets_name_not_empty check (length(btrim(name)) > 0)
);

create index if not exists item_assets_item_idx on public.item_assets (item_id, position);
create index if not exists item_assets_board_idx on public.item_assets (board_id);
create index if not exists item_assets_assignee_idx on public.item_assets (assignee_id);

comment on table public.item_assets is
  'Deliverables of an item, one line each: asset type, quantity, person in charge, due date. Summarised by ASSETS_RECAP columns.';

-- board_id follows the item, whatever the client sent.
create or replace function public.item_assets_set_board()
returns trigger
language plpgsql
as $$
begin
  select board_id into new.board_id from public.items where id = new.item_id;
  if new.board_id is null then
    raise exception 'item % does not exist', new.item_id using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists item_assets_set_board on public.item_assets;
create trigger item_assets_set_board
  before insert or update of item_id on public.item_assets
  for each row execute function public.item_assets_set_board();

drop trigger if exists item_assets_set_updated_at on public.item_assets;
create trigger item_assets_set_updated_at
  before update on public.item_assets
  for each row execute function public.set_updated_at();

alter table public.item_assets enable row level security;

-- Whoever can see the item can see its assets; whoever can edit the item can edit them.
drop policy if exists item_assets_select on public.item_assets;
create policy item_assets_select on public.item_assets
  for select to authenticated
  using (private.can_view_item(item_id));

drop policy if exists item_assets_insert on public.item_assets;
create policy item_assets_insert on public.item_assets
  for insert to authenticated
  with check (private.can_edit_item(item_id) and created_by = (select auth.uid()));

drop policy if exists item_assets_update on public.item_assets;
create policy item_assets_update on public.item_assets
  for update to authenticated
  using (private.can_edit_item(item_id))
  with check (private.can_edit_item(item_id));

drop policy if exists item_assets_delete on public.item_assets;
create policy item_assets_delete on public.item_assets
  for delete to authenticated
  using (private.can_edit_item(item_id));

-- Live updates for the panel and the recap cells.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_assets'
  ) then
    execute 'alter publication supabase_realtime add table public.item_assets';
  end if;
end
$$;
