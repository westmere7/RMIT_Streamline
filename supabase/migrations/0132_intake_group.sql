-- =============================================================================
-- 0132 · The intake group: where bookings arrive on Task Allocation
-- =============================================================================
-- Bookings used to land in whichever group was first on the board, so moving a
-- group up, or deleting the first one, quietly changed where requests went.
-- Now one group per board carries role 'INTAKE': bookings go there, it can be
-- renamed, recoloured and moved, but not deleted.
--
-- Each Task Allocation board gets one: its group called "New" (any case), or
-- else its first group, renamed "Booked by Form". Other boards have none.
--
-- The guard lets the group go when its board goes (deleting a board or a
-- workspace cascades to it), so only deleting the group on its own is refused.
-- =============================================================================

alter table public.board_groups add column if not exists role text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'board_groups_role_check') then
    alter table public.board_groups add constraint board_groups_role_check check (role is null or role = 'INTAKE');
  end if;
end $$;

create unique index if not exists board_groups_one_intake on public.board_groups (board_id) where role = 'INTAKE';

-- One per Task Allocation board that has none yet: "New" if there is one, else
-- the first group. Named "Booked by Form" as it is marked, as the owners asked;
-- renaming it later is anyone's who can edit the board.
update public.board_groups g
set role = 'INTAKE', name = 'Booked by Form'
where g.id in (
  select distinct on (b.id) g2.id
  from public.boards b
  join public.board_groups g2 on g2.board_id = b.id
  where b.system = 'TASK_ALLOCATION'
    and not exists (select 1 from public.board_groups x where x.board_id = b.id and x.role = 'INTAKE')
  order by b.id, (lower(trim(g2.name)) = 'new') desc, g2.position asc, g2.created_at asc
);

create or replace function private.intake_group_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Its board still there: the group itself is being deleted, which is refused.
  if old.role = 'INTAKE' and exists (select 1 from public.boards b where b.id = old.board_id) then
    raise exception 'Bookings arrive in this group, so it cannot be deleted. Rename it instead.' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists board_groups_intake_guard on public.board_groups;
create trigger board_groups_intake_guard
  before delete on public.board_groups
  for each row execute function private.intake_group_guard();

-- The role is the app's, not an editor's: a new Task Allocation board's first
-- group may be made the intake (that is how the app creates one), nothing else
-- may take it, and from the API it is never changed or taken off, which would
-- otherwise be the way round the delete guard. Security invoker, so
-- current_user is the caller's role (authenticated from the API, the owner in a
-- migration or the service).
create or replace function private.intake_group_role_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.role is not null and not exists (select 1 from public.boards b where b.id = new.board_id and b.system = 'TASK_ALLOCATION') then
    raise exception 'Only the Task Allocation board has an intake group.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role and current_user in ('authenticated', 'anon') then
    raise exception 'Which group receives bookings is set by the app.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists board_groups_intake_role_guard on public.board_groups;
create trigger board_groups_intake_role_guard
  before insert or update of role, board_id on public.board_groups
  for each row execute function private.intake_group_role_guard();
