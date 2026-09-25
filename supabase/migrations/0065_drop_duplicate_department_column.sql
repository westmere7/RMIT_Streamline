-- =============================================================================
-- 0065_drop_duplicate_department_column.sql
--
-- For a moment the app ran with the new column names against a database that
-- had not yet renamed its columns (0063), and Task Allocation's top-up added a
-- second, empty Department column beside the "Stakeholder" one. 0063 then
-- renamed that one too, leaving two. The newer is removed — only where an
-- older Department-type column sits on the same board, and only if nothing
-- has been written into it.
-- =============================================================================

delete from public.board_columns c
where c.type = 'STAKEHOLDER'
  and c.name = 'Department'
  and exists (
    select 1 from public.board_columns o
    where o.board_id = c.board_id and o.type = 'STAKEHOLDER' and o.id <> c.id and o.created_at < c.created_at
  )
  and not exists (select 1 from public.item_column_values v where v.column_id = c.id);
