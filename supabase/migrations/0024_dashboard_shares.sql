-- =============================================================================
-- 0024_dashboard_shares.sql
--
-- Sharing the workspace dashboard by link. One row per workspace holds a secret
-- token; anyone with the link may read the dashboard's figures and nothing
-- else, without an account.
--
-- Modelled on board_shares (0020): the read is done by the service role behind
-- /api/dashboard/<token>, never by a policy, and it serves a snapshot trimmed of
-- briefs, contact details and requester names (publicDashboardSnapshot in
-- src/domain/dashboard/dashboard.ts). Row level security here covers only the
-- people who manage the link (policies/0010_dashboard_shares_policies.sql).
--
-- The dashboard also listens for changes to boards and teams (a renamed team
-- or an archived board changes what it shows), so both join the realtime
-- publication alongside the tables 0004 and 0015 already publish.
-- =============================================================================

create table if not exists public.dashboard_shares (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null unique references public.workspaces (id) on delete cascade,
  token         text not null unique,
  enabled       boolean not null default true,
  expires_at    date,
  password_hash text,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint dashboard_shares_token_shape check (token ~ '^[a-z0-9]{16,64}$')
);

comment on table public.dashboard_shares is
  'Per-workspace public dashboard links. Read-only, optional expiry and password; served by the service role at /api/dashboard/<token>.';
comment on column public.dashboard_shares.token is
  'The only secret in the link. Replaced when someone asks for a new link, which retires every copy of the old one.';

create index if not exists dashboard_shares_token_idx on public.dashboard_shares (token);

drop trigger if exists dashboard_shares_set_updated_at on public.dashboard_shares;
create trigger dashboard_shares_set_updated_at
  before update on public.dashboard_shares
  for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  for t in select unnest(array['boards', 'teams'])
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
