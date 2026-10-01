-- =============================================================================
-- 0094_progress_column_type.sql
--
-- Progress, a special column every board holds: how many of a task's asset
-- lines are ticked off, as a bar. Worked out from the Assets tab and cached in
-- item_column_values ({type: "PROGRESS", done, total}) the same way the Assets
-- recap is, so the board can sort by it. Empty while a task has no assets.
--
-- Only the enum grows here. New enum values cannot be used in the transaction
-- that adds them, and nothing here uses them.
-- =============================================================================

alter type public.column_type add value if not exists 'PROGRESS';
