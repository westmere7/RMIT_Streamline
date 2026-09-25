-- =============================================================================
-- 0072_date_time_column_types.sql
--
-- Three plain column types, a calendar day, a time of day and the two together,
-- each with a format setting on the column (see src/domain/board/date-time-format.ts),
-- and one special type: the Booking time, which Task Allocation shows from the
-- task's own creation time and never stores.
--
-- Only the enum grows here. New enum values cannot be used in the transaction
-- that adds them, and nothing here uses them.
-- =============================================================================

alter type public.column_type add value if not exists 'PLAIN_DATE';
alter type public.column_type add value if not exists 'TIME';
alter type public.column_type add value if not exists 'DATETIME';
alter type public.column_type add value if not exists 'BOOKED_AT';
