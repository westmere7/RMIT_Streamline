-- How a department's portal presents itself.
--
-- Additive, all defaulted, so an existing portal keeps behaving exactly as it
-- did: every column here has the value the hard-coded behaviour already had.
--
--   description     a line of the team's own words under the department name
--   hidden_columns  keys of the synthetic board columns to leave out
--                   (see portalColumnId / COLUMN keys in portal-board.ts)
--   default_view    which of the board's views the link opens on
--   allow_booking   whether this link takes new requests at all
--   show_recap      whether the figures appear in the header
--
-- `hidden_columns` is jsonb rather than text[] because every other list this
-- schema stores is jsonb, and the repositories already read that shape.

alter table public.department_portals
  add column if not exists description    text,
  add column if not exists hidden_columns jsonb   not null default '[]'::jsonb,
  add column if not exists default_view   text    not null default 'table',
  add column if not exists allow_booking  boolean not null default true,
  add column if not exists show_recap     boolean not null default true;

-- A description is a line, not a page: it sits under a heading on a public page
-- and anything longer would push the work itself off the screen.
alter table public.department_portals
  drop constraint if exists department_portals_description_length;
alter table public.department_portals
  add constraint department_portals_description_length
  check (description is null or char_length(description) <= 280);

alter table public.department_portals
  drop constraint if exists department_portals_view_known;
alter table public.department_portals
  add constraint department_portals_view_known
  check (default_view in ('table', 'kanban', 'timeline', 'calendar', 'gantt', 'workload', 'chart'));

alter table public.department_portals
  drop constraint if exists department_portals_hidden_columns_array;
alter table public.department_portals
  add constraint department_portals_hidden_columns_array
  check (jsonb_typeof(hidden_columns) = 'array');
