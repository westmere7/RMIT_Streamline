-- =============================================================================
-- 0067_brief_columns.sql
--
-- Every rich-text column called "Brief" becomes the Brief type (0066). Its
-- values are rich text either way, so they carry over untouched. Rich-text
-- columns with any other name stay rich text.
-- =============================================================================

update public.board_columns
set type = 'BRIEF'
where type = 'RICH_TEXT' and lower(btrim(name)) = 'brief';
