-- =============================================================================
-- 0066_brief_column_type.sql
--
-- A Brief column type: rich text with a job. A booking writes the brief it
-- composed from the form into it (as it did into the rich-text "Brief" column
-- before); on any other task it is a rich-text field like any other. Its value
-- is stored as rich text ({"type":"RICH_TEXT","text":...}), so nothing that
-- reads a value changes.
--
-- The value is added on its own: a new enum value cannot be used in the
-- transaction that adds it, so the existing columns move over in 0067.
-- =============================================================================

alter type public.column_type add value if not exists 'BRIEF';
