-- =============================================================================
-- 0128_join_needs_approval.sql
--
-- Whether people who sign themselves up through a workspace's join link wait
-- for an admin to let them in (0121/0122), as a switch on the workspace, under
-- the join link in Add member. On by default, which is how it has always been.
--
-- Only admins change it: workspaces_update (policies/0001) already allows
-- nobody else. The app reads it on its own and takes it as on when it cannot
-- read it, so code and this column can arrive in either order.
-- =============================================================================

alter table public.workspaces
  add column if not exists join_needs_approval boolean not null default true;

comment on column public.workspaces.join_needs_approval is
  'Join-link sign-ups wait for an admin''s approval (true) or join at once (false).';
