-- =============================================================================
-- 0002 – Task Linking  (domain: ItemLink, src/domain/item/item-link.ts)
--
-- Two items on different boards kept in sync by the application
-- (src/services/item-link-service.ts). The database stores the pair and
-- guards its shape; the column-by-column sync itself runs client-side so the
-- same rules apply in local (IndexedDB) and Supabase mode.
-- =============================================================================

alter type public.activity_event_type add value if not exists 'ITEM_LINKED';
alter type public.activity_event_type add value if not exists 'ITEM_UNLINKED';
alter type public.notification_type add value if not exists 'ITEM_LINKED';

create table public.item_links (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Stored once per pair, smaller uuid first (see normaliseLinkPair()).
  item_a_id    uuid not null references public.items (id) on delete cascade,
  item_b_id    uuid not null references public.items (id) on delete cascade,
  -- Fields this link does not carry: 'name', 'description' or board_columns ids
  -- from either side (see ItemLink.excluded). Empty means everything shared syncs.
  excluded     text[] not null default '{}',
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  constraint item_links_ordered_pair check (item_a_id < item_b_id),
  unique (item_a_id, item_b_id)
);

create index item_links_item_a_id_idx on public.item_links (item_a_id);
create index item_links_item_b_id_idx on public.item_links (item_b_id);
create index item_links_workspace_id_idx on public.item_links (workspace_id);

-- Integrity: both items must be on different boards of the link's workspace, and
-- an item may not be linked to its own subitem.
create or replace function public.enforce_item_link_shape()
returns trigger
language plpgsql
as $$
declare
  a public.items%rowtype;
  b public.items%rowtype;
  a_ws uuid;
  b_ws uuid;
begin
  select * into a from public.items where id = new.item_a_id;
  select * into b from public.items where id = new.item_b_id;
  if a.board_id = b.board_id then
    raise exception 'linked items % and % must be on different boards', new.item_a_id, new.item_b_id
      using errcode = 'check_violation';
  end if;
  if a.parent_item_id = b.id or b.parent_item_id = a.id then
    raise exception 'an item cannot be linked to its own subitem' using errcode = 'check_violation';
  end if;
  select workspace_id into a_ws from public.boards where id = a.board_id;
  select workspace_id into b_ws from public.boards where id = b.board_id;
  if a_ws <> new.workspace_id or b_ws <> new.workspace_id then
    raise exception 'linked items must belong to workspace %', new.workspace_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger item_links_enforce_shape
  before insert or update on public.item_links
  for each row execute function public.enforce_item_link_shape();

comment on table public.item_links is
  'Task Linking: pairs of items on different boards that the app keeps in sync (name, description and shared columns).';
