-- =============================================================================
-- 0130_booking_closed_message.sql
--
-- What the booking link says while it takes no requests: booking switched off,
-- or the whole portal closed. Null uses the built-in words. Edited in the
-- booking form's settings on the Portal and Booking page.
-- =============================================================================

alter table public.department_portals add column if not exists booking_closed_message text;

alter table public.department_portals drop constraint if exists department_portals_booking_closed_message_length;
alter table public.department_portals
  add constraint department_portals_booking_closed_message_length check (booking_closed_message is null or char_length(booking_closed_message) <= 400);

comment on column public.department_portals.booking_closed_message is 'What the booking link says while it takes no requests. Null uses the built-in words.';
