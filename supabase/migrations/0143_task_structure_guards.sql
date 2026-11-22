-- =============================================================================
-- 0143_task_structure_guards.sql
--
-- Rules the app keeps that a direct write could break.
--
-- B2  A subitem's parent must exist, be a task (not itself a subitem), and be
--     on the same board (so the same workspace). Checked whenever
--     parent_item_id or board_id changes, for every writer: a subitem planted
--     under another board's task rode along when that task was allocated or
--     moved, and one under another workspace's task broke allocation half-way.
--     A task that has subitems cannot itself become a subitem. The app moves a
--     task before its subitems, so a move passes.
--
-- B5  Booked by Form (Task Allocation's intake group, 0132) holds booked tasks
--     only. 0133/0136 checked a session creating a task there or moving one
--     in; promoting a subitem there to a task (parent_item_id set to null) is
--     now held to the same rule: only with booked_via set. Replaces 0136's
--     function and trigger.
--
-- B11 From a session (the server's allocation and re-allocation are not
--     held):
--       * a task cannot be moved onto a board that already holds a task it is
--         linked to, directly or along the chain (item-link-service keeps a
--         chain to one task per board), nor can a link be made that would
--         join two chains into one with two tasks on a board;
--       * a task cannot be moved onto a built-in board (Task Allocation, App
--         development, ...): requests reach those through the form, the bug
--         reporter and allocation, which run on the server.
-- =============================================================================

-- ---- B2: subitems hang off a task on their own board ----------------------------
create or replace function private.subitem_parent_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent public.items%rowtype;
begin
  if tg_op = 'UPDATE'
     and new.parent_item_id is not distinct from old.parent_item_id
     and new.board_id is not distinct from old.board_id then
    return new;
  end if;

  if new.parent_item_id is not null then
    if new.parent_item_id = new.id then
      raise exception 'A task cannot be its own subitem.' using errcode = 'check_violation';
    end if;
    select * into v_parent from public.items where id = new.parent_item_id;
    if v_parent.id is null then
      raise exception 'A subitem''s task must exist.' using errcode = 'foreign_key_violation';
    end if;
    if v_parent.parent_item_id is not null then
      raise exception 'A subitem cannot have subitems of its own.' using errcode = 'check_violation';
    end if;
    if v_parent.board_id is distinct from new.board_id then
      raise exception 'A subitem stays on its task''s board.' using errcode = 'check_violation';
    end if;
    if (tg_op = 'INSERT' or old.parent_item_id is null)
       and exists (select 1 from public.items c where c.parent_item_id = new.id) then
      raise exception 'A task with subitems cannot become a subitem.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists items_subitem_parent_guard on public.items;
create trigger items_subitem_parent_guard
  before insert or update of parent_item_id, board_id on public.items
  for each row execute function private.subitem_parent_guard();

-- ---- B5: Booked by Form holds booked tasks only ----------------------------------
create or replace function private.intake_booked_tasks_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.group_id is distinct from old.group_id
      or (old.parent_item_id is not null and new.parent_item_id is null))
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
  before update of group_id, parent_item_id on public.items
  for each row execute function private.intake_booked_tasks_only();

-- ---- B11: linked chains and built-in boards ---------------------------------------
-- Every task linked to p_item_id, directly or along the chain, itself excluded.
create or replace function private.linked_chain(p_item_id uuid)
returns table (item_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive chain(id) as (
    select p_item_id
    union
    select case when l.item_a_id = c.id then l.item_b_id else l.item_a_id end
    from public.item_links l
    join chain c on l.item_a_id = c.id or l.item_b_id = c.id
  )
  select id from chain where id <> p_item_id
$$;

revoke all on function private.linked_chain(uuid) from public, anon;
grant execute on function private.linked_chain(uuid) to authenticated, service_role;

create or replace function private.task_move_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- security definer, so the caller's role is read from the request.
  if new.board_id is distinct from old.board_id
     and session_user = 'authenticator'
     and coalesce(auth.role(), '') <> 'service_role' then
    if exists (select 1 from public.boards b where b.id = new.board_id and b.system is not null) then
      raise exception 'Tasks cannot be moved onto a built-in board.' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from private.linked_chain(new.id) c
      join public.items i on i.id = c.item_id
      where i.board_id = new.board_id
    ) then
      raise exception 'That board already has a task linked to this one.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists items_task_move_guard on public.items;
create trigger items_task_move_guard
  before update of board_id on public.items
  for each row execute function private.task_move_guard();

create or replace function private.link_chain_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if session_user = 'authenticator' and coalesce(auth.role(), '') <> 'service_role' then
    if exists (
      select i.board_id
      from (
        select new.item_a_id as id
        union select new.item_b_id
        union select item_id from private.linked_chain(new.item_a_id)
        union select item_id from private.linked_chain(new.item_b_id)
      ) chain
      join public.items i on i.id = chain.id
      group by i.board_id
      having count(*) > 1
    ) then
      raise exception 'This would put two linked tasks on one board.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists item_links_chain_guard on public.item_links;
create trigger item_links_chain_guard
  before insert or update of item_a_id, item_b_id on public.item_links
  for each row execute function private.link_chain_guard();
