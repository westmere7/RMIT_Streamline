-- =============================================================================
-- 0060_booking_scale.sql
--
-- The portal's booking form gains an interface size: the whole page drawn
-- larger or smaller, from 80% to 150%, for a form shown on a kiosk or a big
-- screen, or read by somebody who wants it bigger. Every form stays at 100%
-- until somebody changes it.
-- =============================================================================

alter table public.department_portals add column if not exists booking_scale integer not null default 100;

alter table public.department_portals drop constraint if exists department_portals_booking_scale_range;
alter table public.department_portals
  add constraint department_portals_booking_scale_range check (booking_scale between 80 and 150);

comment on column public.department_portals.booking_scale is 'The booking form''s interface size, in percent: 80 to 150, 100 as designed.';
