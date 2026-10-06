-- =============================================================================
-- 0108_tracker_sheet_assets.sql
--
-- A tracker sheet as a task's deliverables.
--
-- tracker_sheets.item_id links a sheet to the task whose assets it holds: one
-- task a sheet and one sheet a task. asset_mapping says which columns give each
-- line its name, type, quantity, PIC, due date and so on
-- (TrackerAssetMapping, src/domain/tracker/tracker.ts).
--
-- The lines themselves are ordinary item_assets rows, written by the app after
-- each save of the sheet, so everything that counts deliverables (recap,
-- progress, My Work, Workload, the dashboard) counts them unchanged.
-- tracker_sheet_id and tracker_row_id say which sheet row each line is; the
-- lines go with the sheet when it is deleted.
--
-- Who may edit a linked sheet: policies/0026_tracker_sheet_assets_policies.sql.
-- =============================================================================

alter table public.tracker_sheets
  add column if not exists item_id uuid references public.items (id) on delete set null;

alter table public.tracker_sheets
  add column if not exists asset_mapping jsonb;

create unique index if not exists tracker_sheets_item_id_key
  on public.tracker_sheets (item_id)
  where item_id is not null;

comment on column public.tracker_sheets.item_id is
  'The task whose asset lines this sheet holds; one sheet a task, one task a sheet.';
comment on column public.tracker_sheets.asset_mapping is
  'TrackerAssetMapping: which columns (or values for every row) give each asset line its details.';

alter table public.item_assets
  add column if not exists tracker_sheet_id uuid references public.tracker_sheets (id) on delete cascade;

alter table public.item_assets
  add column if not exists tracker_row_id text;

-- NULLs are distinct, so lines added on the task (no sheet) never collide.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'item_assets_tracker_row_unique') then
    alter table public.item_assets
      add constraint item_assets_tracker_row_unique unique (tracker_sheet_id, tracker_row_id);
  end if;
end;
$$;

comment on column public.item_assets.tracker_sheet_id is
  'The tracker sheet this line is a row of; null for a line added on the task.';
comment on column public.item_assets.tracker_row_id is
  'The sheet row this line is, so syncing the sheet updates the line in place.';
