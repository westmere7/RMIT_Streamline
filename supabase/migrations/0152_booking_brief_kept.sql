-- =============================================================================
-- 0152 · The brief as booked is kept as it was: items.booking_brief
-- =============================================================================
-- A booked task keeps the brief the booking composed (0068). The team edits
-- the Brief column; this copy is the evidence of what was asked for, which the
-- task panel compares the column with and puts back on Revert.
--
-- So no member's session may change or clear it once written. Writing it the
-- first time stays open (a bug report, made in the reporter's own session,
-- writes its brief just after the task). The booking routes write with the
-- service role, and a snapshot restore runs with triggers off.
-- =============================================================================

create or replace function private.booking_brief_kept()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon')
     and old.booking_brief is not null
     and new.booking_brief is distinct from old.booking_brief then
    raise exception 'The brief as booked cannot be changed.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists items_booking_brief_kept on public.items;
create trigger items_booking_brief_kept
  before update of booking_brief on public.items
  for each row execute function private.booking_brief_kept();
