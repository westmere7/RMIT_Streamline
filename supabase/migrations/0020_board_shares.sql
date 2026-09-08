-- =============================================================================
-- 0020_board_shares.sql
--
-- Sharing a board by link. One row per board holds a secret token; anyone with
-- the link may read that board and nothing else, without an account.
--
-- The link is read-only and the reading is done by the service role behind
-- /api/share/<token>, never by a policy: an anonymous visitor has no session for
-- RLS to reason about, and a token is not something the database should be
-- comparing on every row. Row level security here therefore only covers the
-- people who manage the link (see policies/0009_board_shares_policies.sql).
--
-- Turning a link off keeps the row so it can be turned back on with the same
-- address; "Create a new link" replaces the token, which breaks every copy of
-- the old one on purpose.
--
-- password_hash is 'salt:hash' from src/lib/auth/password-hash.ts, the same
-- salted SHA-256 the local provider uses. It guards a view of a board, not an
-- account, and the plain password is never stored or logged.
-- =============================================================================

create table if not exists public.board_shares (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null unique references public.boards (id) on delete cascade,
  token         text not null unique,
  enabled       boolean not null default true,
  expires_at    date,
  password_hash text,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint board_shares_token_shape check (token ~ '^[a-z0-9]{16,64}$')
);

comment on table public.board_shares is
  'Per-board public links. Read-only, optional expiry and password; served by the service role at /api/share/<token>.';
comment on column public.board_shares.token is
  'The only secret in the link. Replaced when someone asks for a new link, which retires every copy of the old one.';
comment on column public.board_shares.expires_at is
  'The last day the link works, or null for no expiry. Compared against the visitor''s date, so a link dies at the end of that day.';

create index if not exists board_shares_token_idx on public.board_shares (token);

drop trigger if exists board_shares_set_updated_at on public.board_shares;
create trigger board_shares_set_updated_at
  before update on public.board_shares
  for each row execute function public.set_updated_at();
