-- =============================================================================
-- 0134 · Where a task came in: items.booked_via
-- =============================================================================
-- A task the booking form (or a department's portal) made carries how it came
-- in, wherever it is allocated or moved afterwards. Only such a task can be
-- re-allocated: one a team made on its own board was never Task Allocation's.
--
-- It was only ever written in the log (ITEM_CREATED's metadata.via), and the
-- log is not a record to rely on, so it is kept on the task. Filled in here
-- from the log: a creation entry that says booking or portal, or any task
-- first created on Task Allocation (which took bookings only, before 'via'
-- was written).
--
-- Set by the server alone: a member's session may not give a task one, nor
-- change or clear it (the booking routes write with the service role).
-- =============================================================================

alter table public.items add column if not exists booked_via text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_booked_via_check') then
    alter table public.items add constraint items_booked_via_check check (booked_via is null or booked_via in ('booking', 'portal'));
  end if;
end $$;

update public.items i
set booked_via = src.via
from (
  select distinct on (a.item_id) a.item_id,
         case when a.metadata->>'via' = 'portal' then 'portal' else 'booking' end as via
  from public.activities a
  left join public.boards b on b.id = a.board_id
  where a.event_type = 'ITEM_CREATED'
    and a.item_id is not null
    and (a.metadata->>'via' in ('booking', 'portal') or b.system = 'TASK_ALLOCATION')
  order by a.item_id, a.created_at asc
) src
where i.id = src.item_id and i.booked_via is null and i.parent_item_id is null;

create or replace function private.booked_via_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.booked_via is not null then
      raise exception 'Only a booking can say a task was booked.' using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' and new.booked_via is distinct from old.booked_via then
      raise exception 'How a task came in cannot be changed.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists items_booked_via_guard on public.items;
create trigger items_booked_via_guard
  before insert or update of booked_via on public.items
  for each row execute function private.booked_via_guard();
