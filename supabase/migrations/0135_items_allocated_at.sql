-- =============================================================================
-- 0135 · When a booked task reached a team: items.allocated_at
-- =============================================================================
-- A booking either goes straight to a team's board (allocated as it arrives)
-- or waits on Task Allocation until someone allocates it. Either way the task
-- now carries the moment it reached the team. Kept when it moves between team
-- boards; cleared when it is re-allocated, and set again when it is next
-- allocated. Null while it is on Task Allocation, and for anything a team made.
-- Not shown anywhere yet.
--
-- Filled in for booked tasks (booked_via, 0134) that are on a team's board:
--   1. the last allocation off Task Allocation in the log (an ITEM_MOVED whose
--      "from" is that workspace's Task Allocation, by its name today);
--   2. else, a booking created straight on a team's board: when it was made;
--   3. else, the first entry in its log on a board other than Task Allocation
--      (an allocation logged under an older name of the board).
-- What none of these finds stays null rather than being guessed.
--
-- Written by the server alone: a member's session may not set or change it.
-- =============================================================================

alter table public.items add column if not exists allocated_at timestamptz;

with booked as (
  select i.id, i.created_at, b.workspace_id,
         q.id as queue_id, q.name as queue_name
  from public.items i
  join public.boards b on b.id = i.board_id
  left join public.boards q on q.workspace_id = b.workspace_id and q.system = 'TASK_ALLOCATION'
  where i.booked_via is not null
    and i.parent_item_id is null
    and i.allocated_at is null
    and b.system is distinct from 'TASK_ALLOCATION'
),
found as (
  select bk.id,
    coalesce(
      (select max(a.created_at) from public.activities a
        where a.item_id = bk.id and a.event_type = 'ITEM_MOVED' and a.metadata->>'from' = bk.queue_name),
      (select bk.created_at from public.activities a
        where a.item_id = bk.id and a.event_type = 'ITEM_CREATED' and a.board_id is distinct from bk.queue_id
        order by a.created_at asc limit 1),
      (select min(a.created_at) from public.activities a
        where a.item_id = bk.id and a.board_id is distinct from bk.queue_id and a.event_type <> 'ITEM_CREATED')
    ) as at
  from booked bk
)
update public.items i
set allocated_at = f.at
from found f
where i.id = f.id and f.at is not null;

create or replace function private.allocated_at_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.allocated_at is not null then
      raise exception 'Only allocating a task gives it an allocation time.' using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' and new.allocated_at is distinct from old.allocated_at then
      raise exception 'A task''s allocation time is set by allocating it.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists items_allocated_at_guard on public.items;
create trigger items_allocated_at_guard
  before insert or update of allocated_at on public.items
  for each row execute function private.allocated_at_guard();
