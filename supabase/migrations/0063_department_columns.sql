-- =============================================================================
-- 0063_department_columns.sql
--
-- "Department" is the one word for who the work is for; "Stakeholder" is gone
-- from the app. Existing columns follow: every Department-type column still
-- called "Stakeholder" is renamed "Department". Where a board also has a free
-- text column called "Department" (Task Allocation keeps the department a
-- requester typed), that one becomes "Requester department" first, so no board
-- ends up with two columns of the same name.
--
-- Columns somebody has already renamed are left as they are.
-- =============================================================================

update public.board_columns t
set name = 'Requester department'
where t.type = 'TEXT'
  and t.name = 'Department'
  and exists (
    select 1 from public.board_columns s
    where s.board_id = t.board_id and s.type = 'STAKEHOLDER' and s.name = 'Stakeholder'
  );

update public.board_columns
set name = 'Department'
where type = 'STAKEHOLDER' and name = 'Stakeholder';
