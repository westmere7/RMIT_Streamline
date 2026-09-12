-- =============================================================================
-- 0048 – A column can say which job it does
--
-- The dashboard has to read the same facts off boards that are laid out
-- nothing like each other, and it found them by guessing: the *first* DATE
-- column was the deadline, the first STATUS column was the status, and a
-- people column was the requester if its name happened to contain "requester".
-- The guesses are usually right and silently wrong the rest of the time — a
-- board with "Briefed on" sitting before "Due date" reported the wrong
-- deadline, and nothing anywhere said so.
--
-- `role` is the board's own answer. It is optional and null by default: where
-- it is not set the old guess still runs, so every board keeps reading exactly
-- as it did and a board only has to say anything when the guess is wrong.
--
-- One column per job per board — that is the whole point — so the uniqueness
-- is enforced here rather than hoped for. Roles are stored as the names the
-- application uses; the check keeps a typo from becoming a silently dead role.
-- =============================================================================

alter table public.board_columns
  add column if not exists role text;

alter table public.board_columns
  drop constraint if exists board_columns_role_known;

alter table public.board_columns
  add constraint board_columns_role_known check (
    role is null or role in (
      'status', 'pic', 'dueDate', 'timeline', 'priority', 'stakeholder', 'size', 'assetsRecap',
      'requester', 'department', 'requestedTeam', 'assetType', 'brief'
    )
  );

create unique index if not exists board_columns_one_column_per_role
  on public.board_columns (board_id, role)
  where role is not null;
