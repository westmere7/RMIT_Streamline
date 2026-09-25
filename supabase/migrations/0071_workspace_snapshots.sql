-- =============================================================================
-- 0071_workspace_snapshots.sql
--
-- Snapshots: the whole of the app's data, every table in the public schema,
-- written into one gzipped JSON file and kept here. An admin can take one,
-- download it, upload one taken elsewhere, and restore the database to it.
--
-- The file lives in the row itself. A snapshot of this workspace is about a
-- megabyte compressed, so Postgres holds it comfortably and there is no second
-- store to keep in step.
--
-- No foreign keys, on purpose. A restore truncates every other table in the
-- schema and refills it; a key pointing at profiles or workspaces would either
-- block that or, with CASCADE, take the snapshots down with everything else.
-- The ids are kept as plain values and the names beside them as text.
--
-- Row-level security is on with no policies: nobody reads this table through
-- the API. The server's snapshot routes reach it directly, after checking the
-- caller is an admin, and a restore also checks their password.
-- =============================================================================

create table if not exists public.workspace_snapshots (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null,
  name             text not null,
  kind             text not null default 'manual' check (kind in ('manual', 'before_restore', 'upload')),
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  app_version      text,
  schema_version   text,
  size_bytes       bigint not null,
  row_count        integer not null,
  table_counts     jsonb not null default '{}'::jsonb,
  file             bytea not null,
  restored_at      timestamptz,
  restored_by_name text
);

create index if not exists workspace_snapshots_workspace_idx on public.workspace_snapshots (workspace_id, created_at desc);

alter table public.workspace_snapshots enable row level security;
revoke all on public.workspace_snapshots from anon, authenticated;
