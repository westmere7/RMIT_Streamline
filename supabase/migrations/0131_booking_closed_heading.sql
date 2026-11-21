-- =============================================================================
-- 0131_booking_closed_heading.sql
--
-- The closed booking link gets a heading of its own, and its message is rich
-- text (the markup in src/lib/rich-text.ts), so it may run longer: 2000
-- characters of markup, formatting included. Null still means the built-in words.
-- =============================================================================

alter table public.department_portals add column if not exists booking_closed_heading text;

alter table public.department_portals drop constraint if exists department_portals_booking_closed_heading_length;
alter table public.department_portals
  add constraint department_portals_booking_closed_heading_length check (booking_closed_heading is null or char_length(booking_closed_heading) <= 80);

alter table public.department_portals drop constraint if exists department_portals_booking_closed_message_length;
alter table public.department_portals
  add constraint department_portals_booking_closed_message_length check (booking_closed_message is null or char_length(booking_closed_message) <= 2000);

comment on column public.department_portals.booking_closed_heading is 'The heading the booking link shows while it takes no requests. Null uses the built-in one.';
comment on column public.department_portals.booking_closed_message is 'What the booking link says while it takes no requests, as rich text markup. Null uses the built-in words.';
