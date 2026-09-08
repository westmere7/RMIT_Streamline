# Streamline

Work management for the RMIT creative and marketing team: plan tasks, receive stakeholder briefs, allocate work, track deliverables, and keep discussions alongside the work.

Streamline runs on **Next.js 16, React 19, and TypeScript**, with a shared Supabase backend or a browser-local IndexedDB demo. Both modes use the same feature screens and service interfaces.

[Application](https://rmit-streamline.vercel.app) · [Detailed knowledge base](KNOWLEDGE_BASE.md) · [Development instructions](AGENTS.md)

## What the app does

- **Task boards:** groups, items and subitems, configurable columns, filters, sorting, drag and drop, bulk actions, favourites, and activity history.
- **Seven board views:** Main Table, Kanban, Timeline, Calendar, Gantt, Workload, and Chart, all built from the same task data.
- **Linked tasks:** synchronize supported fields between items on different boards, with field exclusions and shared Updates conversations.
- **Deliverables:** item asset lists with quantities, multiple assignees, due dates, completion, notes, and an optional Assets recap column.
- **Stakeholder booking:** public forms, configurable questions and saved templates, booking references, direct team-board reception, and an administrator-only Task Allocation queue.
- **Public board sharing:** read-only links with optional passwords and expiry dates.
- **Dashboard:** what every team delivers in tasks and asset units, asset mix and distribution, workload across the year, stakeholder requests, people and boards, live from the boards, with span, team, unit and date-basis settings and a public full-screen share link.
- **Personal work:** assignments across boards, date buckets, completion tracking, and collapsed linked copies in My Work.
- **Collaboration:** rich-text Updates with mentions, inbox notifications and quiet updates, browser notifications, and direct messages.
- **Trackers:** spreadsheet-style workbooks with typed cells, dropdowns, summaries, autosave, and `.xlsx` import/export.
- **Workspace administration:** teams, profiles, member roles, deactivation, and invitation-link onboarding without automatic email delivery.

## Run a local demo

Use **Node.js 22.x** and npm. From the repository root:

### PowerShell

```powershell
npm ci
$env:NEXT_PUBLIC_DATA_PROVIDER = 'local'
$env:SKIP_DB_MIGRATE = '1'
npm run dev
```

### macOS / Linux

```bash
npm ci
NEXT_PUBLIC_DATA_PROVIDER=local SKIP_DB_MIGRATE=1 npm run dev
```

Open [localhost:3000](http://localhost:3000). Sign in as **Danh Nguyen** using `danh@rmit.local`; no password is required for the local demo. Open the RMIT workspace and a board such as **RMITinerary 2026** to explore tasks, views, Updates, and assets.

The first local session seeds the browser database automatically. Completed writes survive refresh. Browser data is specific to its origin and profile: ports 3000 and 3100 have separate stores, and another device does not receive the same local data.

The repository's `.npmrc` enables `legacy-peer-deps=true`; `npm ci` uses that setting.

**Why set `SKIP_DB_MIGRATE`?** Both `npm run dev` and `npm run build` have a migration hook. If `SUPABASE_DB_URL` is configured, that hook can apply database changes even when the app uses the local provider. The local commands above explicitly bypass it. In PowerShell, those environment assignments remain in the current shell until removed or the shell closes.

## Connect Supabase

Supabase provides Postgres persistence, password sign-in, row-level security, realtime updates, and media storage. Public booking, public sharing, and onboarding also use the application's server routes.

### 1. Configure the environment

Create `.env.local` from [.env.example](.env.example) if it does not already exist. Fill in the appropriate values for the target Supabase project:

```dotenv
NEXT_PUBLIC_DATA_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_KEY
NEXT_PUBLIC_SUPABASE_REGION=

SUPABASE_DB_URL=YOUR_POSTGRES_CONNECTION_URI
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_DATA_PROVIDER` | Selects `local` or `supabase`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-visible public key; user access is enforced by RLS. |
| `NEXT_PUBLIC_SUPABASE_REGION` | Optional region label shown in the About UI. |
| `SUPABASE_DB_URL` | Server/script-only connection URI for migrations and seed operations. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged key for onboarding, public booking, public sharing, and seed administration. |
| `SKIP_DB_MIGRATE` | Set to `1` to bypass the migration runner. |

Keep privileged keys out of `NEXT_PUBLIC_*` variables and out of version control.

The actual provider default is **Supabase**. If its public URL or key is missing, [configuration](src/lib/config.ts) logs a warning and falls back to local mode. Check that warning when an environment unexpectedly shows demo content. Changing providers selects another store; it does not migrate data between them.

### 2. Apply the schema

If continuing in the PowerShell session used for the local demo, clear its overrides first:

```powershell
Remove-Item Env:NEXT_PUBLIC_DATA_PROVIDER -ErrorAction SilentlyContinue
Remove-Item Env:SKIP_DB_MIGRATE -ErrorAction SilentlyContinue
```

Then apply pending migrations and policies:

```bash
npm run db:migrate
```

The runner applies files from `supabase/migrations` and then `supabase/policies`, in order, recording them in `public.schema_migrations`. Each applied file runs in its own transaction. All policy files matter: later files replace earlier permission definitions.

For an existing database that already has matching schema but no migration ledger, review the [migration guidance](KNOWLEDGE_BASE.md#17-database-operations) before using `--baseline`.

### 3. Choose whether to seed

For a disposable demo or test workspace:

```bash
npm run db:seed
```

**Full seeding replaces the seeded workspace's data** and creates or updates demonstration Auth accounts. It is not an additive operation. The executable seed is [scripts/db-seed.mts](scripts/db-seed.mts), which builds from the TypeScript seed modules. Password overrides include `SEED_PASSWORD` and `ADMIN_PASSWORD`; `SEED_APP_URL` controls the base URL printed for invitation links.

To add supported seed extras while preserving existing rows:

```bash
npm run db:seed:topup
```

The top-up script inserts with `ON CONFLICT DO NOTHING`. For an already populated project, seeding is optional; use the existing accounts or the repository's administrative account tooling as appropriate.

The convenience command `npm run db:setup` combines migration, full seed, and switching an existing `.env.local` to Supabase. Use `npm run db:setup -- --no-seed` when that workflow should preserve the current dataset.

### 4. Start and verify

```bash
npm run dev
```

Sign in with a provisioned Supabase account and password. Confirm that the expected workspace loads. For image uploads, verify the `avatars` and `item-covers` buckets and their write policies; storage setup in migrations may require separate attention when the database role cannot alter Storage objects.

## Common workflows

### Work on a task

Open a board, add an item to a group, assign someone in a PERSON column, and set its status and due date. Open the item panel for details, Updates, assets, and activity. Board links can include `?item=<id>` to reopen the task panel and `?view=<view>` to select a view.

Current column types are Text, Long text, Status, Person, Date, Timeline, Number, Priority, Checkbox, Link, Tags, Size, Assets recap, and Dependency. Status completion uses configured label roles rather than the word “Done.”

### Receive and allocate a booking

A stakeholder opens `/book/<workspaceSlug>/<key>`; signed-in members can use **Book a task** inside the workspace. A selected team's valid receiving board takes the booking directly. Otherwise, it goes to the built-in **Task Allocation** board, visible to workspace administrators.

Booking creates a task, a short reference, asset subitems, and structured asset lines. An administrator can allocate a queued request to a team board, creating a linked task and copying its subitems and assets. The parent tasks synchronize supported fields; asset lists and copied subitems are not automatically synchronized by that link.

Booking keys authorize access to the form. Short task references are labels for follow-up, not access credentials.

### Add a member

An administrator adds a person from Members and shares the generated `/join/<token>` link. The person sets their password and completes their profile, activating membership. The app does not send the invitation email automatically.

Pending members cannot use normal sign-in before completing onboarding. Administrators can renew invitation links or manage member status from the members workflow.

### Share a board

Create a read-only board link and optionally set a password and expiry. Visitors can inspect the board's views and item details without joining the workspace. Disable or regenerate the link to revoke its current access.

The shared payload includes board content such as columns, descriptions, Updates, assets, and recent activity. Review that content when sharing externally; public sharing is not a field-redaction feature. See [public sharing details](KNOWLEDGE_BASE.md#13-public-board-sharing).

### Read the dashboard

Open Dashboard under Inbox. Every figure is computed in the browser from a snapshot of the boards you can see, refreshed as they change (Supabase Realtime, or the cross-tab channel in local mode). Filter by team, choose Total / Year / Half / Quarter, switch between asset units and tasks, and pick which date places work on the calendar (due, created or completed) from the settings menu, which also hides panels you do not need. Admins can Share the dashboard: a `/dashboard/<token>` link opens a full-screen, read-only copy with no sign-in that refreshes every 15 seconds. The public snapshot carries figures only: descriptions, asset notes, emails, links and every text cell except departments are stripped before it leaves the server. See [dashboard details](KNOWLEDGE_BASE.md#13b-workspace-dashboard).

### Use a tracker

Create or import a workbook, edit typed cells, and organize rows with sections and subsections. Sheets autosave after a short debounce; wait for a successful save before leaving. Export creates `.xlsx` files with supported formatting, dropdowns, and summary formulas.

The tracker model is smaller than Excel's. Imported formulas use cached results, and arbitrary workbook features do not necessarily round-trip. See [tracker behavior and limitations](KNOWLEDGE_BASE.md#15-trackers-and-excel-interchange).

## Access model

Workspace roles are OWNER, ADMIN, MEMBER, and GUEST. Board roles are OWNER, EDITOR, and VIEWER. Board visibility and board membership are separate decisions.

For a normal board, effective access is resolved in this order:

1. Literal board ownership grants OWNER.
2. Explicit board membership supplies its assigned role.
3. Workspace administration grants EDITOR.
4. Active non-guest membership grants VIEWER on a WORKSPACE-visible board.
5. Team membership grants EDITOR on a matching TEAM-visible board.
6. PRIVATE visibility grants no additional inherited access.

System boards have an earlier administrator-only gate. Explicit VIEWER membership can override a later inherited editing role. Team association alone does not grant editing to a WORKSPACE-visible board. Guests need ownership or explicit board membership for ordinary board access.

Management and deletion have additional checks, including protection for built-in system entities. Use [permissions.ts](src/lib/permissions/permissions.ts) and the [current SQL visibility policy](supabase/policies/0008_visibility_is_read_only.sql) as the implementation references. Keep application helpers and SQL policies aligned when changing authorization.

Local mode exercises UI behavior; Supabase RLS enforces access on backend requests. An administrator's **View as** feature previews a colleague's visibility but retains the administrator's actual session and write identity.

## Architecture

```text
App Router pages and layouts
  -> Feature screens, contexts, and query hooks
  -> Services: use cases, mapping, activity, notifications
  -> Repository interfaces
     -> Local: IndexedDB
     -> Supabase: Postgres / Auth / Realtime

Public board payload
  -> Read-only memory repositories
  -> Shared board views and item panels
```

[DataProviderContext](src/features/data/data-context.tsx) constructs the repository, service, and auth graph. [createServices](src/services/index.ts) wires shared services such as notifications, item linking, booking, assets, and personal work.

TanStack Query owns fetched data and optimistic reconciliation. Zustand owns interaction state and selected UI preferences. Local tabs announce changes through BroadcastChannel; Supabase boards subscribe to database changes and coalesce invalidations before refetching. Public shared boards periodically refresh a bounded read-only payload.

Use services and repository contracts for normal task data. Keep pure transformations in domain or service helpers, use centralized query keys, and use shared permission functions. Some explicit provider-aware helpers, including avatar and cover uploads, access Storage directly.

### Repository map

| Path | Responsibility |
| --- | --- |
| `src/app` | Routes, layouts, providers, global styles, HTTP endpoints. |
| `src/domain` | Types, typed column values, constants, and pure domain helpers. |
| `src/services` | Board/task workflows, booking, links, assets, messages, and trackers. |
| `src/data/repositories` | Persistence contracts shared by providers. |
| `src/data/local` | IndexedDB schema and repositories. |
| `src/data/supabase` | Supabase repositories, row mapping, and HTTP transports. |
| `src/data/memory` | Bounded read-only repositories for public boards. |
| `src/features/dashboard` | Dashboard analytics, charts, panels, pages and the share dialog. |
| `src/data/seed` | Demo data, history, tracker fixtures, and local seed application. |
| `src/features` | Product screens, feature hooks, editors, and contexts. |
| `src/components` | Layout, shared controls, and UI primitives. |
| `src/server` | Privileged onboarding, booking, sharing, and HTTP support. |
| `src/lib`, `src/stores` | Routes, config, permissions, dates, query keys, and UI state. |
| `supabase` | Ordered migrations, policies, and historical SQL seed material. |
| `scripts` | Migration, seed, setup, account, and test-runner tooling. |
| `tests/unit`, `tests/e2e` | Unit/component and browser regression suites. |

### Main technologies

| Area | Technology |
| --- | --- |
| Runtime | Node.js 22.x |
| Framework | Next.js 16.3.4, React 19.2.8 |
| Language | TypeScript with strict checking |
| UI | Tailwind CSS 4, Radix UI, Lucide, Sonner |
| Data and state | TanStack Query, Zustand, idb, Supabase JS |
| Editing | Tiptap, React Hook Form, Zod, dnd-kit |
| Dates and workbooks | date-fns, react-day-picker, ExcelJS |
| Testing | Vitest, Testing Library, happy-dom, fake-indexeddb, Playwright |

See [package.json](package.json) for declared versions and [package-lock.json](package-lock.json) for resolved dependencies.

## Commands and tests

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server; preceded by the configured migration hook. |
| `npm run build` | Production build; preceded by the configured migration hook. |
| `npm run start` | Serve an existing production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript checks. |
| `npm test` | Vitest unit and component tests. |
| `npm run test:watch` | Vitest watch mode. |
| `npm run check` | Lint, typecheck, then unit/component tests. |
| `npm run test:e2e` | Local-provider Playwright workflows by default. |
| `npm run test:e2e:supabase` | Supabase smoke/audit suite, including backend access checks. |
| `npm run test:e2e:deployment` | Smoke tests against a deployed URL. |
| `npm run db:migrate` | Apply pending schema and policy files. |
| `npm run db:seed` | Replace the seeded demonstration workspace. |
| `npm run db:seed:topup` | Add seed extras without replacing existing rows. |
| `npm run db:setup` | Migrate, seed, and switch an existing environment file to Supabase. |

For ordinary code changes, start with:

```bash
npm run check
```

Install the Playwright browser when needed, then run browser workflows:

```bash
npx playwright install chromium
npm run test:e2e
```

The standard Playwright configuration uses one worker, Desktop Chrome, and `http://localhost:3100`. It launches a local-provider dev server unless overridden and can reuse an existing server outside CI. Check the provider of an already running server before reusing it. Its dev command still has the npm migration hook described above.

The Supabase runner uses `E2E_PROVIDER` and `PW_PROVIDER` to select its audit path. Deployment tests use `E2E_BASE_URL`, `E2E_EMAIL`, and `E2E_PASSWORD`, start no server, and default to the application URL linked above. Remote suites create and modify data; choose their target workspace deliberately.

`npm run check` does not include E2E tests or a production build. Local tests verify local behavior; backend permissions, public endpoints, and Storage also need Supabase integration verification. The [knowledge base test guide](KNOWLEDGE_BASE.md#19-testing-and-verification) maps suites to their responsibilities.

## Database maintenance

Add new numbered files for deployed schema or policy changes. The migration runner uses a database advisory lock and a checksum ledger. Editing an already applied file produces a drift warning; it does not reapply that file automatically.

```bash
npm run db:migrate -- --dry
```

This reports pending migration bodies without executing them, but still connects and ensures the migration ledger and its RLS. It is not a completely write-free operation on an uninitialized database.

Local JSON export/import, tracker Excel interchange, and Postgres backup/restore are separate mechanisms. Local import and reset replace browser data. Supabase does not support the local repository's whole-database export/import/reset methods; use database backup tooling and the appropriate administrative scripts.

See [database operations](KNOWLEDGE_BASE.md#17-database-operations) for migration order, seed behavior, lifecycle hooks, and environment details.

## Deployment

[Vercel configuration](vercel.json) selects Next.js, installs development dependencies with legacy peer resolution, runs `npm run build`, and requests application region `sin1`. Configure public Supabase values for the build and the service-role key for server routes. The app's region setting does not determine the database's region.

When `SUPABASE_DB_URL` is present, the build hook applies pending migrations unless `SKIP_DB_MIGRATE=1`. The [database migration workflow](.github/workflows/db-migrate.yml) also applies pending files for matching pushes to `main`, using the repository's `SUPABASE_DB_URL` secret. Decide which deployment environment each connection targets.

Every build carries a version, build ID, and timestamp. `/api/version` lets an open tab detect a different deployment and offer Reload or Later; updates do not force an immediate reload.

## Troubleshooting

| Symptom | First check |
| --- | --- |
| Unexpected local/demo content | Missing public Supabase config, provider warning, or different browser origin. |
| Dev/build fails before compilation | Migration hook, database connection, or pending SQL failure. |
| Board opens but cannot be edited | Visibility-only VIEWER access or explicit VIEWER membership. |
| New member cannot sign in | Pending invitation/onboarding state. |
| Booking, sharing, or member creation fails while boards work | Server service-role configuration, token/key, and required migrations. |
| Linked value does not update | Field exclusions, compatible column mapping, and target label names. |
| Avatar/cover upload fails | Image size/type, bucket existence, and Storage write policies. |
| Another tab or person sees stale data | Provider-specific broadcast/realtime setup and query invalidation. |
| Tracker content differs after import | Supported types, cached formula results, and workbook feature limitations. |

For deeper investigation, use the [troubleshooting reference](KNOWLEDGE_BASE.md#20-troubleshooting) and its source index. Preserve the original data while investigating a configuration or access problem.

## Development guidance

Read [AGENTS.md](AGENTS.md) before changing the application. For Next.js changes, it requires checking the relevant installed guides under `node_modules/next/dist/docs/`; this version may differ from conventions in earlier releases.

Keep persistence changes consistent across local and Supabase providers and the public memory adapter where applicable. Keep authorization helpers and SQL policies aligned. Include affected views, link mapping, booking, and export behavior when changing a domain value or column type.

The [knowledge base](KNOWLEDGE_BASE.md) contains the full domain model, route and API catalog, synchronization behavior, migration inventory, known implementation limits, and change guides. This README provides the starting workflow; that document provides the detailed maintenance reference.
