-- =============================================================================
-- 0009_workspace_invitations.sql
--
-- Onboarding without email. Streamline is a standalone app, so nobody receives
-- a confirmation message: an admin adds a person to the member list (they show
-- up straight away with status INVITED) and is handed a unique link to pass on
-- however they like. Opening the link lets the person set a password and finish
-- their profile, which flips the membership to ACTIVE.
--
-- A row here is one such link. The auth account behind the pending profile is
-- created without a password by the server (src/server/onboarding.ts, service
-- role), so until the link is used the person cannot sign in at all. A member
-- has at most one live link: generating a new one sets revoked_at on the old.
-- =============================================================================

create table if not exists public.workspace_invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- The secret in the link: 32 random bytes, base64url. Readable by admins only
  -- (see policies/0005), so a link can be copied again after the dialog closes.
  token        text not null unique,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  constraint workspace_invitations_token_shape check (token ~ '^[A-Za-z0-9_-]{16,128}$')
);

create index if not exists workspace_invitations_workspace_idx on public.workspace_invitations (workspace_id);
create index if not exists workspace_invitations_user_idx on public.workspace_invitations (user_id);

comment on table public.workspace_invitations is
  'One onboarding link per pending workspace member. Written only by the server with the service role; admins may read their workspace''s rows.';

alter table public.workspace_invitations enable row level security;
