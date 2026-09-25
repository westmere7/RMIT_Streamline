-- =============================================================================
-- 0059_booking_form_published.sql
--
-- The form editor says what the published form is: what it is called, when
-- it went live and how many tasks have been booked through it since. None of
-- it was recorded.
--
--   * booking_form_name — typed when publishing ("RMIT Marketing · 25 Sep 2026,
--     10:42" unless somebody types another). Null for a form published before.
--   * booking_form_published_at — set by publishing (and by going back to the
--     built-in form). Null for a form published before this existed.
--   * booking_form_bookings — bookings since that moment. Reset to nought by
--     publishing, bumped by count_form_booking() on every booking, whichever
--     door it came through (portal, public link, signed-in page).
--
-- The counter starts from the bookings the admins were told about, which is
-- the only record of a booking there is: a TASK_BOOKED notification per admin,
-- counted once per task.
-- =============================================================================

alter table public.workspaces add column if not exists booking_form_name text;
alter table public.workspaces add column if not exists booking_form_published_at timestamptz;
alter table public.workspaces add column if not exists booking_form_bookings integer not null default 0;

comment on column public.workspaces.booking_form_name is
  'What the live booking form was called when it was published. Null when it was published unnamed.';
comment on column public.workspaces.booking_form_published_at is
  'When the live booking form was last published. Null when that happened before it was recorded.';
comment on column public.workspaces.booking_form_bookings is
  'Tasks booked through the form since it was last published. Bumped by count_form_booking(); reset by publishing.';

update public.workspaces w
set booking_form_bookings = coalesce((
  select count(distinct n.entity_id)
  from public.notifications n
  join public.boards b on b.id = n.board_id
  where n.type = 'TASK_BOOKED' and b.workspace_id = w.id
), 0)
where w.booking_form_published_at is null and w.booking_form_bookings = 0;

-- One statement, like next_ticket_numbers: two bookings landing together each
-- count. Definer because only an admin may update `workspaces`, and the person
-- booking is anybody; the public form reaches this through the server route,
-- which runs as the service role.
create or replace function public.count_form_booking(p_workspace uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not private.is_workspace_member(p_workspace) then
    raise exception 'count_form_booking: not a member of this workspace';
  end if;
  update public.workspaces
     set booking_form_bookings = coalesce(booking_form_bookings, 0) + 1
   where id = p_workspace;
end;
$$;

revoke all on function public.count_form_booking(uuid) from public;
grant execute on function public.count_form_booking(uuid) to authenticated, service_role;
