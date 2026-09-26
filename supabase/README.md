# Supabase schema for RMIT Streamline

```
supabase/
├── migrations/     0001 … 0078   tables, enums, triggers, functions, realtime (77 files; there is no 0069)
├── policies/       0001 … 0019   RLS helpers (private schema) and policies
├── optional/                     SQL applied by hand only: the pg_cron automation driver
├── sequence.txt                  the order the 96 SQL files are applied in
├── seed.sql                      historical demo SQL; npm run db:seed no longer uses it
└── README.md                     this file
```

The SQL mirrors the TypeScript domain (`src/domain/**`). JSON columns keep the TypeScript shapes verbatim, with camelCase keys: `board_columns.settings`, `item_column_values.value_json`, `automation_rules.trigger_json`, and `activities.metadata`. The knowledge base lists every migration and policy (`KNOWLEDGE_BASE.md` §17).

## Applying SQL

```bash
npm run db:migrate            # apply anything pending, in sequence.txt order
npm run db:migrate -- --dry   # list what would run (still connects and ensures the ledger)
npm run db:migrate -- --baseline
                              # record files as applied without running them
                              # (a database that already has the schema)
npm run db:setup              # migrate + seed + point .env.local at Supabase
```

- **Order.** `scripts/db-migrate.mjs` applies pending files in the order `sequence.txt` gives, which is the order they were first applied. Migrations and policies interleave there, because thirteen migrations (0005, 0010, 0013, …) call `private.*` helpers that policy files define. Running every migration before every policy stops at 0005 on an empty database.
- **Unlisted files.** A file the list does not name still runs, after the listed ones, with a warning. `tests/unit/sql-sequence.test.ts` fails until it is listed.
- **Transactions.** Each file runs in a transaction together with its ledger row in `public.schema_migrations`, so a failure leaves nothing half-applied.
- **Checksums.** Applied files are fingerprinted. Editing one afterwards is reported as drift, never re-run; add a follow-up file instead.

**Adding SQL:**

1. Take the next number in its directory.
2. Append the file to `sequence.txt`.
3. Run `npm run db:migrate`.

`npm run dev`, every Vercel build (`prebuild`), and `.github/workflows/db-migrate.yml` (on pushes to `main` that touch SQL) all apply pending files to whatever `SUPABASE_DB_URL` names. A SQL file pushed to `main` is therefore live in production. Set `SKIP_DB_MIGRATE=1` to run the app without migrating.

`SUPABASE_DB_URL` must be the **session pooler** URI (`aws-0-<region>.pooler.supabase.com:5432`, user `postgres.<ref>`). The direct host is IPv6-only, so Vercel and GitHub runners cannot reach it.

## Seeding

| Command | What it does |
| --- | --- |
| `npm run db:seed` | **Replaces** the seed workspace. Creates the demo Auth accounts through the Auth Admin API with fixed ids (password `Password123!`, or `SEED_PASSWORD`; the admin `admin123`, or `ADMIN_PASSWORD`), then writes the TypeScript seed bundle (`src/data/seed`). Members who are not in the seed are kept. Pending members get fresh join links. **Only for disposable databases.** |
| `npm run db:seed:topup` | Adds seed extras with `on conflict do nothing`, mapping groups and columns by name. Safe on a hand-edited workspace. |
| `npm run db:special-columns` | Gives every board its special columns. |

Both seeds need `SUPABASE_SERVICE_ROLE_KEY` as well as `SUPABASE_DB_URL`.

Seed ids follow `0000000<ns>-0000-4000-8000-<n>`: the workspace is `00000000-…-000000000001`, users `00000001-…`, teams `00000002-…`, boards `00000003-…`.

## A disposable database

For tests that need RLS, triggers, server routes, the automation runner, restore, or wipe, use a local Supabase stack (Docker + `npx supabase start`). Run it from a git worktree whose `.env.local` names only `127.0.0.1` services, so nothing can fall back to production.

Build the database in that worktree:

```bash
node scripts/db-migrate.mjs
npx tsx scripts/db-seed.mts
```

The recipe is in `KNOWLEDGE_BASE.md` §19.

## Onboarding without email (`workspace_invitations`)

Nobody receives an email. An admin adds a person from Members. The app's route handlers (`src/app/api/invitations*`, `src/server/onboarding.ts`) use the **service role** to:

1. create an Auth account with no password;
2. insert the `INVITED` membership;
3. insert one invitation row holding the link token.

`/join/<token>` reads it through `GET /api/join/<token>`. `POST` sets the password (`auth.admin.updateUserById`), updates the profile and makes the membership `ACTIVE`.

A public booking from a new email creates a pending member through the same path (`src/server/requesters.ts`).

- **Who can read invitations.** Workspace admins may `select` their workspace's rows. No client can insert, update or delete one.
- **Pending accounts cannot sign in.** They have no password. `private.workspace_role()` counts only `ACTIVE` memberships, so even a pending person with a session would see nothing.

## Storage

| Bucket | Created by | Access |
| --- | --- | --- |
| `avatars` | Migration 0005 | Public read; users write `<their id>/…` only |
| `item-covers` | Migration 0013 | Public read |

Both migrations guard their `storage.objects` changes, because the pooler role cannot always alter Storage. After a fresh build, check that both buckets and their policies exist before testing uploads. Public bucket URLs do not follow a private board's visibility.

## Automations

A write raises a row in `automation_events` from a trigger (0052–0057), but only when an enabled rule on the board listens. `/api/automations/run` drains the queue.

Something must call that endpoint on a timer. Production uses pg_cron from the database: `optional/automations_pg_cron.sql`, job `streamline-automations`, every minute. The alternatives are in [optional/README.md](optional/README.md).

To check the runner:

```sql
select * from cron.job;                                               -- the driver
select count(*) from automation_events where processed_at is null;    -- a growing queue means nothing drains it
select * from automation_heartbeat;                                   -- when the scheduler last ran
select status, summary, created_at from automation_runs order by created_at desc limit 20;
```

## Snapshots

`workspace_snapshots` (0071) stores gzipped JSON copies of every public table except `schema_migrations` and itself. It has no foreign keys, RLS on and no policies: only the server's direct connection (`src/server/snapshots.ts`) touches it. Restore refills every table with triggers off (`session_replication_role = replica`).

When you change a table, check that snapshots still round-trip:

```bash
npm run db:snapshot:rehearse
```

## Scheduled keep alive

[The keep-alive workflow](../.github/workflows/supabase-keep-alive.yml) runs a read-only `SELECT 1` four times a day (`17 */6 * * *` UTC). It uses the `SUPABASE_DB_URL` repository secret and retries three times.

- It generates activity; it does not guarantee exemption from pausing.
- GitHub disables schedules on public repositories after 60 days without activity.

## Realtime

Every table the app shows is in the `supabase_realtime` publication:

- 0004 publishes the board tables.
- 0005, 0015, 0024, 0026 and 0035 add messages, assets, boards, teams, lists and workspaces.
- 0049 adds profiles, memberships, invitations, favourites, item reads, booking templates and blocks, and the portal tables.
- 0052–0054 add automation rules, runs, the heartbeat and events.
- 0070 adds reactions.

RLS applies to Realtime, so subscribers receive only rows they could `select`.

Replica identity stays at its default. A `DELETE` therefore reaches subscribers as a primary key only, and the client adds an unfiltered `DELETE` listener per filtered table (`src/lib/realtime/use-realtime.ts`).

Details and caveats are in `policies/README.md`.
