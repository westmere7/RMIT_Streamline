-- =============================================================================
-- 0074_department_on_list.sql
--
-- A task's department is one on the workspace's list, and nothing else.
--
-- The dashboard counts work by department, reading the STAKEHOLDER cells, so a
-- word that is not one of Settings → Departments is work it cannot place. The
-- app only ever offers the list, but the app is not the only writer: bookings
-- arrive from public links, automations run on the server, and anything that
-- talks to the API directly skips the pickers altogether. So the table checks.
--
-- A department is taken when it names an ACTIVE row of stakeholder_departments
-- (the list as Settings keeps it), in any case, and is stored in the list's own
-- spelling. A value that is not changing is let through, so a task still
-- carrying a department removed before this rule came in can be edited in its
-- other columns; it just cannot be given that department again. A workspace
-- that has never set up departments has nothing to check against yet, and is
-- left alone until it does.
--
-- Snapshot restore writes with session_replication_role = replica, which skips
-- this trigger along with the others, so a restore brings back what it saved.
--
-- security definer: the writer may be a member whose policies do not show them
-- the departments table, and the check must not quietly pass for want of rows.
-- =============================================================================

create or replace function public.enforce_listed_department()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted text := nullif(btrim(new.value_json ->> 'group'), '');
  workspace uuid;
  listed text;
begin
  if new.value_json ->> 'type' is distinct from 'STAKEHOLDER' or wanted is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.value_json ->> 'type' = 'STAKEHOLDER' and old.value_json ->> 'group' is not distinct from new.value_json ->> 'group' then
    return new;
  end if;

  select b.workspace_id into workspace
  from public.items i
  join public.boards b on b.id = i.board_id
  where i.id = new.item_id;
  -- An item that does not exist is enforce_value_same_board's to report.
  if workspace is null then
    return new;
  end if;

  select d.name into listed
  from public.stakeholder_departments d
  where d.workspace_id = workspace and d.status = 'ACTIVE' and lower(btrim(d.name)) = lower(wanted)
  order by d.position
  limit 1;

  if listed is null then
    if not exists (select 1 from public.stakeholder_departments d where d.workspace_id = workspace) then
      return new;
    end if;
    raise exception 'Department "%" is not on the list. Pick one from Settings → Departments.', wanted
      using errcode = 'check_violation';
  end if;

  new.value_json := jsonb_set(new.value_json, '{group}', to_jsonb(listed));
  return new;
end;
$$;

drop trigger if exists item_column_values_listed_department on public.item_column_values;
create trigger item_column_values_listed_department
  before insert or update of value_json on public.item_column_values
  for each row execute function public.enforce_listed_department();
