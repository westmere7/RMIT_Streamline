-- 0037_unified_portal.sql
--
-- One portal for the whole workspace, in place of one per department.
--
-- A portal per department meant a link per department, a password per
-- department, a set of presentation settings per department, and a stakeholder
-- who works with two of them holding two links. The work itself was never
-- divided that way: every task carries the stakeholder it is for, so one portal
-- that shows all of it — with the stakeholder as a filter the visitor chooses
-- rather than a wall the token decides — is the same information with none of
-- the administration.
--
-- The department table stays exactly as it is. Departments are the stakeholders
-- the filter offers and the owners of every request's provenance; it is only
-- the *portals* that collapse into one.
--
-- A unified portal is a `department_portals` row with no department. The column
-- becomes nullable for it, and a partial unique index keeps a workspace to one.
-- Every per-department row is switched off and its credentials bumped, so the
-- links already handed out stop opening and say they have been replaced rather
-- than failing as though the address were wrong.

alter table public.department_portals
  alter column department_id drop not null;

-- `unique` on a nullable column still allows many nulls, so the one-per-
-- workspace rule for unified portals needs an index of its own.
create unique index if not exists department_portals_unified_idx
  on public.department_portals (workspace_id)
  where department_id is null;

comment on column public.department_portals.department_id is
  'Null on the workspace''s unified portal — the only kind served. A row that still names a department is a superseded per-department link, kept so its token resolves to "this link has been replaced" rather than to nothing.';

-- The links already out there. Switched off and bumped: the bump is what kills
-- a grant held by a tab that is open right now, and the application refuses any
-- token that names a department whatever these columns say.
update public.department_portals
set enabled = false,
    credential_version = credential_version + 1
where department_id is not null
  and enabled;
