-- =============================================================================
-- 0159 · Nothing moves back into Booked by Form
-- =============================================================================
-- 0136 let a task move into Task Allocation's intake group from a member's
-- session only if it came in through the form. Decided 2026-11-27: the intake
-- group takes new bookings only, so nothing moves into it at all, booked or
-- not. A booking still lands there when it is made (an insert, which 0133
-- governs and the server writes); reordering inside the group is not a move
-- into it. Subitems follow their task and are not checked, but a subitem
-- made a task of its own there is a move into it (0143). The server's own
-- writes are not affected, as before.
-- =============================================================================

create or replace function private.intake_booked_tasks_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.group_id is distinct from old.group_id
      or (old.parent_item_id is not null and new.parent_item_id is null))
     and new.parent_item_id is null
     and current_user in ('authenticated', 'anon')
     and exists (select 1 from public.board_groups g where g.id = new.group_id and g.role = 'INTAKE') then
    raise exception 'Booked by Form takes new bookings only. Nothing moves back into it.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
