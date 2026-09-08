-- =============================================================================
-- 0023_scramble_item_references.sql
--
-- 0022 took each code from the tail of the task's id. Demo ids are handed out in
-- order, so the codes came out as TA-0077, TA-0078, TA-0079 — a counter, which
-- is not what a booking code is. This replaces them with a digest of the id:
-- still the same code for the same task every time, but nothing to read into.
--
-- Only the codes 0022 derived are touched. Anything a booking handed out has a
-- code of its own making and is left alone.
-- =============================================================================

update public.items
set reference = 'TA-' || upper(substr(md5(id::text), 1, 4))
where reference = 'TA-' || upper(right(replace(id::text, '-', ''), 4));
