-- =============================================================================
-- 0126_task_allocation_editors_follow.sql
--
-- Someone added to Task Allocation as an editor is there to allocate, so they
-- follow the whole board from the start: every kind of change (status, other
-- changes, updates, assets, tasks). They can turn any of it down afterwards
-- from the board's bell, like any follow.
--
-- A follow is its person's own row (subscriptions_insert lets nobody write
-- another's), and it is an admin who adds the seat, so the database does it:
--
--   seat added as EDITOR, or raised to EDITOR   follows fully (an existing
--                                               follow is widened to all)
--   seat removed, for someone below admin       the board follow goes too:
--                                               they can no longer see it
--
-- Mirrored for the local demo in its board repository (setMember, removeMember).
--
-- Existing seats: the editors below admin added so far (since 0125/policies
-- 0031) are followed now, as if added today. Admins' own seats are left as
-- they are: those came with the board, not as someone added to allocate.
-- =============================================================================

create or replace function private.follow_task_allocation_seat()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ws uuid;
begin
  if tg_op = 'DELETE' then
    select b.workspace_id into v_ws from public.boards b where b.id = old.board_id and b.system = 'TASK_ALLOCATION';
    if v_ws is not null and not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = v_ws and wm.user_id = old.user_id and wm.role in ('OWNER', 'ADMIN')
    ) then
      delete from public.subscriptions s
      where s.user_id = old.user_id and s.board_id = old.board_id and s.item_id is null;
    end if;
    return old;
  end if;

  if new.role <> 'EDITOR' or (tg_op = 'UPDATE' and old.role = 'EDITOR' and old.user_id = new.user_id) then
    return new;
  end if;
  select b.workspace_id into v_ws from public.boards b where b.id = new.board_id and b.system = 'TASK_ALLOCATION';
  if v_ws is null then
    return new;
  end if;
  insert into public.subscriptions (workspace_id, user_id, board_id, item_id, events)
  values (v_ws, new.user_id, new.board_id, null, array['status', 'fields', 'updates', 'assets', 'tasks'])
  on conflict (user_id, board_id) where item_id is null
  do update set events = excluded.events, updated_at = now();
  return new;
end;
$$;

drop trigger if exists board_members_follow_task_allocation on public.board_members;
create trigger board_members_follow_task_allocation
  after insert or update of role, user_id or delete on public.board_members
  for each row execute function private.follow_task_allocation_seat();

-- The editors below admin seated so far follow fully, as if added today.
insert into public.subscriptions (workspace_id, user_id, board_id, item_id, events)
select b.workspace_id, bm.user_id, b.id, null, array['status', 'fields', 'updates', 'assets', 'tasks']
from public.board_members bm
join public.boards b on b.id = bm.board_id and b.system = 'TASK_ALLOCATION'
join public.workspace_members wm on wm.workspace_id = b.workspace_id and wm.user_id = bm.user_id
where bm.role = 'EDITOR' and wm.role not in ('OWNER', 'ADMIN')
on conflict (user_id, board_id) where item_id is null
do update set events = excluded.events, updated_at = now();
