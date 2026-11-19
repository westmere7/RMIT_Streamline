-- =============================================================================
-- 0125_task_allocation_own_access.sql
--
-- Task Allocation gets its own "who can see" and "who can edit", set in its
-- settings by workspace admins (policies/0031). It no longer follows its team:
-- the Admin team is open to the whole workspace, which would hand the board to
-- every member. Every Task Allocation board starts where it effectively was:
-- seen and edited by the people added to it (and, as always, by admins).
-- =============================================================================

update public.boards
set follows_team = false,
    visibility = 'PRIVATE',
    edit_scope = 'ADDED'
where system = 'TASK_ALLOCATION'
  and (follows_team is distinct from false or visibility <> 'PRIVATE' or edit_scope is distinct from 'ADDED');
