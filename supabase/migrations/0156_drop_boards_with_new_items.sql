-- The new-tasks dot (v0.163.0) was taken out in v0.164.1/v0.165.0 to be
-- reworked later; nothing calls its function any more. 0155 stays in the repo
-- because it was applied; this takes the function back out.
drop function if exists public.boards_with_new_items(uuid);
