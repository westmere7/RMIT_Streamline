-- =============================================================================
-- 0133 · Booked by Form takes bookings only
-- =============================================================================
-- Task Allocation's intake group (role 'INTAKE', 0132) is where the booking
-- form puts what it receives. A task made by hand belongs in another group, so
-- a member's session may not create a task in it. Bookings, the portal and the
-- server's own jobs write with the service role and are not affected; nor are
-- subitems of a booking, nor tasks moved or re-allocated into the board (an
-- update, not an insert).
--
-- Security invoker, so current_user is the caller's role: authenticated or
-- anon from the API, the service role or the owner otherwise.
-- =============================================================================

create or replace function private.intake_bookings_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.parent_item_id is null
     and current_user in ('authenticated', 'anon')
     and exists (select 1 from public.board_groups g where g.id = new.group_id and g.role = 'INTAKE') then
    raise exception 'Booked by Form takes only bookings from the form. Add the task to another group.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists items_intake_bookings_only on public.items;
create trigger items_intake_bookings_only
  before insert on public.items
  for each row execute function private.intake_bookings_only();
