-- A deliverable's links become a list, and deliverables can be grouped into blocks.
--
-- Links. 0034 gave every line exactly two: a preview and the final artwork. A
-- line now holds any number, each with its own label, icon and place in the
-- list, stored as a jsonb array of { id, label, url, icon }. The two old
-- columns are copied in, preview first, and left where they are: the build that
-- is live while this one deploys still reads them. A later migration drops them.
--
-- Blocks. One person often makes several different things for the same task,
-- each due on its own day. A block is those lines grouped under one name and one
-- person in charge. Every line in it stays an ordinary line — its own type,
-- quantity, due date and tick — so the recap, the board, the portal and the
-- dashboard count them exactly as before. block_id says which lines belong
-- together; block_name is kept on each of them so a block needs no table of its
-- own and disappears with its last line.
--
-- Internal, like notes: neither the links nor the block name reach a portal or
-- a public dashboard.

alter table public.item_assets
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists block_id uuid,
  add column if not exists block_name text;

alter table public.item_assets
  drop constraint if exists item_assets_links_shape;
alter table public.item_assets
  add constraint item_assets_links_shape
  check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 20 and octet_length(links::text) <= 50000);

alter table public.item_assets
  drop constraint if exists item_assets_block_name_length;
alter table public.item_assets
  add constraint item_assets_block_name_length
  check (block_name is null or char_length(block_name) <= 200);

create index if not exists item_assets_block_idx on public.item_assets (block_id) where block_id is not null;

update public.item_assets
set links =
  (case when preview_url is not null then jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'label', 'Preview', 'url', preview_url, 'icon', 'eye')) else '[]'::jsonb end)
  || (case when artwork_url is not null then jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'label', 'Final artwork', 'url', artwork_url, 'icon', 'file-check')) else '[]'::jsonb end)
where links = '[]'::jsonb and (preview_url is not null or artwork_url is not null);
