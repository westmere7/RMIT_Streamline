-- =============================================================================
-- 0003 – Trackers  (domain: Tracker / TrackerSheet, src/domain/tracker/tracker.ts)
--
-- In-app spreadsheets so teams stop keeping a separate asset-tracker workbook.
-- A tracker belongs to a team; each sheet is stored as one document (columns +
-- rows as JSON) because sheets are small and are edited as a whole from the grid.
-- =============================================================================

create table public.trackers (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  team_id      uuid references public.teams (id) on delete set null,
  name         text not null,
  description  text,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index trackers_workspace_id_idx on public.trackers (workspace_id);
create index trackers_team_id_idx on public.trackers (team_id);

create trigger trackers_set_updated_at
  before update on public.trackers
  for each row execute function public.set_updated_at();

create table public.tracker_sheets (
  id             uuid primary key default gen_random_uuid(),
  tracker_id     uuid not null references public.trackers (id) on delete cascade,
  name           text not null,
  position       double precision not null default 0,
  -- TrackerColumn[] verbatim: {id, name, type, width, options?, optionColors?}
  columns        jsonb not null default '[]'::jsonb,
  -- TrackerRow[] verbatim: {id, kind, label?, cells: {columnId: value}}
  rows           jsonb not null default '[]'::jsonb,
  frozen_columns integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint tracker_sheets_columns_is_array check (jsonb_typeof(columns) = 'array'),
  constraint tracker_sheets_rows_is_array check (jsonb_typeof(rows) = 'array')
);

create index tracker_sheets_tracker_id_idx on public.tracker_sheets (tracker_id);

create trigger tracker_sheets_set_updated_at
  before update on public.tracker_sheets
  for each row execute function public.set_updated_at();

comment on table public.trackers is 'Team spreadsheets (asset trackers etc.) edited in-app and exchanged with Excel via import/export.';
comment on column public.tracker_sheets.columns is 'TrackerColumn[] (src/domain/tracker/tracker.ts) stored as JSON with camelCase keys.';
comment on column public.tracker_sheets.rows is 'TrackerRow[] stored as JSON; cell values are string | number | boolean keyed by column id.';
