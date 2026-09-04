# Supabase schema for RMIT Streamline

```
supabase/
├── migrations/
│   ├── 0001_initial_schema.sql   tables, enums, indexes, triggers
│   ├── 0002_item_links.sql       Task Linking (item_links) + enum values
│   ├── 0003_trackers.sql         trackers + tracker_sheets
│   └── 0004_realtime.sql         supabase_realtime publication
├── policies/
│   ├── 0001_rls_policies.sql     RLS helpers + policies
│   ├── 0002_item_links_policies.sql  RLS for item_links
│   ├── 0003_trackers_policies.sql    RLS for trackers
│   └── README.md                 permission model, assumptions, realtime notes
├── seed.sql                      demo data (same ids as src/data/seed/seed-data.ts)
└── README.md                     this file
```

Applied by `npm run db:migrate` (see below), which is also what `npm run dev`
and CI call.

The SQL mirrors the TypeScript domain 1:1 (`src/domain/**`), so switching
`NEXT_PUBLIC_DATA_PROVIDER` from `local` to `supabase` is a data copy, not a
remodel. JSON columns (`board_columns.settings`, `item_column_values.value_json`,
`activities.metadata`) store the TypeScript unions verbatim with camelCase keys.

## Applying SQL

`npm run db:migrate` applies every file under `migrations/` then `policies/`,
lexicographically, once each, and records what it did in
`public.schema_migrations`. Adding a new file with a higher numeric prefix and
running the command (or `npm run dev`, which calls it first) is the whole
workflow — no dashboard, no CLI, no `psql`.

```bash
npm run db:migrate            # apply anything pending
npm run db:migrate -- --dry   # list what would run, change nothing
npm run db:migrate -- --baseline
                              # record files as applied without running them
                              # (a database that already has the schema)
npm run db:seed               # demo accounts + seed.sql
npm run db:setup              # migrate + seed + point .env.local at Supabase
```

Each file runs in a transaction, so a failure leaves nothing half-applied.
Applied files are fingerprinted: editing one after the fact is reported, because
the database no longer matches the repo — add a follow-up migration instead.

`SUPABASE_DB_URL` (Project Settings → Database → Connection string → URI) is the
only variable the runner needs. It is server-side only and lives in `.env.local`.
`.github/workflows/db-migrate.yml` runs the same command on every push to `main`
that touches SQL, using a `SUPABASE_DB_URL` repository secret.

## Order

`migrations/` before `policies/`, so RLS lands after the tables it protects:

1. `migrations/0001_initial_schema.sql` – tables, enums, indexes, triggers
2. `migrations/0002_item_links.sql` – Task Linking
3. `migrations/0003_trackers.sql` – trackers and sheets
4. `migrations/0004_realtime.sql` – publishes the collaborative tables
5. `policies/0001_rls_policies.sql`, `0002_…`, `0003_…` – RLS helpers and policies

The storage bucket snippet below is still manual (it touches `storage.objects`,
which the pooler role cannot always alter); paste it into the SQL editor once.

## Seeding and auth users

`profiles.id` references `auth.users(id)`, so the nine demo profiles need
matching auth accounts with the same ids. `npm run db:seed` does both:

1. creates (or updates) the nine accounts through the Auth Admin API with the
   fixed seed ids and password `Password123!` — override with `SEED_PASSWORD`,
2. runs `seed.sql`, which fills in profiles and everything below them.

It needs `SUPABASE_SERVICE_ROLE_KEY` as well as `SUPABASE_DB_URL`. The
commented-out `auth.users` block in `seed.sql` is only for a local
`supabase start` stack, where inserting into `auth` directly is acceptable.

Seed ids follow the TypeScript convention `0000000<ns>-0000-4000-8000-<n>`:
workspace `00000000-…-000000000001`, users `00000001-…`, teams `00000002-…`,
boards `00000003-…`, groups `00000004-…`, columns `00000005-…`, items
`00000006-…`.

## Storage: `workspace-files` bucket

Attachments (`ColumnValue` of type `FILES`) live in a private bucket. Objects are
keyed `<workspace_id>/<board_id>/<item_id>/<filename>` so the first path segment
identifies the workspace.

```sql
insert into storage.buckets (id, name, public)
values ('workspace-files', 'workspace-files', false)
on conflict do nothing;

-- First path segment as a uuid, or null when the key is not workspace-scoped.
create or replace function private.object_workspace(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

create policy "workspace files: members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workspace-files'
    and private.is_workspace_member(private.object_workspace(name))
  );

create policy "workspace files: members upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-files'
    and private.is_workspace_member(private.object_workspace(name))
    and private.workspace_role(private.object_workspace(name)) <> 'GUEST'
    and owner = (select auth.uid())
  );

create policy "workspace files: owner or admin update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'workspace-files'
    and (owner = (select auth.uid())
         or private.is_workspace_admin(private.object_workspace(name)))
  );

create policy "workspace files: owner or admin delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workspace-files'
    and (owner = (select auth.uid())
         or private.is_workspace_admin(private.object_workspace(name)))
  );
```

Serve files to the browser with short-lived signed URLs
(`storage.from('workspace-files').createSignedUrl(path, 3600)`); the bucket is
not public. Store the resulting path (not the signed URL) in `AttachmentMeta.url`
and sign on read. Tighten the read policy to `private.can_view_board(<board
segment>)` if per-board secrecy of attachments becomes a requirement.

## Realtime

Add the collaborative tables to the `supabase_realtime` publication (see the
commented block at the end of the policies file). RLS applies to Realtime, so
subscribers only receive rows they could `select`. Details and caveats are in
`supabase/policies/README.md`.
