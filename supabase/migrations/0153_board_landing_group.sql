-- =============================================================================
-- 0153 · A board's landing group: boards.landing_group_id
-- =============================================================================
-- Where a task coming from another board lands: allocated, moved, or booked
-- straight onto this board. One group per board, chosen in the board's settings
-- or from the group's own menu; none means the board's top group, as before.
--
-- Guarded here: the group must be one of this board's own, and the built-in
-- boards (Task Allocation, App development) have none — Task Allocation's
-- bookings land in its intake group, and nothing is moved onto either.
-- Deleting the group clears the choice.
-- =============================================================================

alter table public.boards add column if not exists landing_group_id uuid references public.board_groups(id) on delete set null;

comment on column public.boards.landing_group_id is
  'The group tasks from other boards land in (allocated, moved, booked straight here). Null: the top group. Never set on built-in boards.';

create or replace function private.board_landing_group_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.landing_group_id is null then
    return new;
  end if;
  if new.system is not null then
    raise exception 'Built-in boards have no landing group.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.board_groups g where g.id = new.landing_group_id and g.board_id = new.id) then
    raise exception 'The landing group must be one of the board''s own groups.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists boards_landing_group_guard on public.boards;
create trigger boards_landing_group_guard
  before insert or update of landing_group_id, system on public.boards
  for each row execute function private.board_landing_group_guard();
