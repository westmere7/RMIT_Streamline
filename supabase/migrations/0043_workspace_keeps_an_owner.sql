-- =============================================================================
-- 0043 – A workspace always keeps an owner
--
-- `workspace_members_delete` (policies/0001) lets anybody delete their own
-- membership row — "anyone may leave a workspace". Nothing stops the last
-- OWNER from being that person, and an audit confirmed it against this
-- database: the sole owner leaves, zero owners remain, and
-- `workspaces_delete` needs `workspace_role(id) = 'OWNER'`, so from that
-- moment nobody can ever delete the workspace. The same hole is open on
-- UPDATE: an owner setting their own row to MEMBER, or to DEACTIVATED, leaves
-- the workspace with nobody who can put an owner back if no admin remains.
--
-- A trigger rather than another policy, because the rule is about the state of
-- the *table* after the statement, not about the row being written, and
-- because it has to hold for UPDATE and DELETE alike however they are reached
-- — the app, the API, or psql.
--
-- Deferred to the end of the transaction so legitimate reshuffles still work:
-- handing ownership over by promoting somebody and demoting yourself is two
-- statements, and only the pair of them has to be valid.
--
-- Deleting the workspace itself cascades to its members; the check passes when
-- the workspace has gone, so tearing one down is unaffected.
-- =============================================================================

create or replace function private.workspace_keeps_an_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace uuid := coalesce(old.workspace_id, new.workspace_id);
begin
  -- The workspace is being deleted; its members go with it.
  if not exists (select 1 from public.workspaces where id = v_workspace) then
    return null;
  end if;

  if not exists (
    select 1
    from public.workspace_members
    where workspace_id = v_workspace
      and role = 'OWNER'
      and status = 'ACTIVE'
  ) then
    raise exception 'A workspace must keep at least one active owner. Make somebody else an owner first.'
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

drop trigger if exists workspace_keeps_an_owner on public.workspace_members;

create constraint trigger workspace_keeps_an_owner
  after update or delete on public.workspace_members
  deferrable initially deferred
  for each row
  execute function private.workspace_keeps_an_owner();
