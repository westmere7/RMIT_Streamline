-- =============================================================================
-- 0013_stakeholder_portal_policies.sql
--
-- Who may see and shape a department's portal (migrations/0030_stakeholder_portal.sql).
--
-- The shape here is deliberately lopsided.
--
-- Reading a department is a member's business: the pickers and the settings
-- page both need the list. Everything else about a portal — its token, its
-- password hash, which tasks it publishes, what has been submitted through it —
-- is an administrator's, and no policy grants any of it to an ordinary member.
--
-- Visitors have no policy at all. A stakeholder holding a link has no account,
-- so there is nobody for a policy to reason about; those reads are served by the
-- service role in src/server/portal.ts, behind a gate that checks the token, the
-- credential version, the password grant and the department scope before it
-- assembles an explicit projection. anon and authenticated cannot look a token
-- up here, which is what stops a direct PostgREST call walking round the gate.
--
-- portal_submissions has no policy beyond enabling RLS: receipts are written and
-- replayed by the service role only, and nothing in the browser reads them.
-- =============================================================================

-- --- departments --------------------------------------------------------------

alter table public.stakeholder_departments enable row level security;

-- Members read the list; the pickers and settings need the names and colours.
drop policy if exists stakeholder_departments_select on public.stakeholder_departments;
create policy stakeholder_departments_select on public.stakeholder_departments
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Writing is reconciliation from Settings → Lists, which is admin-only already.
drop policy if exists stakeholder_departments_insert on public.stakeholder_departments;
create policy stakeholder_departments_insert on public.stakeholder_departments
  for insert to authenticated
  with check (private.is_workspace_admin(workspace_id));

drop policy if exists stakeholder_departments_update on public.stakeholder_departments;
create policy stakeholder_departments_update on public.stakeholder_departments
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

-- Deletion is deliberately not granted. A department with history is disabled,
-- never removed; letting it be deleted would take its requests' provenance with
-- it. The service role can still clean up a department that never had any.
drop policy if exists stakeholder_departments_delete on public.stakeholder_departments;

-- --- portals ------------------------------------------------------------------

alter table public.department_portals enable row level security;

-- Admins only, and for every verb. An ordinary member has no reason to hold a
-- token or a password hash, and the settings screen that shows them is
-- admin-only; this is the same rule enforced where it cannot be hidden.
drop policy if exists department_portals_select on public.department_portals;
create policy department_portals_select on public.department_portals
  for select to authenticated
  using (private.is_workspace_admin(workspace_id));

drop policy if exists department_portals_insert on public.department_portals;
create policy department_portals_insert on public.department_portals
  for insert to authenticated
  with check (private.is_workspace_admin(workspace_id));

drop policy if exists department_portals_update on public.department_portals;
create policy department_portals_update on public.department_portals
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

drop policy if exists department_portals_delete on public.department_portals;
create policy department_portals_delete on public.department_portals
  for delete to authenticated
  using (private.is_workspace_admin(workspace_id));

-- --- provenance ----------------------------------------------------------------

alter table public.portal_requests enable row level security;

-- Which tasks a department publishes is an administrative fact, not a member's.
-- Members see the tasks themselves through the ordinary board policies; they do
-- not need to know which of them are exposed to a stakeholder.
drop policy if exists portal_requests_select on public.portal_requests;
create policy portal_requests_select on public.portal_requests
  for select to authenticated
  using (private.is_workspace_admin(workspace_id));

drop policy if exists portal_requests_insert on public.portal_requests;
create policy portal_requests_insert on public.portal_requests
  for insert to authenticated
  with check (private.is_workspace_admin(workspace_id));

drop policy if exists portal_requests_update on public.portal_requests;
create policy portal_requests_update on public.portal_requests
  for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

drop policy if exists portal_requests_delete on public.portal_requests;
create policy portal_requests_delete on public.portal_requests
  for delete to authenticated
  using (private.is_workspace_admin(workspace_id));

-- --- submissions ----------------------------------------------------------------

-- RLS on with no policy: nothing reaches this table but the service role.
alter table public.portal_submissions enable row level security;
