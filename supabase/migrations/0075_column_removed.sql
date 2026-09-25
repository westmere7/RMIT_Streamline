-- =============================================================================
-- 0075_column_removed.sql
--
-- Every board holds one of each special column (Status, PIC, Due date,
-- Timeline, Priority, Department, Size, Assets recap, Brief), and deleting one
-- takes it off the board rather than out of the database. `removed` marks one
-- that has been taken off: the board no longer shows it anywhere, and its
-- values stay where they are, for the dashboard to count and for the column to
-- come back with when it is added again.
--
-- Not `hidden`: a hidden column is still on the board, one click from showing.
--
-- Boards missing a special column get it from the app, not here — adding a
-- Brief or an Assets recap fills it from the bookings and the deliverables,
-- which is TypeScript (BoardService.ensureSpecialColumns).
-- =============================================================================

alter table public.board_columns add column if not exists removed boolean not null default false;
