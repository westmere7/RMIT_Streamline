-- =============================================================================
-- 0064_task_allocation_description.sql
--
-- The built-in Task Allocation board's description, in the app's one word for
-- who the work is for. Only the wording the app wrote is replaced; a
-- description somebody has changed is left alone.
-- =============================================================================

update public.boards
set description = 'Every task booked through the form lands here until a manager places it with a team.'
where system = 'TASK_ALLOCATION'
  and description = 'Every task booked by a stakeholder lands here until a manager places it with a team.';
