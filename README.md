# Streamline

Work management for the RMIT creative and marketing team. Stakeholders book work through one portal, the team plans and delivers it on boards, automations do the routine follow-up, and a live dashboard shows who is carrying what.

Streamline runs on **Next.js 16, React 19 and TypeScript**. It has two backends behind the same screens and services: a shared Supabase backend, or a browser-local IndexedDB demo.

[Application](https://rmit-streamline.vercel.app) · [Knowledge base](KNOWLEDGE_BASE.md) · [Development instructions](AGENTS.md) · [Latest audit](Test_prompts/audits/2026-09-26-full-e2e/README.md)

## What the app does

- **Boards.**
  - Groups, tasks and subitems; 25 column types; filters, sort, search, drag and drop; bulk actions; favourites; archive; activity.
  - Every board holds the 10 special columns the workspace reads: Status, PIC, Requester, Due date, Timeline, Priority, Department, Size, Assets recap, Brief. Deleting one only takes it off the board.
- **Seven views.** Main Table, Kanban, Timeline, Calendar, Gantt, Workload and Chart, all over the same tasks.
- **Tickets.** Every task can carry a quotable code such as `CP_014`, from a per-workspace counter with a prefix set in Settings.
- **The task panel.** Name first; three widths or a pop-up over the board; every column as a row; deliverables; Updates; Activity; and a **task journey** from booking to archive.
- **Collaboration.** Threaded updates with replies, 16 reactions, @mentions, an Inbox with per-event delivery, browser notifications, direct messages, and profile hover cards.
- **Deliverables.** Asset lines with type, quantity, several owners, due date, completion, spec and links. Linked tasks share them.
- **Linked tasks.** Selected fields and the conversation stay in sync between tasks on different boards. Columns are paired automatically or by hand.
- **Booking and the portal.**
  - One portal link per workspace. Visitors see the work by department and period, and book new work in a four-step wizard driven by service types.
  - The requester becomes a person on the task: a known email is that person, a new one becomes a pending member.
  - Bookings land on the service's team board, or in the admin-only **Task Allocation** queue for an admin to allocate.
- **Automations.** "When this, then that" board rules: 21 triggers, 23 actions, 10 recipes, and quick runs fired by hand. They run on the server from a database queue, whether or not anyone has the app open.
- **Board templates.** Save a board's layout with chosen parts, and start new boards from it.
- **Dashboard.** Tasks, asset units or estimated effort by team, department and person, against last year. It can be shared as a public, full-screen link.
- **Trackers.** Spreadsheet-style workbooks with typed cells, summaries, autosave, and `.xlsx` import/export.
- **Administration.**
  - Teams, members and roles, onboarding by join link (no email), departments, asset types and output rates, ticket prefix.
  - **Snapshots** of the whole database, with download, upload and restore.
  - A **Danger zone** that wipes all board data behind a password.
- **Everywhere.** Live updates across tabs and people; light, dim and dark themes; an in-app guide (Settings → Guide); and a new-version card with What's new.
- **On a phone.** Its own layout below 768 px: bottom tabs, boards as cards, dialogs that rise from the bottom, full-screen search, My Work filters and Settings as a list. It installs to a home screen, and a bar says when the connection drops.

## Run a local demo

Use **Node.js 22.x** and npm. From the repository root:

```powershell
npm ci
$env:NEXT_PUBLIC_DATA_PROVIDER = 'local'
$env:SKIP_DB_MIGRATE = '1'
npm run dev
```

```bash
npm ci
NEXT_PUBLIC_DATA_PROVIDER=local SKIP_DB_MIGRATE=1 npm run dev
```

Open [localhost:3000](http://localhost:3000) and choose an account tile, such as **Danh Nguyen**. The local demo needs no password.

- The first visit seeds the browser's database: the RMIT workspace, its teams and boards, a year of history and trackers.
- Completed writes survive a refresh.
- Each origin has its own store, so `:3000` and `:3100` differ.
- Automations do not run in local mode; only quick runs do.

**Why `SKIP_DB_MIGRATE`?** `npm run dev` and `npm run build` both run the migration runner first, against whatever `SUPABASE_DB_URL` names. That happens even when the app uses the local provider. The skip keeps a local demo away from any database.

To run a second dev server beside your own, give it a separate build folder: `NEXT_DIST_DIR=.next-preview npm run dev -- --port 3200` (this is `.claude/launch.json`'s `dev-preview`).

## Connect Supabase

Supabase provides Postgres, password sign-in, row-level security, Realtime and Storage. Booking, the portal, shares, onboarding, snapshots and the automation runner also use the app's server routes.

### 1. Configure the environment

Create `.env.local` from [.env.example](.env.example):

```dotenv
NEXT_PUBLIC_DATA_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_KEY
NEXT_PUBLIC_SUPABASE_REGION=

SUPABASE_DB_URL=YOUR_POSTGRES_SESSION_POOLER_URI
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

AUTOMATION_SECRET=A_LONG_RANDOM_STRING
AUTOMATION_TIMEZONE=Australia/Melbourne
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_DATA_PROVIDER` | `local` or `supabase` (the default). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-visible project URL and public key. Access is enforced by RLS. |
| `NEXT_PUBLIC_SUPABASE_REGION` | Optional label shown in About. |
| `SUPABASE_DB_URL` | Server/script only. Used by migrations, seeds, snapshots, restore and wipe. Use the **session pooler** URI; the direct host is IPv6-only. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Used by onboarding, booking, the portal, shares, the public dashboard, the automation runner and seeds. |
| `AUTOMATION_SECRET` | The automation runner's secret. The same value goes wherever the runner is called from (pg_cron, GitHub Actions or Vercel cron). |
| `AUTOMATION_TIMEZONE` | The zone scheduled rules read the clock in. |
| `SKIP_DB_MIGRATE` | `1` bypasses the migration runner. |

Never put privileged keys in `NEXT_PUBLIC_*` variables or in version control.

If the public URL or key is missing, [configuration](src/lib/config.ts) warns and falls back to local mode. Switching providers moves no data.

### 2. Apply the schema

```bash
npm run db:migrate
```

- **Order.** The runner applies pending files from `supabase/migrations` and `supabase/policies` in the order [`supabase/sequence.txt`](supabase/sequence.txt) gives: the order they were first applied. That is the only order that builds an empty database, because some migrations use helpers that policy files define.
- **Ledger.** Applied files are recorded in `public.schema_migrations`. Each file runs in its own transaction.
- **Drift.** Editing an applied file is reported as drift, never re-run.

`--dry` lists pending files. `--baseline` marks them applied without running them, for a database that already has the schema. See [database operations](KNOWLEDGE_BASE.md#17-database-operations).

### 3. Choose whether to seed

For a **disposable** demo or test database only:

```bash
npm run db:seed
```

Full seeding **replaces** the seed workspace:

- It creates or updates the demo Auth accounts. Passwords: `SEED_PASSWORD`, default `Password123!`; the admin uses `ADMIN_PASSWORD`, default `admin123`.
- It prints fresh join links for the pending members.

Never run it against a workspace people use.

To add demo content without replacing anything, use `npm run db:seed:topup` (it inserts with `on conflict do nothing`). `npm run db:special-columns` gives every board its special columns.

### 4. Start the automation runner

Rules are fired by a server draining a database queue, so something must call `/api/automations/run` on a timer. With the runner secret, a call runs a full tick. The options are in [supabase/optional/README.md](supabase/optional/README.md):

- **pg_cron in the database**, every minute. Production uses this.
- **Vercel cron**, on paid plans.
- **The GitHub Actions workflow**, every 5 minutes.

Without a driver, rules still fire when someone edits a board: the app nudges the runner with that person's session. Schedules and the heartbeat, though, need the timer.

### 5. Start and verify

```bash
npm run dev
```

Sign in with a provisioned account and confirm the workspace loads. For image uploads, check the `avatars` and `item-covers` buckets and their write policies.

## Common workflows

### Work on a task

1. Open a board and add a task to a group.
2. Set its PIC, Status and Due date.
3. Open it for the details, the deliverables and the Updates thread.

- `?item=<id>` reopens a task after a refresh; `?view=<view>` opens a view.
- Completion follows the label's *done* role, not the word "Done".

### Book, then allocate

A stakeholder books in one of three ways:

- through the portal (`/portal/<token>` → Book a task);
- through the public link (`/book/<slug>/<key>`);
- signed in, at `/book/<slug>`.

What happens next:

1. The service chosen in step one decides the brief questions and where the booking goes: the service team's receiving board, or **Task Allocation**.
2. The booking creates one task, with its ticket, deliverable lines, the brief in its Brief column, the department, and the requester as a person.
3. An admin allocates queued work to a team board from the task panel, the row menu or in bulk. Allocation moves the task itself: its id, ticket, deliverables and brief are kept.

### Add a member

1. An admin adds the person from Members.
2. The admin passes on the generated `/join/<token>` link. No email is sent.
3. The person sets a password and completes their profile.

Pending people can't sign in until they do. A public booking with a new email also creates a pending member.

### Automate a board

Open the board's **Automations** (the lightning button):

- start from a recipe, or write a rule: When → Only if → Then;
- save a quick run to fire by hand on chosen tasks;
- the workspace **Automations** page lists every rule and what has run, and warns when the runner has stopped.

Notify actions skip the person who caused them. Test with a second person.

### Share, template, snapshot

- **Board or task:** share read-only, for members or anyone, with an optional password and expiry.
- **Dashboard:** admins can publish a full-screen dashboard link.
- **Template:** "Save as template…" in a board's menu, then pick it in Create board.
- **Snapshot:** Settings → Snapshots (Supabase, admins) takes, downloads, uploads and restores snapshots.

Restore replaces **every** table, for every workspace, and first saves the current state. Snapshot files contain live links and keys, so keep them private.

## Access model

| Kind | Roles |
| --- | --- |
| Workspace | OWNER, ADMIN, MEMBER, GUEST. OWNER and ADMIN have the same powers inside one workspace, on purpose. |
| Board | OWNER, EDITOR, VIEWER |

A board's effective role is resolved in this order:

1. System boards (Task Allocation) are admin-only.
2. No active membership, no access.
3. The literal board owner is OWNER.
4. An explicit board seat gives its role.
5. A workspace admin is EDITOR.
6. A WORKSPACE-visible board gives non-guests VIEWER.
7. A TEAM-visible board gives members of its team EDITOR.
8. PRIVATE gives nothing further.

Beyond board roles:

- **Automations:** managing a board's automations needs its owner or an admin. Quick runs need edit rights.
- **Templates:** anyone can save one; the saver or an admin deletes it.
- **Admins only:** snapshots, the Danger zone, the portal, Task Allocation and the ticket prefix.

The helpers are in [permissions.ts](src/lib/permissions/permissions.ts); the database side is the policies in `supabase/policies`. Services themselves check nothing: RLS and the server routes are the gate. The local provider enforces only what the UI offers. **View as** previews a colleague's visibility; it doesn't sign you in as them.

## Architecture

```text
App Router pages -> feature screens and hooks (TanStack Query, Zustand)
  -> services (use cases)  -> repository contracts
     -> Local: IndexedDB   | Supabase: Postgres / Auth / Realtime / Storage

Public pages (shares, portal, dashboard link) -> server routes (service role) -> projections
  -> read-only memory repositories -> the same board views and panels

Automations: any write -> Postgres trigger -> automation_events
  -> /api/automations/run (pg_cron, or a member's nudge) -> AutomationEngine -> ordinary services
```

- **Composition.** [DataProviderContext](src/features/data/data-context.tsx) builds the repositories, services and auth provider, and [createServices](src/services/index.ts) wires the services together.
- **Freshness.**
  - Local tabs signal each other through BroadcastChannel.
  - Supabase pages subscribe to Realtime and coalesce refetches.
  - Public pages poll.

### Repository map

| Path | Responsibility |
| --- | --- |
| `src/app` | Routes, layouts, providers, styles; 29 HTTP route handlers under `api/`. |
| `src/domain` | Types and pure helpers (columns, tickets, automations, booking, portal, templates). |
| `src/services` | Use cases, including the automation engine, booking, portal, tickets and search. |
| `src/server` | Service-role code: booking, requesters, portal, sharing, onboarding, the automation runner, snapshots. |
| `src/data` | Repository contracts; local (IndexedDB v17), Supabase and read-only memory implementations; seeds. |
| `src/features`, `src/components` | Screens, feature hooks and UI. |
| `src/lib`, `src/stores`, `src/hooks` | Config, routes, permissions, dates, rich text, realtime, changelog; UI state. |
| `supabase` | 77 migrations, 19 policies, `sequence.txt`, optional SQL. |
| `scripts` | Migration, seeds, special columns, snapshot rehearsal, ticket dedupe, test runners. |
| `tests/unit`, `tests/e2e` | Vitest and Playwright suites. |

### Main technologies

| Area | Technology |
| --- | --- |
| Runtime | Node.js 22.x |
| Framework | Next.js 16.3.4, React 19.2.8 |
| Language | TypeScript 5.9 (strict) |
| UI | Tailwind CSS 4, Radix UI, Lucide, Sonner, cmdk |
| Data and state | TanStack Query and Virtual, Zustand, idb, Supabase JS, postgres |
| Editing | Tiptap, React Hook Form, Zod 4, dnd-kit |
| Files | ExcelJS (trackers), jszip (Word export of briefs) |
| Dates | date-fns, react-day-picker |
| Hosting | Vercel (functions in `sin1`), Supabase (ap-southeast-1), pg_cron |
| Testing | Vitest, Testing Library, happy-dom, fake-indexeddb, Playwright |

## Commands and tests

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Development, production build, serve. `dev` and `build` migrate first unless `SKIP_DB_MIGRATE=1`. |
| `npm run lint` / `typecheck` / `test` | ESLint; TypeScript (tests included); Vitest. |
| `npm run check` | Lint, typecheck and unit tests. |
| `npm run test:e2e` | Playwright on the local provider (`:3100`). |
| `npm run test:e2e:supabase` | Supabase smoke suite, including direct RLS checks. |
| `npm run test:e2e:deployment` | Smoke tests against a deployed URL. Defaults to production, and writes. |
| `npm run db:migrate` | Apply pending SQL in `supabase/sequence.txt` order. |
| `npm run db:seed` / `db:seed:topup` | Replace the demo workspace (disposable databases only) / add demo extras. |
| `npm run db:special-columns` | Give every board its special columns. |
| `npm run db:snapshot:rehearse` | Check that a snapshot still round-trips the current schema (rolled back). |
| `npm run tickets:dedupe` | Find, and with `--apply` renumber, shared tickets. |
| `npm run db:setup` | Migrate, seed and switch `.env.local` to Supabase. |

For ordinary changes run `npm run check`. Then, for browser workflows:

```bash
npx playwright install chromium
SKIP_DB_MIGRATE=1 npm run test:e2e
```

- **Playwright.** One worker, Desktop Chrome, `http://localhost:3100`. It launches a local-provider dev server unless one is already running there.
  - That server is `npm run dev`, so its `predev` step migrates whatever database `.env.local` names, even though the app uses local data. Hence the `SKIP_DB_MIGRATE=1`.
  - `test:e2e:supabase` loads `.env.local` into the tests as well. Run it only where `.env.local` names a disposable database.
- **Supabase suites.** Local tests can't verify RLS, triggers, server routes or the automation runner. For those, use a disposable Supabase database: the [knowledge base](KNOWLEDGE_BASE.md#19-testing-and-verification) describes a Docker stack plus a separate worktree that cannot reach production.
- **SQL.** Adding a SQL file? Append it to `supabase/sequence.txt`; `tests/unit/sql-sequence.test.ts` fails until you do.

## Deployment

[Vercel configuration](vercel.json):

- installs with legacy peer resolution;
- runs `npm run build`, which applies pending SQL when `SUPABASE_DB_URL` is set;
- places functions in `sin1`;
- has no `crons` block, on purpose: a disallowed schedule would fail the deploy.

The [database migration workflow](.github/workflows/db-migrate.yml) also applies SQL on pushes to `main`. Pushing a migration therefore changes production's schema.

Every build carries a version, build id and timestamp. `/api/version` lets open tabs notice a new deployment and show a card with **What's new** (from `src/lib/changelog.ts`), so people can refresh when it suits them. Each version bump needs its changelog entry: `tests/unit/changelog.test.ts` checks this.

## Troubleshooting

| Symptom | First check |
| --- | --- |
| Unexpected demo content | Missing public Supabase config, the provider warning, or a different browser origin. |
| Dev or build fails before compiling | The migration hook, the database connection, or a pending SQL failure. |
| A fresh database stops at migration 0005 | Use the runner that follows `supabase/sequence.txt`. |
| Board opens but can't be edited | VIEWER from visibility, or an explicit VIEWER seat. |
| New member can't sign in | Pending onboarding: finish the join link. |
| Booking, sharing or member creation fails while boards work | The server's service-role key, the token or key, and migrations. |
| An automation doesn't fire | Is the runner being called (Automations page heartbeat)? Is the queue growing? What does the rule's activity say? Notify skips the actor. |
| A special column disappeared | It was removed, not deleted: add its type back and its values return. |
| A department value is refused | Add it to Settings → Departments. |
| Linked value doesn't update | Exclusions, column pairing, label names. |
| Avatar or cover upload fails | Image size and type, the bucket, Storage policies. |
| Tracker content differs after import | Supported types, cached formula results. |

The [troubleshooting reference](KNOWLEDGE_BASE.md#20-troubleshooting) goes deeper.

## Development guidance

Read [AGENTS.md](AGENTS.md) before changing the application. It requires checking the installed Next.js guides under `node_modules/next/dist/docs/`; this version differs from earlier releases.

- **Providers.** Keep local, Supabase and the memory adapter consistent.
- **Permissions.** Keep `permissions.ts` and the SQL policies aligned.
- **Column types.** A new column type touches the cell renderer, sorting, filters, link sync, folded summaries, the picker, automations and booking mapping (see the [change guides](KNOWLEDGE_BASE.md#21-development-change-guides)).
- **Docs.** Update the [knowledge base](KNOWLEDGE_BASE.md) and the in-app guide (`src/features/workspace/documentation/guide-content.ts`) along with the behaviour they describe.
