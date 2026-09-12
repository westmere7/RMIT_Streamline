-- =============================================================================
-- 0040_portal_item_groups.sql
--
-- The portal used to open grouped the way each team's board is grouped. Those
-- groups are the team's own furniture (sprints, campaigns, "parked") and mean
-- little to a stakeholder, so the portal now groups by status unless the team
-- switches this on. Off by default, which changes what an existing link opens
-- on; that is the point.
-- =============================================================================

alter table public.department_portals
  add column if not exists show_item_groups boolean not null default false;

comment on column public.department_portals.show_item_groups is
  'Whether the portal may group work the way the teams'' boards do. Off groups by status and hides that option.';
