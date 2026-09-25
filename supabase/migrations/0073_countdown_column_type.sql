-- =============================================================================
-- 0073_countdown_column_type.sql
--
-- A plain Countdown column: the cell stores the moment it ends and shows the
-- time left, with its format as a setting on the column (see
-- src/domain/board/countdown.ts).
--
-- Only the enum grows here. New enum values cannot be used in the transaction
-- that adds them, and nothing here uses them.
-- =============================================================================

alter type public.column_type add value if not exists 'COUNTDOWN';
