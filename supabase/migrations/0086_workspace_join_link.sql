-- =============================================================================
-- 0086_workspace_join_link.sql
--
-- A join link for the whole workspace: /invite/<key>. Each person who opens it
-- types their own name and email, and a new email is added as a pending member
-- with a personal link, exactly as "Add member" adds one (src/server/self-join.ts
-- calls the same inviteMember). An email the database already knows is refused
-- with what to do instead. Null means the link is off; admins turn it on, off
-- or replace it from the invite dialog, through the workspace row they may
-- already update.
-- =============================================================================

alter table public.workspaces add column if not exists join_key text;

create unique index if not exists workspaces_join_key_unique on public.workspaces (join_key) where join_key is not null;

comment on column public.workspaces.join_key is 'Secret in the workspace join link (/invite/<key>). Null when the link is off.';
