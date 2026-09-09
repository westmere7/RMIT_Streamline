-- =============================================================================
-- 0030 – The stakeholder portal
--        (domain: src/domain/portal/stakeholder-portal.ts)
--
-- A department gets one link that shows it every request it has made, and lets
-- it make another. Four tables, all additive; nothing existing is altered
-- except one presentation column on workspaces.
--
--  · stakeholder_departments — a department with a durable id. The stakeholder
--    groups in Settings → Lists are rewritten whole on every save (the rows are
--    deleted and re-inserted), so nothing hanging off a list row survives an
--    edit. A department outlives the list: renaming a group renames the
--    department, removing one disables it, and a later group with the same name
--    is a new department with no claim on the old one's requests or link.
--
--  · department_portals — one per department, enforced by a unique constraint.
--    The token is the whole of the authorisation. credential_version is what
--    makes revocation immediate: a grant carries the version it was issued
--    under, so bumping it kills every grant already handed out, including one
--    held by a tab that is open right now.
--
--  · portal_requests — provenance. This row, and nothing else, is what puts a
--    task in a department's portal. Not a matching STAKEHOLDER label, not the
--    requester's email domain: those are display values people edit, and an
--    edit must never publish a task or hand it to another department.
--    public_brief is kept here because items.description is not publishable —
--    the booking writer appends the requester's name and email to it whenever
--    the receiving board has no column for them.
--
--  · portal_submissions — idempotency. The browser makes a key before it sends;
--    a retry with the same key returns the first receipt, and the same key with
--    a different payload is refused.
--
-- Everything a visitor reads is served by the service role behind an explicit
-- gate in src/server/portal.ts. The policies in
-- policies/0013_stakeholder_portal_policies.sql keep anon and authenticated out
-- of these tables entirely, bar the one read a workspace's own admins need.
-- =============================================================================

-- --- the department ----------------------------------------------------------

create table if not exists public.stakeholder_departments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null,
  color         text not null default 'gray',
  position      integer not null default 0,
  status        text not null default 'ACTIVE',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint stakeholder_departments_status_known check (status in ('ACTIVE', 'DISABLED')),
  constraint stakeholder_departments_name_length check (char_length(name) between 1 and 40)
);

comment on table public.stakeholder_departments is
  'Stakeholder groups with a durable identity, so a portal and a request''s provenance survive the list being re-saved.';

-- Two live departments cannot share a name; a disabled one may keep the name it
-- had, which is how history stays readable after a group leaves the list.
create unique index if not exists stakeholder_departments_active_name_idx
  on public.stakeholder_departments (workspace_id, lower(name))
  where status = 'ACTIVE';

create index if not exists stakeholder_departments_listing_idx
  on public.stakeholder_departments (workspace_id, status, position);

-- Lets the child tables carry workspace_id and still be held to the department's
-- own workspace, rather than trusting whatever a request said.
alter table public.stakeholder_departments
  drop constraint if exists stakeholder_departments_workspace_unique;
alter table public.stakeholder_departments
  add constraint stakeholder_departments_workspace_unique unique (id, workspace_id);

drop trigger if exists stakeholder_departments_set_updated_at on public.stakeholder_departments;
create trigger stakeholder_departments_set_updated_at
  before update on public.stakeholder_departments
  for each row execute function public.set_updated_at();

-- --- the portal --------------------------------------------------------------

create table if not exists public.department_portals (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  department_id      uuid not null unique references public.stakeholder_departments (id) on delete cascade,
  enabled            boolean not null default false,
  token              text not null unique,
  password_hash      text,
  credential_version integer not null default 1,
  default_theme      text not null default 'system',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint department_portals_token_shape check (token ~ '^[a-z0-9]{24,64}$'),
  constraint department_portals_theme_known check (default_theme in ('light', 'dark', 'system')),
  constraint department_portals_version_positive check (credential_version >= 1),
  -- The portal and its department must belong to the same workspace.
  constraint department_portals_department_workspace
    foreign key (department_id, workspace_id)
    references public.stakeholder_departments (id, workspace_id) on delete cascade
);

comment on table public.department_portals is
  'One link per department. The token is the only secret; credential_version invalidates every grant issued before it changed.';

create index if not exists department_portals_token_idx on public.department_portals (token);
create index if not exists department_portals_workspace_idx on public.department_portals (workspace_id);

drop trigger if exists department_portals_set_updated_at on public.department_portals;
create trigger department_portals_set_updated_at
  before update on public.department_portals
  for each row execute function public.set_updated_at();

-- --- provenance --------------------------------------------------------------

create table if not exists public.portal_requests (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  department_id uuid not null references public.stakeholder_departments (id) on delete restrict,
  item_id       uuid not null references public.items (id) on delete cascade,
  source        text not null,
  public_brief  text,
  booked_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint portal_requests_source_known check (source in ('PORTAL_BOOKING', 'IMPORT')),
  constraint portal_requests_brief_length check (public_brief is null or char_length(public_brief) <= 4000),
  -- One canonical request per item: an item cannot be two departments' work.
  constraint portal_requests_item_unique unique (workspace_id, item_id),
  constraint portal_requests_department_workspace
    foreign key (department_id, workspace_id)
    references public.stakeholder_departments (id, workspace_id) on delete restrict
);

comment on table public.portal_requests is
  'What puts a task in a department''s portal. public_brief is the requester''s own words; items.description is not publishable.';

comment on column public.portal_requests.item_id is
  'The canonical origin. Allocation makes a second item and links it; the link is not provenance, so the origin lists once.';

-- The portal's own listing, newest first, with id breaking ties so a cursor is stable.
create index if not exists portal_requests_listing_idx
  on public.portal_requests (department_id, booked_at desc, id);

create index if not exists portal_requests_item_idx on public.portal_requests (item_id);
create index if not exists portal_requests_workspace_idx on public.portal_requests (workspace_id);

drop trigger if exists portal_requests_set_updated_at on public.portal_requests;
create trigger portal_requests_set_updated_at
  before update on public.portal_requests
  for each row execute function public.set_updated_at();

-- --- idempotency -------------------------------------------------------------

create table if not exists public.portal_submissions (
  id             uuid primary key default gen_random_uuid(),
  portal_id      uuid not null references public.department_portals (id) on delete cascade,
  submission_key text not null,
  request_hash   text not null,
  item_id        uuid references public.items (id) on delete set null,
  receipt        jsonb not null,
  created_at     timestamptz not null default now(),
  constraint portal_submissions_key_shape check (char_length(submission_key) between 8 and 100),
  constraint portal_submissions_key_unique unique (portal_id, submission_key)
);

comment on table public.portal_submissions is
  'One row per accepted submission. A retry with the same key replays its receipt; the same key with a different payload is refused.';

-- --- the team's own name -----------------------------------------------------

alter table public.workspaces
  add column if not exists creative_team_name text;

comment on column public.workspaces.creative_team_name is
  'What the portal calls the team. Presentation only: it never renames the workspace or changes its slug.';

alter table public.workspaces
  drop constraint if exists workspaces_creative_team_name_length;
alter table public.workspaces
  add constraint workspaces_creative_team_name_length
  check (creative_team_name is null or char_length(creative_team_name) between 1 and 60);
