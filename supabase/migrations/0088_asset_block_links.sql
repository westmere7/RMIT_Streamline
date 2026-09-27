-- Links that belong to a block rather than to one line in it: the shared
-- folder, the brief, the one proof sheet covering every item. Kept on each of
-- the block's lines, like block_name, so a block still needs no table of its
-- own; empty outside a block. Internal, like the lines' own links.

alter table public.item_assets
  add column if not exists block_links jsonb not null default '[]'::jsonb;

alter table public.item_assets
  drop constraint if exists item_assets_block_links_shape;
alter table public.item_assets
  add constraint item_assets_block_links_shape
  check (jsonb_typeof(block_links) = 'array' and jsonb_array_length(block_links) <= 20 and octet_length(block_links::text) <= 50000);
