-- =============================================================================
-- 0029 – Sharing one task, and who a link opens for
--        (domain: src/domain/board/board-share.ts)
--
-- Two things at once, because they are the same idea:
--
--  · Every link now says who it opens for. 'PUBLIC' is the internet, as board
--    links have been until now; 'PRIVATE' is the workspace — the reader must be
--    signed in as a member, though not necessarily a member of the board, which
--    is the point. Existing links keep the behaviour they were made with, so
--    the column defaults to 'PUBLIC' for rows that already exist and to
--    'PRIVATE' for new ones the application creates.
--
--  · A single task can be shared the same way. item_shares mirrors
--    board_shares (0020): one row per item, a secret token, optional expiry and
--    password, and the same on/off switch.
--
-- The read behind either link is done by the service role in src/server/share.ts
-- — a visitor has no session for a policy to judge — and for a private link
-- that route verifies the caller's bearer token before it serves anything.
-- =============================================================================

alter table public.board_shares
  add column if not exists access text not null default 'PUBLIC';
alter table public.board_shares
  drop constraint if exists board_shares_access_known;
alter table public.board_shares
  add constraint board_shares_access_known check (access in ('PUBLIC', 'PRIVATE'));

comment on column public.board_shares.access is
  'PUBLIC: anyone with the link. PRIVATE: a signed-in member of the workspace, board membership not required.';

create table if not exists public.item_shares (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null unique references public.items (id) on delete cascade,
  token         text not null unique,
  enabled       boolean not null default true,
  expires_at    date,
  password_hash text,
  access        text not null default 'PRIVATE',
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint item_shares_token_shape check (token ~ '^[a-z0-9]{16,64}$'),
  constraint item_shares_access_known check (access in ('PUBLIC', 'PRIVATE'))
);

comment on table public.item_shares is
  'Per-task public links. Read-only, optional expiry and password; served by the service role at /api/share/item/<token>.';

create index if not exists item_shares_token_idx on public.item_shares (token);

drop trigger if exists item_shares_set_updated_at on public.item_shares;
create trigger item_shares_set_updated_at
  before update on public.item_shares
  for each row execute function public.set_updated_at();
