-- =============================================================================
-- 0091_item_pic_from_assets.sql
--
-- Who a task's asset lines put on its PIC (ItemAssetService.syncPic), so that
-- with Board settings -> Assets -> Remove on, only those people are taken off
-- again. Somebody put on the PIC by hand is never removed by it. Kept apart
-- from the PIC value, so editing the PIC cell does not lose it, and read only
-- when asset lines change people, never with the item itself.
-- =============================================================================

alter table public.items add column if not exists pic_from_assets uuid[] not null default '{}';

comment on column public.items.pic_from_assets is 'People the asset lines added to this item''s PIC; the only ones they may take off again.';
