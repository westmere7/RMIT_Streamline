-- =============================================================================
-- 0096_portal_column_layout.sql
--
-- The portal board's columns in order, each shown or hidden: the portal's own
-- columns and the boards' columns it can carry (src/domain/portal/portal-columns.ts).
-- Null until an admin saves it, which reads exactly as before: the built-ins in
-- their usual order, hidden as hidden_columns says. Presentation only; a board
-- column is published to the portal while it is switched on here.
-- =============================================================================

alter table public.department_portals
  add column if not exists column_layout jsonb;

alter table public.department_portals
  drop constraint if exists department_portals_column_layout_array;
alter table public.department_portals
  add constraint department_portals_column_layout_array
  check (column_layout is null or jsonb_typeof(column_layout) = 'array');
