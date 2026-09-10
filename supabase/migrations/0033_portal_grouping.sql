-- What a department's board is grouped by.
--
-- Additive and defaulted to 'board', which is the arrangement the portal has
-- always drawn: one group per board the department's work is being run on. An
-- existing portal therefore looks exactly as it did until somebody changes it.
--
--   board   one group per source board — "who has this"
--   status  one group per reconciled status label — "where is it up to"
--
-- The status labels are the ones buildPortalBoard already merges across boards,
-- so two boards that both call something "In Progress" make one group rather
-- than two that happen to share a name.

alter table public.department_portals
  add column if not exists grouping text not null default 'board';

alter table public.department_portals
  drop constraint if exists department_portals_grouping_known;
alter table public.department_portals
  add constraint department_portals_grouping_known
  check (grouping in ('board', 'status'));
