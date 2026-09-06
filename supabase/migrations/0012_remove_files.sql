-- =============================================================================
-- 0012_remove_files.sql
--
-- The Files attachment feature is gone: the app never stored files, only
-- placeholder metadata. Existing Files columns and their values are removed so
-- boards no longer carry a column the app cannot render. The enum value stays
-- (dropping enum values is not supported); the app simply never creates it.
-- =============================================================================

delete from public.item_column_values
where column_id in (select id from public.board_columns where type = 'FILES');

delete from public.board_columns where type = 'FILES';
