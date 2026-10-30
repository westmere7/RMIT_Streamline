-- =============================================================================
-- 0113_workspace_description.sql
--
-- A line about the workspace, set in Settings -> Overview. It is what a link to
-- the workspace says when it is pasted into a chat (Telegram, Slack, Teams):
-- the preview is fetched by the chat's server, which is not signed in, so the
-- workspace's name and this line are served to anyone with the link, and
-- nothing else is (src/server/workspace-meta.ts). Null means none.
-- =============================================================================

alter table public.workspaces
  add column if not exists description text;

alter table public.workspaces
  drop constraint if exists workspaces_description_length;
alter table public.workspaces
  add constraint workspaces_description_length
  check (description is null or char_length(description) <= 280);

comment on column public.workspaces.description is
  'One line about the workspace; shown in link previews to anyone with the link. Null means none.';
