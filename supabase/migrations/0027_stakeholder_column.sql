-- =============================================================================
-- 0027 – Stakeholder column  (domain: src/domain/board/column.ts COLUMN_TYPES)
--
-- Who a piece of work is for. The cell holds the name of one of the workspace's
-- stakeholder groups (migrations/0026_workspace_lists.sql), so the same list
-- serves every board that asks — unlike a Tags column, whose palette belongs to
-- the column.
--
-- The value is { "type": "STAKEHOLDER", "group": "Comm." | null } in
-- item_column_values.value, following the shape of every other cell.
-- =============================================================================

alter type public.column_type add value if not exists 'STAKEHOLDER';
