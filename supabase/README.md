# Supabase schema for RMIT Streamline

```
supabase/
├── migrations/
│   ├── 0001_initial_schema.sql   tables, enums, indexes, triggers
│   └── 0002_item_links.sql       Task Linking (item_links) + enum values
├── policies/
│   ├── 0001_rls_policies.sql     RLS helpers + policies (apply after migrations)
│   ├── 0002_item_links_policies.sql  RLS for item_links
│   └── README.md                 permission model, assumptions, realtime notes
├── seed.sql                      demo data (same ids as src/data/seed/seed-data.ts)
└── README.md                     this file
```

The SQL mirrors the TypeScript domain 1:1 (`src/domain/**`), so switching
`NEXT_PUBLIC_DATA_PROVIDER` from `local` to `supabase` is a data copy, not a
remodel. JSON columns (`board_columns.settings`, `item_column_values.value_json`,
`activities.metadata`) store the TypeScript unions verbatim with camelCase keys.

## Apply order

1. **Migrations** – `supabase/migrations/0001_initial_schema.sql`, then `0002_item_links.sql`
2. **Policies** – `supabase/policies/0001_rls_policies.sql`, then `0002_item_links_policies.sql`
3. **Storage bucket + policies** – snippet below
4. **Seed** – `supabase/seed.sql` (optional; local/dev only)

### With the Supabase CLI

The CLI only auto-applies files in `supabase/migrations/`. Either copy the
policies file there as the next migration (`0002_rls_policies.sql`), or apply it
manually after the migrations:

```bash
# Local stack: `supabase start` / `supabase db reset` apply supabase/migrations/*
# and then run supabase/seed.sql automatically.
supabase start
psql "$DATABASE_URL" -f supabase/policies/0001_rls_policies.sql
psql "$DATABASE_URL" -f supabase/seed.sql

# Linked hosted project: push migrations, then apply the policies file.
supabase db push
psql "$DATABASE_URL" -f supabase/policies/0001_rls_policies.sql
```

If you rely on `supabase db reset` running the seed for you, the policies file
must already live in `migrations/` so it is applied before `seed.sql`.

### With plain psql

```bash
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_initial_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/policies/0001_rls_policies.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

Run these as `postgres` / the service role. RLS is bypassed for that role, which
is what the seed relies on.

## Seeding and auth users

`profiles.id` references `auth.users(id)`. The seed's nine profiles therefore
need matching `auth.users` rows **with the same ids** before `seed.sql` runs.
The seed contains a commented-out block that creates them for a local stack
(password `Password123!`); against a hosted project create the users through
the Auth Admin API instead and pass the fixed ids. The `handle_new_user()`
trigger creates bare profile rows; the seed then upserts job titles and
departments.

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
