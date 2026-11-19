-- =============================================================================
-- 0119_booking_form_published_by.sql
--
-- Who put the live booking form up, beside when (0059). Shown on the booking
-- form's card in Portal and Booking and on the editor's Published form card.
--
-- Set by publishing from now on. Forms published before this have no record
-- of who did it, so the column starts empty and the cards say only when.
-- Someone whose profile is removed leaves the form published by nobody named.
-- =============================================================================

alter table public.workspaces
  add column if not exists booking_form_published_by uuid references public.profiles (id) on delete set null;

comment on column public.workspaces.booking_form_published_by is
  'Who last published the booking form (or went back to the built-in one). Null before 0119.';
