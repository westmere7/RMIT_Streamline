-- =============================================================================
-- 0061_booking_scale_switch.sql
--
-- Whether a booking-form visitor may change the interface size for themselves,
-- the way booking_theme_switch lets them change the theme. On by default: the
-- team's size is where the form starts, and a visitor who needs it bigger can
-- have it.
-- =============================================================================

alter table public.department_portals add column if not exists booking_scale_switch boolean not null default true;

comment on column public.department_portals.booking_scale_switch is 'Whether a booking-form visitor may change the interface size for themselves.';
