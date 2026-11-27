-- =============================================================================
-- 0040_booking_send_backs.sql
--
-- Who reads and writes what migrations/0158 made.
--
--   booking_requests   nobody's session: it holds the requester's email and
--                      answers. Booking, the portal and the send-back routes
--                      read and write it with the service role.
--   booking_sendbacks  read by people who can edit the task, the only people
--                      who can send it back or copy the link again (the token
--                      is in the row; 0033 is why a token is never readable
--                      by everyone who can merely see the task). Written by
--                      the server routes with the service role, after they
--                      have checked the caller, and by the requester's route,
--                      which knows only the token.
-- =============================================================================

alter table public.booking_requests enable row level security;
revoke all on public.booking_requests from anon, authenticated;

alter table public.booking_sendbacks enable row level security;
revoke all on public.booking_sendbacks from anon;
revoke insert, update, delete, truncate, references, trigger on public.booking_sendbacks from authenticated;
grant select on public.booking_sendbacks to authenticated;

drop policy if exists booking_sendbacks_select on public.booking_sendbacks;
create policy booking_sendbacks_select on public.booking_sendbacks
  for select to authenticated
  using (coalesce(private.can_edit_item(item_id), false));
