-- =============================================================================
-- 0018_item_asset_done.sql
--
-- An asset line can be ticked off. The timestamp rather than a flag, so a
-- deliverables report can later say when each line landed, not only that it did.
-- =============================================================================

alter table public.item_assets
  add column if not exists completed_at timestamptz;

create index if not exists item_assets_completed_idx on public.item_assets (item_id) where completed_at is not null;

comment on column public.item_assets.completed_at is
  'When this line was ticked off; null while it is outstanding.';
