-- =============================================================================
-- 0136 · Only booked tasks go into Booked by Form
-- =============================================================================
-- 0133 stopped a member creating a task in Task Allocation's intake group; a
-- task made by hand elsewhere could still be moved in. This refuses that too:
-- from a member's session, a task may move into the intake group only if it
-- came in through the form (booked_via, 0134). Subitems follow their task and
-- are not checked. The server's own writes are not affected.
-- =============================================================================

create or replace function private.intake_booked_tasks_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.group_id is distinct from old.group_id
     and new.parent_item_id is null
     and new.booked_via is null
     and current_user in ('authenticated', 'anon')
     and exists (select 1 from public.board_groups g where g.id = new.group_id and g.role = 'INTAKE') then
    raise exception 'Only tasks booked through the form can go in Booked by Form.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists items_intake_booked_tasks_only on public.items;
create trigger items_intake_booked_tasks_only
  before update of group_id on public.items
  for each row execute function private.intake_booked_tasks_only();
