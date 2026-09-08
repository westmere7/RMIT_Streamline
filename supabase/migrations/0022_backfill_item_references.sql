-- =============================================================================
-- 0022_backfill_item_references.sql
--
-- Every task that predates the ID# column gets a code, so the column reads as a
-- column from the first look rather than a row of dashes.
--
-- The code is the same one the booking process would have produced for that
-- task: "TA-" and the last four characters of its id, upper case. Derived rather
-- than random, so re-running this changes nothing and two environments seeded
-- from the same data agree.
--
-- Only tasks with no code are touched; anything booked keeps what it was given.
-- =============================================================================

update public.items
set reference = 'TA-' || upper(right(replace(id::text, '-', ''), 4))
where reference is null;
