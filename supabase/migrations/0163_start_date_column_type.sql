-- =============================================================================
-- 0163_start_date_column_type.sql
--
-- Start day, a special column every board holds one of: the day the team
-- begins the work, theirs to set, apart from the day the task was booked.
-- Stored in item_column_values as {type: "START_DATE", date}. With the Due date
-- it is the two ends of the Timeline (src/domain/board/date-sync.ts), and the
-- dashboard counts production time from it.
--
-- Only the enum grows here. New enum values cannot be used in the transaction
-- that adds them, and nothing here uses them. Existing boards are given the
-- column by `npm run db:special-columns`.
-- =============================================================================

alter type public.column_type add value if not exists 'START_DATE';
