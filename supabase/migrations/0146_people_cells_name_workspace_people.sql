-- =============================================================================
-- 0146_people_cells_name_workspace_people.sql
--
-- A person cell (PERSON, PEOPLE) or a deliverable's assignees could name
-- anyone with an account, from any workspace: the people picker only offers
-- the workspace's members, but a session writing the row directly was not
-- held to it (B14). Someone in another workspace then turned up on the task,
-- in "my work" reads and in assignment-driven notifications.
--
-- For a session (current_user authenticated or anon, as 0142), a person newly
-- named in a cell or on a deliverable must hold a seat in the task's
-- workspace: ACTIVE, INVITED (pending onboarding, who the app lets you assign),
-- or DEACTIVATED (a former member: a task moved to another board, duplicated or
-- undone carries its cells over as new rows, and a deactivated assignee must
-- travel with it). Anyone else is dropped from what is written, rather than
-- the write refused, so no everyday path can fail on it: the app never offers
-- such a person in the first place.
--
-- "Newly" named: whoever the stored cell (or deliverable) already names stays,
-- so editing a cell that holds somebody since removed from the workspace, or
-- planted before this rule, still works and nothing existing is rewritten.
--
-- The service role (automations drain as it, the booking and onboarding
-- routes, snapshot restore) is not held. REQUESTER cells are left alone: a
-- public booking names the person it made, through the server.
-- =============================================================================

-- The ids in p_ids (a jsonb array, order kept) that may be written to this
-- item's cell on this column: those already in the stored cell, and those with
-- a seat (ACTIVE, INVITED, DEACTIVATED) in the item's workspace. Reads seats
-- and the stored cell regardless of the caller's own access.
create or replace function private.people_cell_allowed(p_item uuid, p_column uuid, p_ids jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ws as (
    select b.workspace_id from public.items i join public.boards b on b.id = i.board_id where i.id = p_item
  ),
  stored as (
    select e #>> '{}' as id
    from public.item_column_values v, jsonb_array_elements(case when jsonb_typeof(v.value_json -> 'userIds') = 'array' then v.value_json -> 'userIds' else '[]'::jsonb end) e
    where v.item_id = p_item and v.column_id = p_column
  )
  select coalesce(jsonb_agg(t.e order by t.ord), '[]'::jsonb)
  from jsonb_array_elements(p_ids) with ordinality t(e, ord)
  where jsonb_typeof(t.e) = 'string'
    and (
      (t.e #>> '{}') in (select id from stored)
      or exists (
        select 1 from public.workspace_members m, ws
        where m.workspace_id = ws.workspace_id
          and m.user_id::text = (t.e #>> '{}')
          and m.status in ('ACTIVE', 'INVITED', 'DEACTIVATED')
      )
    );
$$;

revoke all on function private.people_cell_allowed(uuid, uuid, jsonb) from public, anon;
grant execute on function private.people_cell_allowed(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function private.people_cell_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon')
     or coalesce(new.value_json ->> 'type', '') not in ('PERSON', 'PEOPLE')
     or jsonb_typeof(new.value_json -> 'userIds') is distinct from 'array' then
    return new;
  end if;
  new.value_json := jsonb_set(new.value_json, '{userIds}', private.people_cell_allowed(new.item_id, new.column_id, new.value_json -> 'userIds'));
  return new;
end;
$$;

drop trigger if exists item_column_values_people_guard on public.item_column_values;
create trigger item_column_values_people_guard
  before insert or update of value_json on public.item_column_values
  for each row execute function private.people_cell_guard();

-- Deliverables: the same rule on assignee_ids, against what the row held
-- before (nothing, for a new one). assignee_id is the first of them
-- (item_assets_sync_assignee keeps it so when assignee_ids changes); nothing in
-- the app writes it on its own, so a session's write to it alone is put back
-- to the first assignee.
create or replace function private.asset_people_allowed(p_item uuid, p_before uuid[], p_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(t.id order by t.ord), '{}'::uuid[])
  from unnest(p_ids) with ordinality t(id, ord)
  where t.id = any(coalesce(p_before, '{}'::uuid[]))
     or exists (
       select 1
       from public.items i
       join public.boards b on b.id = i.board_id
       join public.workspace_members m on m.workspace_id = b.workspace_id
       where i.id = p_item and m.user_id = t.id and m.status in ('ACTIVE', 'INVITED', 'DEACTIVATED')
     );
$$;

revoke all on function private.asset_people_allowed(uuid, uuid[], uuid[]) from public, anon;
grant execute on function private.asset_people_allowed(uuid, uuid[], uuid[]) to authenticated, service_role;

create or replace function private.asset_people_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if cardinality(coalesce(new.assignee_ids, '{}')) > 0 then
    new.assignee_ids := private.asset_people_allowed(
      new.item_id,
      case when tg_op = 'UPDATE' then old.assignee_ids else '{}'::uuid[] end,
      new.assignee_ids
    );
  end if;
  new.assignee_id := case when cardinality(coalesce(new.assignee_ids, '{}')) > 0 then new.assignee_ids[1] else null end;
  return new;
end;
$$;

drop trigger if exists item_assets_people_guard on public.item_assets;
create trigger item_assets_people_guard
  before insert or update of assignee_ids, assignee_id on public.item_assets
  for each row execute function private.asset_people_guard();
