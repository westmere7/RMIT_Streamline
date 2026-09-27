-- =============================================================================
-- 0090_board_pic_from_assets.sql
--
-- Two board settings for how asset lines keep a task's PIC column up to date
-- (ItemAssetService.syncPic). Putting someone in charge of a line adds them to
-- the task's PIC: on by default. Taking a task's last line off someone takes
-- them off its PIC: off by default, since a PIC is often set by hand as well.
-- Board admins change both in Board settings -> Assets, through the board row
-- they may already update.
-- =============================================================================

alter table public.boards add column if not exists assets_fill_pic boolean not null default true;
alter table public.boards add column if not exists assets_clear_pic boolean not null default false;

comment on column public.boards.assets_fill_pic is 'Someone put in charge of an asset line is added to the task''s PIC.';
comment on column public.boards.assets_clear_pic is 'Someone whose last asset line on a task is taken off them leaves its PIC.';
