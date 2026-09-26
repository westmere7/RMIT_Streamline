# Streamline knowledge base

## 1. Purpose, scope, and evidence

Streamline is the RMIT creative and marketing team's own work-management application. It combines:

- configurable task boards, with automations and board templates;
- stakeholder booking through one portal, and allocation of that booked work to teams;
- deliverable tracking, and a live dashboard;
- spreadsheet-style trackers;
- threaded discussions, direct messages and notifications;
- workspace administration, including snapshots.

This document is the technical and operational reference for developers, maintainers, administrators, testers and coding agents. It describes the implementation in this repository, how its parts fit together, and which files to read before changing behaviour.

**Snapshot.** This document was rewritten on 26 September 2026.

- **Base:** revision `0649d71`, package `0.49.0`.
- **On top of it:** the changes of that day's audit, released as `0.49.1`. They are listed in `Test_prompts/audits/2026-09-26-full-e2e/FIX_LOG.md`.
- **Where the audit changed behaviour**, this document describes the new behaviour and says so. Examples: portal booking by department name, requester renaming, ticket search, `column_cleared`.
- **Proposed SQL** that is not yet applied is described as proposed.
- **Repository heads:** migration **0078**, policy **0019**, `supabase/sequence.txt` listing all 96 SQL files, IndexedDB **17**.

**Evidence precedence.** When sources disagree, trust them in this order:

1. Executable code and current configuration.
2. Tests. They show intended behaviour and regression coverage; a test existing does not mean it ran.
3. Comments and older prose.

SQL must be read in the order it is applied (`supabase/sequence.txt`), including later policy replacements.

What was executed for this rewrite, and what was only read, is recorded in the audit folder (`COVERAGE.md`).

### Changes since the 13 September snapshot (v0.19 → v0.49)

| Area | What changed |
| --- | --- |
| Tickets | Every task can carry a ticket such as `CP_014`. The number comes from a per-workspace counter; the prefix is set in Settings → Tickets. Uniqueness is enforced in `TicketService`. Tickets replaced the `TA-` booking references (migrations 0050/0051). |
| Automations | Board rules — "when this, then that" — fired by Postgres triggers into a queue and drained server-side by `/api/automations/run`. 21 triggers, 23 actions, 10 recipes, quick runs, a heartbeat and a running indicator (0052–0057). |
| Columns | New types: Dropdown, People, Rich text → Brief, Requester, Date, Time, Date + Time, Countdown, Booking time. Column roles ("Used as"). 10 special columns on every board; deleting one only removes it from view (0075). One of each special type per board. Departments locked to Settings' list (trigger 0074). |
| Task panel | Name first; pop-up mode; three widths (300/520/880); two panes in the wide view; columns as draggable rows with their own menus; hide in panel (0044); task journey. |
| Collaboration | Threaded updates with replies (0062); 16 reactions (0070); inline "Delete?"; reply notifications; profile hover cards. |
| Booking and portal | Requester special column filled by bookings; public bookers found by email or added as pending members; live email check and name fill. Per-link portal settings (0058); booking page scale (0060/0061); the published form is named (0059). Portal task journey; "Portal and Booking" naming. |
| Boards | Saved board templates with chosen parts (0077). Folded groups become one summary row. Item column resize. Board menu regrouped. |
| Administration | Settings regrouped (Workspace / Lists / People / You / Data / Help). Snapshots with download, upload and restore (0071). Danger zone wipe (0076). New-version card with a changelog. Undo offer. Resizable sidebar. |
| Everywhere | Realtime on the remaining workspace tables (0049); "Department" is the only word for who work is for (0063/0065). |
| Phone | Card list with quick sheets and a New item button; grid and Kanban fitted to a phone (v0.24–v0.25). |
| Operations | The migration runner applies `supabase/sequence.txt` order, so an empty database can be built from the repo; `db:seed` works again (audit fixes F-108, F-109). |

### Navigation

1. [Product and terminology](#2-product-and-terminology)
2. [Technology and repository map](#3-technology-and-repository-map)
3. [Architecture and request flow](#4-architecture-and-request-flow)
4. [Configuration and local development](#5-configuration-and-local-development)
5. [Routes and server endpoints](#6-routes-and-server-endpoints)
6. [Domain and persistence](#7-domain-and-persistence)
7. [Authentication and onboarding](#8-authentication-and-onboarding)
8. [Authorization](#9-authorization)
9. [Boards, columns, and views](#10-boards-columns-and-views)
10. [Items, tickets, links, and assets](#11-items-tickets-links-and-assets)
11. [Booking and allocation](#12-booking-and-allocation)
12. [Board and task sharing](#13-board-and-task-sharing)
    - [Workspace dashboard](#13b-workspace-dashboard)
    - [Stakeholder portal](#13c-stakeholder-portal)
    - [The phone experience](#13d-the-phone-experience)
    - [Automations](#13e-automations)
13. [Personal work and collaboration](#14-personal-work-and-collaboration)
14. [Trackers and Excel interchange](#15-trackers-and-excel-interchange)
15. [State, synchronization, and saving](#16-state-synchronization-and-saving)
16. [Database operations, snapshots and the danger zone](#17-database-operations)
17. [Deployment, build identity and updates](#18-deployment-build-identity-and-updates)
18. [Testing and verification](#19-testing-and-verification)
19. [Troubleshooting](#20-troubleshooting)
20. [Development change guides](#21-development-change-guides)
21. [Documentation discrepancies and implementation limits](#22-documentation-discrepancies-and-implementation-limits)
22. [Source index](#23-source-index)

## 2. Product and terminology

A workspace contains teams, people, boards and trackers. Boards contain groups, columns, items and subitems. Column definitions describe a board's structure; separate item-column value records hold each task's data.

| Term | Meaning in this application |
| --- | --- |
| Workspace | The organisation-level container: membership, roles, booking key, booking form, ticket prefix and counter, output rates. |
| Team | A group of members that organises boards and trackers and can name a board that receives bookings. The built-in Admin team (`system = "ADMIN"`) holds Task Allocation and has its own sidebar panel. |
| Board | A configurable work surface with ownership, visibility, members, groups and typed columns. |
| Group | An ordered section of a board, such as Planning or Completed. |
| Item / task | A task with identity, name, description, position, optional cover and optional ticket. |
| Subitem | An item whose `parentItemId` points at another item. It uses the board's columns. |
| Column | A board's field definition: type, position, width, settings, optional role, and the `hidden`, `hiddenInPanel` and `removed` flags. |
| Special column | One of the 10 system types every board holds exactly once: Status, PIC, Requester, Due date, Timeline, Priority, Department, Size, Assets recap and Brief. Task Allocation also has Booking time. |
| Column role | A column's declared job on its board ("Used as"): status, pic, dueDate, timeline, priority, stakeholder, size, assetsRecap, requester, department, requestedTeam, assetType, brief. |
| Status role | What a status label means — done, stuck or progress — separate from its wording. |
| Ticket | A task's quotable code, `PREFIX_NNN` (for example `CP_014`), drawn from the workspace's counter. |
| Linked item | A separate item on another board, joined for selective field synchronisation, shared deliverables and a shared Updates conversation. |
| Asset / deliverable | A structured deliverable line on an item: type, quantity, assignees, due date, completion, spec and two links. |
| Department | Who the work is for. It comes from Settings → Departments, is stored in a STAKEHOLDER column, and is the only word used for it. |
| Requester | Who asked for the work: a person (a REQUESTER column), filled by bookings. |
| Brief | A booking's composed brief: one rich-text document in the Brief column. |
| Booking service | A kind of work on the booking form, with its own brief questions and optional receiving team. |
| Task Allocation | The built-in, admin-only board that receives bookings without a direct destination. |
| Automation | A board rule — trigger, optional conditions, actions — run server-side. A **quick run** is a saved group of actions fired by hand; a **recipe** is a ready-made starting point. |
| Board template | A saved layout (columns, and optionally groups, settings, layout, automations, task names, look) that new boards start from. |
| Snapshot | A gzipped JSON copy of every public table, stored in the database; it can be downloaded, uploaded and restored. |
| Danger zone | Settings' wipe of all board data. It takes a snapshot first. |
| Thread / reply / reaction | An update with one level of replies under it, and emoji reactions on either. |
| Task journey | A task's milestones from booking to archive, timed, in one dialog. |
| Board / task share | A read-only link to a board or one task: public or member-only, optional password and expiry. |
| Portal | One workspace-wide reading and booking link. Department and date choices filter an already authorised set. |
| Dashboard | Figures derived from the boards, in tasks, asset units or estimated effort; can be shared publicly. |
| Invitation | A token-based onboarding link for a pending member. |

### Main user journeys

- **Team member:** sign in, find work (Home, My Work, search), update fields, discuss a task in its thread, track deliverables, read the Inbox.
- **Team manager:** organise boards and groups, assign people, set up automations, review workload and the dashboard, save a board as a template.
- **Admin:** run Task Allocation, the portal and the form editor; manage members, teams, departments, asset types, tickets; take snapshots.
- **Stakeholder:** open the portal or booking link, book in four steps, get a ticket, follow progress on the portal.
- **Share-link reader:** open a board, task or dashboard link and pass its gate.

Booking keys, board/task/dashboard share tokens, portal tokens, invitation tokens and the automation runner secret are separate credentials for separate purposes.

## 3. Technology and repository map

### Runtime and packages

Use Node.js **22.x** (the package's `engines`). The package is private, named `rmit-streamline`.

| Responsibility | Implementation |
| --- | --- |
| Application framework | Next.js `16.3.4`, App Router (read `node_modules/next/dist/docs/` before changing Next.js code, as `AGENTS.md` requires) |
| UI runtime | React and React DOM `19.2.8` |
| Language | TypeScript `^5.9.0`, strict, `noUncheckedIndexedAccess`, `noImplicitOverride` |
| Styling | Tailwind CSS 4 with CSS tokens, `tw-animate-css` |
| UI primitives | Radix UI (`radix-ui`), wrappers in `src/components/ui` |
| Icons, toasts, palette | Lucide, Sonner, cmdk |
| Remote-state cache | TanStack Query `^5.102.8` |
| Row virtualisation | TanStack Virtual `^3.14.11` |
| Client UI state | Zustand `^5.0.15` |
| Browser persistence | IndexedDB through `idb` `^8.0.3` |
| Shared backend | Supabase JS `^2.115.0`: Postgres, Auth, Realtime, Storage |
| Server-side SQL | `postgres` `^3.4.9` (migrations, seeds, snapshots, restore, wipe) |
| Rich text | Tiptap `^3.31.3` with mentions and placeholders; a Markdown subset stored as text |
| Word export | `jszip` builds `.docx` files from rich text (`src/lib/rich-text-docx.ts`) |
| Forms | React Hook Form, resolvers, Zod 4 |
| Drag and drop | dnd-kit core, sortable, modifiers, utilities |
| Dates | date-fns 4, react-day-picker 10 |
| Excel | ExcelJS `^4.4.0` |
| Unit/component tests | Vitest 4, happy-dom, Testing Library, fake-indexeddb |
| Browser tests | Playwright `^1.62.1` |
| Scripts | Node ESM scripts and `tsx` for TypeScript ones |

`.npmrc` sets `legacy-peer-deps=true`; Vercel installs with the same flag. `package-lock.json` controls reproducible installs.

### Directory responsibilities

| Path | Responsibility |
| --- | --- |
| `src/app` | App Router pages and layouts, providers, styles, and the 29 HTTP route handlers under `api/`. |
| `src/components/layout` | App shell, sidebar, phone shell, menus (`menu-sheet.tsx` renders menus as sheets on phones), loader. |
| `src/components/shared`, `src/components/ui` | Reusable controls (avatars with hover cards, rich text, labels) and primitives. |
| `src/domain` | Types, value unions, constants and pure helpers: board, item, ticket, automation, booking, portal, dashboard, template. |
| `src/data/repositories` | The 25 repository contracts shared by providers. |
| `src/data/local` | IndexedDB schema (v17), connection and repositories. |
| `src/data/supabase` | Supabase repositories, row mapping, HTTP transports for server routes. |
| `src/data/memory` | Read-only repositories over a public payload (shares, portal). |
| `src/data/seed` | Deterministic demo data, extras, 2025 history, trackers, top-up logic. |
| `src/services` | Use cases: boards, items, tickets, links, assets, booking, portal, automations (service and engine), templates, search, dashboard, notifications, comments. |
| `src/server` | Service-role server code: booking, requesters, portal, sharing, onboarding, automations runner, snapshots and wipe, HTTP helpers. |
| `src/features` | Screens and hooks by area: boards, items, automations, booking, portal, dashboard, journey, undo, version, workspace (settings, guide), members, profile, trackers, mobile… |
| `src/lib`, `src/stores`, `src/hooks` | Config, routes, permissions, dates, rich text, realtime, query keys, changelog; Zustand stores; `useIsMobile`, clock hooks. |
| `supabase/migrations`, `supabase/policies` | Ordered SQL, applied in the order `supabase/sequence.txt` gives. |
| `supabase/optional` | SQL applied by hand only (the pg_cron automation driver). |
| `scripts` | Migration runner, seeds, top-up, special columns, snapshot rehearsal, ticket dedupe, account tools, e2e runners. |
| `tests/unit`, `tests/e2e` | Vitest suites (106 files after the audit) and Playwright specs (32). |
| `Test_prompts` | Audit prompts and reports. Evidence, not the executable harness. |

Imports beginning with `@/` resolve to `src/`. `tsconfig.json` includes every `.ts`/`.tsx` file, **tests included**, so a type error in a test also fails `next build`.

## 4. Architecture and request flow

```text
App Router page / layout
  -> feature screen, context, hooks, TanStack Query cache
  -> service (use case)                     src/services
  -> repository interface                   src/data/repositories
     -> Local: IndexedDB                    src/data/local
     -> Supabase: PostgREST / Auth / Realtime / Storage  src/data/supabase

Public payloads (board/task shares, portal, dashboard link)
  -> server route (service role) -> projection -> JSON
  -> read-only memory repositories -> the same board views and panels

Automations (Supabase)
  write (any client) -> Postgres trigger -> automation_events (queue)
  pg_cron / GitHub Actions / member nudge -> /api/automations/run -> AutomationEngine -> ordinary services
```

The composition root is `src/features/data/data-context.tsx`. `createServices()` (`src/services/index.ts`) wires the services in dependency order, sharing `NotificationService`, `ItemLinkService` and the automation engine. Booking reuses the normal item, asset, link and ticket services rather than a parallel task system.

### Provider selection

`createRepositories()` chooses local or Supabase persistence. Both expose the same `Repositories` contract. Switching providers selects another store; it copies nothing.

The memory implementation is a read-only adapter for public pages, not a third backend. It returns empty results outside its payload and rejects writes.

### Application providers

`src/app/providers.tsx` composes, in order: the QueryClient, local cross-tab sync, data, auth, tooltips, theme sync and toasts.

Query defaults:

| Setting | Value |
| --- | --- |
| `staleTime` | 30 s |
| `gcTime` | 5 min |
| `retry` | 1 |
| `refetchOnWindowFocus` | on (gated by `staleTime`) |

Feature hooks override these where they need to.

`AppShell` mounts one of two frames, never both:

- **Phone** (below 768 px): `MobileShell`, a top bar plus five destinations.
- **Desktop**: sidebar plus main.

Shared overlays sit above that branch: the command palette, the undo bar, confetti, `VersionWatcher` and `SaveBoardTemplateHost`.

### Boundaries to preserve

- **Services and repositories.** Normal task data goes through services and repositories. Pure mapping and aggregation stay out of components.
- **Permission helpers.** Use the shared helpers in `src/lib/permissions/permissions.ts`.
- **Services check no permissions.** On Supabase, RLS and the server routes are the only gates. On the local provider, only the UI is.
- **Deliberate direct paths:**
  - avatar and cover uploads go straight to Storage;
  - snapshots and wipe use a direct `postgres` connection;
  - some feature reads use `services.repos`.
- **Service role in server code.** `routeRepositoriesThrough()` points the Supabase repositories at the service-role client with a module-level override. It is server-only.

## 5. Configuration and local development

### Configuration behaviour

`src/lib/config.ts` is authoritative:

1. `NEXT_PUBLIC_DATA_PROVIDER` is trimmed and lowercased.
2. Exactly `local` means local.
3. Anything else means Supabase.
4. If the Supabase URL or anon key is missing, it logs a warning and falls back to local.

An unknown provider string therefore follows the Supabase branch. A running app is not proof that it uses the intended backend.

### Environment variables

| Variable | Scope and purpose |
| --- | --- |
| `NEXT_PUBLIC_DATA_PROVIDER` | `local` or `supabase` (default). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-visible project URL and public key; access is enforced by RLS. |
| `NEXT_PUBLIC_SUPABASE_REGION` | Optional label shown in About. |
| `SUPABASE_DB_URL` | Server/script-only Postgres URI (the session pooler for hosted projects). Used by migrations, seeds, snapshots, restore and wipe. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for onboarding, booking, requester lookup, portal, shares, the dashboard link, the automation runner and seeds. |
| `AUTOMATION_SECRET` (or `CRON_SECRET`) | The automation runner's secret. The runner checks `AUTOMATION_SECRET` first, so when both are set `CRON_SECRET` is ignored. With neither set, `/api/automations/run` answers 503 to runner calls. |
| `AUTOMATION_TIMEZONE` | The zone scheduled rules read the clock in (default `Australia/Melbourne`). Snapshot names default to `Asia/Ho_Chi_Minh` when it is unset. |
| `SKIP_DB_MIGRATE` | `1` bypasses the migration runner (`predev`/`prebuild`). |
| `NEXT_DIST_DIR` | Build folder override, so a second dev server can run beside another (`dev-preview` uses `.next-preview`). |
| `SEED_PASSWORD`, `ADMIN_PASSWORD`, `SEED_APP_URL`, `ADD_USER_PASSWORD` | Seed/account tooling. |
| `E2E_PROVIDER`, `PW_PROVIDER`, `E2E_BASE_URL`, `E2E_EMAIL`, `E2E_PASSWORD`, `CI` | Test selection and targets. |
| Build identity | `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, `BUILD_ID`, `VERCEL_ENV` are read; `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_BUILD_ID`, `NEXT_PUBLIC_BUILT_AT`, `NEXT_PUBLIC_DEPLOY_ENV` are set by `next.config.ts`. |

Never put privileged values in `NEXT_PUBLIC_*` variables. `.env.local` is gitignored.

**Fallback trap.** Scripts fill every *unset* variable from `.env.local`. If a hosted project's `.env.local` is present, any variable you forget to pass falls back to that project. Run disposable work from a separate checkout (§19).

### Local-only development on Windows

```powershell
npm ci
$env:NEXT_PUBLIC_DATA_PROVIDER = 'local'
$env:SKIP_DB_MIGRATE = '1'
npm run dev
```

The migration skip is explicit because `predev` (and `prebuild`) run the migration runner whenever `SUPABASE_DB_URL` is configured. Choosing the local provider does not disable that.

A second dev server beside your own needs its own build folder. `.claude/launch.json`'s `dev-preview` runs port 3200 with `NEXT_DIST_DIR=.next-preview`, local data and `SKIP_DB_MIGRATE=1`.

### First local session

Opening the local provider seeds IndexedDB when `meta.seededAt` is missing:

- the RMIT workspace, eight teams plus Admin, demo boards and their tasks;
- 2025 history, collaboration records, trackers;
- pending members Anh, Lucas and Mai, with fixed invitation tokens `demo-invite-<key>-2026`.

Sign in from the account tiles (`login-<first name>`). No password is needed locally. Pending and deactivated checks still apply. Local data belongs to one browser profile and origin, so ports 3000, 3100 and 3200 each have their own store.

## 6. Routes and server endpoints

Use `src/lib/routes.ts` for links. Slugs are distinct from ids.

### Page routes (27)

| Route | Purpose |
| --- | --- |
| `/` | Loading screen ("Checking your session…"), then the workspace or `/login`. |
| `/login` | Sign-in. Signed-in visitors see the loader, never the form (v0.45.2). `?next=` follows same-site paths only. |
| `/join/[token]` | Onboarding: preview, password (≥8), profile, photo. |
| `/book/[slug]/[key]` | Public booking wizard behind the workspace key. |
| `/book/[slug]` | The same wizard for a signed-in member. |
| `/portal/[token]` | The workspace portal. |
| `/portal/[token]/book` | Booking from the portal (opens in a new tab). |
| `/share/[token]`, `/share/item/[token]` | Read-only board / task share. |
| `/dashboard/[token]` | Public full-screen dashboard. |
| `/workspace/[slug]` | Home. |
| `/workspace/[slug]/boards/[boardSlug]` | Board and view (`?view=`, `?item=`). |
| `/workspace/[slug]/boards/[boardSlug]/archive` | Archived tasks (`?item=`). |
| `/workspace/[slug]/my-work`, `/inbox`, `/messages` (`?to=`) | Personal work, notifications, direct messages. |
| `/workspace/[slug]/dashboard` | The live dashboard. |
| `/workspace/[slug]/automations` | Workspace automations page. |
| `/workspace/[slug]/book` | Portal and Booking (admins); others are redirected to `/book/[slug]`. |
| `/workspace/[slug]/members`, `/people/[userId]`, `/teams/[teamId]` | People and teams. |
| `/workspace/[slug]/trackers`, `/trackers/[trackerId]` (`?sheet=`) | Trackers. |
| `/workspace/[slug]/settings` (`?section=`, `&guide=`) | Settings and the in-app guide. |
| `/workspace/[slug]/browse`, `/more` | Phone directory and phone "More". |

Portal parameters are `?for` (department id), `?range`, `?group=board|status|stakeholder`, `?view` and `?task`. `routes.board()` omits `view=table`.

### HTTP endpoints (29 route files)

Every handler awaits its promised `params`. `src/server/http.ts` wraps them:

- `HttpError` statuses are kept.
- Zod failures and malformed JSON become 400.
- Anything else is logged and returned as a generic 500.
- JSON carries `Cache-Control: no-store`.

| Endpoint | Methods | Access and behaviour |
| --- | --- | --- |
| `/api/version` | GET | Public. `{version, buildId, builtAt}` of the running server. |
| `/api/changelog?since=` | GET | Public. Entries newer than `since` (or the latest one). |
| `/api/invitations`, `/cancel`, `/regenerate`, `/reinitiate` | POST | Active workspace admin. Add a pending member; cancel; renew; start onboarding again (not for yourself). |
| `/api/join/[token]` | GET, POST | Invitation token. Preview, then complete (password via the Auth Admin API). |
| `/api/book/[slug]` | GET, POST (201) | Booking key, or an active member's session. A wrong key is 403 even with a session; no key and no session is 401; an unknown slug is 404. |
| `/api/book/[slug]/requester` | POST | Same gate. `{email}` → `{name}` for a person the workspace has; exact email match. |
| `/api/share/[token]`, `/api/share/item/[token]` | GET, POST | Share token (+ password). GET reports the gate; POST returns the payload. Member-only links need the caller's bearer. |
| `/api/dashboard/[token]` | GET, POST | Dashboard token (+ password). Trimmed snapshot. |
| `/api/portal/[token]` | GET | Portal gate. |
| `/api/portal/[token]/board`, `/tasks`, `/tasks/[itemId]`, `/tasks/[itemId]/journey`, `/requester` | POST | Portal grant (token, switch, credential version, password). |
| `/api/portal/[token]/book` | PUT, POST | PUT reads the form behind the gate; POST books, idempotent on a submission key. `departmentId` may be null (resolved by name, v0.49.1). |
| `/api/portal/[token]/comments`, `/assets` | POST | Portal grant plus a signed-in, active member with an OWNER/EDITOR seat on the task's board. No UI calls them yet. |
| `/api/automations/run` | GET, POST | Runner secret (Bearer or `x-automation-secret`): full tick. Otherwise any valid Supabase session: drain only (≤50 events, no sweep, no schedules, no heartbeat). 503 when no secret is configured and no session is given. |
| `/api/automations/run-now` | POST | Member session with edit rights on the board. Fires a quick run on up to 50 tasks. |
| `/api/snapshots` | GET, POST | Admin/owner. List; take (name ≤120). |
| `/api/snapshots/[id]` | DELETE | Admin/owner. |
| `/api/snapshots/[id]/download` | GET | Admin/owner. `application/gzip` file. |
| `/api/snapshots/[id]/restore` | POST | Admin/owner. `{workspaceId, confirm:"RESTORE"}`. |
| `/api/snapshots/upload` | POST | Admin/owner. Raw body ≤4 MiB, `.json.gz` or `.json`. |
| `/api/snapshots/wipe-boards` | POST | Admin/owner. `{workspaceId, password, resetTickets}`. |

## 7. Domain and persistence

### Principal entities

| Domain | Records |
| --- | --- |
| Identity | Profile (`profiles.id` = `auth.users.id`), session, workspace membership (ACTIVE/INVITED/DEACTIVATED), invitation. |
| Organisation | Workspace (ticket prefix/counter, booking form + draft + published name, output rates, creative team name), team, team membership. |
| Board | Board, membership, favourite, visit (with view settings), group, column (role, hidden, hiddenInPanel, removed), share, template. |
| Task | Item (ticket, cover, `booking_brief`), typed value, link (exclusions, hand-made pairs), asset line, read marker. |
| Collaboration | Comment (parent for replies, shared id), reaction, activity, notification, preferences, direct message. |
| Booking and portal | Published form and draft, named templates, saved blocks; departments (durable ids); the portal link; request provenance; submission claims. |
| Automations | Rule, event (queue), run (log), mark (depth), schedule receipt, heartbeat. |
| Operations | Snapshot (`workspace_snapshots`, a gzipped JSON `bytea`). |
| Tracker | Tracker, ordered sheet (columns, rows, frozen count). |

Domain types are camelCase and SQL is snake_case; `src/data/supabase/rows.ts` converts between them. JSON columns keep their application shapes: column settings, typed values, rule JSON, tracker documents.

### Repository contracts (25)

`Repositories` (`src/data/repositories/index.ts`) exposes:

| Area | Repositories |
| --- | --- |
| Identity and organisation | `users`, `workspaces`, `onboarding`, `teams` |
| Boards and tasks | `boards`, `items`, `links`, `itemAssets`, `itemReads` |
| Trackers and collaboration | `trackers`, `comments`, `messages`, `activities`, `notifications`, `notificationPreferences` |
| Lists, portal and booking | `workspaceLists`, `stakeholderPortals`, `bookingTemplates`, `bookingSavedBlocks` |
| Templates and sharing | `boardTemplates`, `boardShares`, `itemShares`, `dashboardShares` |
| Automations and admin | `automations`, `admin` |

The Supabase provider keeps comments, activities, notifications, preferences and admin together in `misc-repositories.ts`. A contract change touches:

- the local and Supabase implementations;
- the memory adapter;
- service composition;
- test fixtures.

### Local database

IndexedDB `rmit-streamline`, **`DB_VERSION` 17**. Each version added:

| Version | Added |
| --- | --- |
| 2 | Links |
| 3 | Trackers |
| 4 | Messages |
| 5 | Notification preferences |
| 6 | Onboarding and credentials |
| 7 | Read markers |
| 8 | Assets |
| 9 | Booking templates |
| 10 | Board shares |
| 11 | Dashboard shares |
| 12 | Workspace lists |
| 13 | Item shares |
| 14 | Four portal stores |
| 15 | Saved blocks |
| 16 | Automation stores: `automationRules`, `automationEvents`, `automationRuns`, `automationMarks`, `automationScheduleFires`; the heartbeat lives in `meta` |
| 17 | `boardTemplates` |

Tickets, column roles, hidden-in-panel, link pairs and reactions are plain fields on existing stores; reactions live on the comment record. Upgrade callbacks log when another open tab blocks them.

### Supabase database

- **Size.** 44 public tables.
- **Build order.** Always build from `supabase/sequence.txt` order (§17), never from `0001` alone.
- **Triggers that matter:**

| Trigger | What it enforces |
| --- | --- |
| `enforce_value_same_board` | A value belongs to its item's board. `item_column_values.board_id` is denormalised and indexed (0036). |
| `workspace_keeps_an_owner` (0043) | A deferred constraint: every workspace keeps one active OWNER. |
| `enforce_listed_department` (0074) | A STAKEHOLDER value must name an ACTIVE department. Values that don't change pass. Workspaces with no departments are skipped. |
| `automation_capture_*` (0052–0057) | Items, values and comments raise queue rows, but only when an enabled rule on the board listens. |
| `comments_set_updated_at` | Keeps `updated_at` current. |
| `rewrite_ticket_prefix`, `next_ticket_numbers` | SQL functions for the ticket counter and prefix changes. |

- **Snapshot restore** runs with `session_replication_role = replica`, which bypasses all of these triggers.
- **Response handling.** `src/data/supabase/client.ts` normalises PostgREST responses (`unwrap`, `unwrapList`, `unwrapMaybe`, `assertOk`).
  - Long id lists are chunked (`ID_CHUNK = 200`).
  - `unwrapAll()` pages past PostgREST's row limit.
  - Workspace-wide reads query by `workspace_id` or `board_id`. They must never build `or(in…)` URLs over many ids, because Node's fetch rejects headers over ~16 KB.

### Export, import and reset

- **Local mode.** `exportAll()`, `importAll()` and `resetToSeed()` still exist, but only **Reset demo data** has a control (the user menu). The Settings → Storage section that held Export and Import was removed in v0.47.3.
- **Supabase.** The admin repository refuses reset, export and import. Supabase uses Snapshots (§17) instead.
- **Tracker files.** Tracker `.xlsx` interchange is separate from all of these.

## 8. Authentication and onboarding

### Local authentication

`LocalAuthProvider` keeps its session in localStorage under `streamline.local-session`.

- It refuses missing and deactivated users, and anyone whose membership is pending.
- A password is checked only if local onboarding stored one.
- Storage events keep tabs in step.

It is a development convenience, not production authentication.

### Supabase authentication

`SupabaseAuthProvider` uses `signInWithPassword`, session retrieval, sign-out and auth-state events. Messages are normalised by `src/lib/auth/auth-messages.ts`. Workspace access additionally depends on membership and RLS.

Deactivation (audit F-001, 9 September) takes the active role away before ownership or explicit seats can grant anything. Policies 0014/0015 enforce this.

### Invitation lifecycle

1. An admin adds a person (Members → Add member). On Supabase, the server verifies the admin's session and creates:
   - an Auth account with no password;
   - an INVITED membership;
   - a 30-day invitation token.
2. The admin passes on the `/join/<token>` link. No email is sent.
3. The join page previews the invitation, sets the password (at least 8 characters) through the Auth Admin API, saves the profile, and activates the membership.

| Invitation state | Meaning |
| --- | --- |
| PENDING | Open and usable. |
| ACCEPTED | Onboarding is complete. |
| EXPIRED | The exact 30-day timestamp has passed. |
| REVOKED | The invitation was cancelled. |
| INVALID | The token is not recognised. |

- **Regenerate** replaces the credential; the old link stops working.
- **Reinitiate** is for someone already onboarded; you cannot reinitiate yourself.
- **Cancel** can remove membership and account state. Read `src/server/onboarding.ts` before treating it as "hide the link".

**Pending members from bookings (v0.48).** A public booking whose email the workspace does not know creates a pending member through the same `inviteMember` path. An admin can later pass that person a join link.

**People lists.**

- Pending and deactivated people stay resolvable for history.
- `activeUsers` feeds pickers, mentions and messages.
- Requester cells and hover cards show pending people too.

## 9. Authorization

### Workspace and team roles

| Kind | Values |
| --- | --- |
| Workspace roles | OWNER, ADMIN, MEMBER, GUEST |
| Membership states | ACTIVE, INVITED, DEACTIVATED |
| Team roles | LEAD, MEMBER |
| Board roles | OWNER, EDITOR, VIEWER |

`buildPermissionContext()` resolves the active role, team ids, explicit board roles and the user.

- OWNER and ADMIN are workspace administrators with the same powers inside a workspace. This is deliberate; the two diverge only when multi-workspace arrives.
- Non-guest active members can create boards and teams and edit trackers.

### Effective board role: exact precedence

`boardRoleFor()`, mirrored by `private.board_role_for()` (policy 0015):

1. System board and not an administrator → no access.
2. No active workspace role → no access (ownership and seats included).
3. Literal board owner → OWNER.
4. Explicit board membership → its role.
5. Workspace administrator → EDITOR.
6. WORKSPACE visibility → VIEWER for non-guests; guests get nothing inherited.
7. TEAM visibility → EDITOR for a member of the board's team; otherwise nothing.
8. PRIVATE → nothing inherited.

- **Edit and manage.** `canEditBoard()` needs OWNER or EDITOR. `canManageBoard()` allows OWNER or a workspace administrator.
- **Delete.** `canDeleteBoard()` needs literal ownership or administration, plus an active role. `BoardService` separately protects system boards.
- **Precedence surprises.** An explicit VIEWER beats a later inherited EDITOR. Team membership adds no editing on a WORKSPACE-visible board.

### Feature permissions (UI / service / database)

| Action | Who | Where it is enforced |
| --- | --- | --- |
| Create, edit, delete or toggle automation rules and quick runs | Board OWNER or workspace admin (`canManageBoard`) | UI + RLS 0017 |
| Run a quick run | Board editor (`canEditBoard`) | Server `run-now`. The Run button is shown to viewers, who get a 403 (F-172). |
| Read rules, runs, pending events | Anyone who can view the board | RLS 0017/0018 |
| Save a template | Any member (RLS 0019 allows guests too) | UI + RLS |
| Delete / overwrite a template | Its creator or an admin | UI + RLS 0019 |
| Snapshots, restore, wipe | Active OWNER/ADMIN (`requireSnapshotAdmin`). Wipe also needs the admin's password | Server only. Settings shows the Data group only on Supabase, to admins |
| Ticket prefix | Workspace admin | UI + RLS (`workspaces_update`) + RPC check |
| Allocate from Task Allocation | Admins (system board gate). Target boards offered by *view* rights (F-160) | UI + RLS |
| Portal and form editor | Admins | UI + RLS 0013 |
| Comment | Board editors (`comments_insert` = `can_edit_item`) | UI + RLS |
| Edit a comment | Its author | UI + RLS. The policy doesn't pin `item_id`; see F-104 and the proposed 0079/0020 |
| Delete a comment | Its author or an admin | UI + RLS |
| React | UI: board editors. RLS 0070: anyone who can view the task ("viewers included") | Both |
| Edit trackers | Active non-guests | UI + RLS |

### View as

An administrator can preview a colleague's visibility (`streamline.view-as` in sessionStorage). Displayed permissions change; the signed-in actor and writes do not. It is not a Supabase sign-in as that person.

### RLS and privileged endpoints

Browser operations run as the signed-in user. Service-role routes enforce their own token and role checks, and scope their own output. Keep `permissions.ts` and the SQL helpers aligned, and read the policies in sequence order.

## 10. Boards, columns, and views

### Board lifecycle

`BoardService` covers the board's whole life:

| Operation | Behaviour |
| --- | --- |
| Create | Unique slug. The creator becomes OWNER. Logs `BOARD_CREATED`. Ends with `ensureSpecialColumns`. |
| Update | A blank name is refused. A rename changes the slug and replaces the URL. System boards refuse team and visibility changes. |
| Archive / restore | Archive toasts with an undo. |
| Delete | You must type the board's name. |
| Duplicate | Creates "{name} (copy)". Copies groups, columns (including removed ones), live items and values, remapping dependencies. Does **not** copy rules, asset lines, covers, tickets, the booking brief, roles or hidden-in-panel. |
| Other | Favourites, members, groups, columns. |

**Board menu** (`board-menu.tsx`), top to bottom:

1. Open; Open as Kanban; **View archived items**; Add to / Remove from favourites.
2. Board settings; Automations; Manage members; Share by link…
3. Rename; Colour & icon; Move to team; Duplicate; **Save as template…**; Mute / Resume notifications.
4. Archive / Restore; Delete.

The built-in Admin team and Task Allocation board are recognised by `system`, not by name. `ensureSystemEntities()` repairs them on admin load.

### Column types (25)

Sources:

- `src/domain/board/column.ts`: types, labels, widths, defaults, purpose text;
- `src/domain/item/item.ts`: value shapes;
- `cells/cell-renderer.tsx`: cells;
- `board-filtering.ts`: sort keys.

| Type | Picker label | Stored value | Special | Notes |
| --- | --- | --- | --- | --- |
| TEXT | Text | `{text}` | — | Enter/blur saves, Esc cancels. |
| LONG_TEXT | Long text | `{text}` | — | http(s) links are live. |
| RICH_TEXT | Rich text | `{type:"RICH_TEXT",text}` (Markdown subset) | — | H1/H2, bold, italic, underline, lists, links (`safeHref`), `---`, up to 3 indents. Pop-up with Copy and **Download as Word**. |
| BRIEF | Brief | stored as RICH_TEXT | yes | The booking's brief. Compact (just "Brief") under 160 px. Filled from `items.booking_brief` when added. |
| STATUS | Status | `{labelId}` | yes | Labels with done/stuck/progress roles. Stuck labels striped; the chip is tinted by deliverable progress. |
| DROPDOWN | Dropdown | `{labelId}` | — | Labels without meanings. Kanban lanes and chart dimensions. |
| PERSON | **PIC** | `{userIds}` | yes | The person in charge. Feeds workload, My Work and the person filter. |
| REQUESTER | Requester | `{type:"REQUESTER",userIds}` (one) | yes | Filled by bookings. Pending people shown with a hover card. |
| PEOPLE | People | `{userIds}` | — | People with no bearing on the work. Never in workload or My Work. |
| DATE | **Due date** | `{date}` | yes | The deadline. Overdue (red) only when not done. No Format menu. |
| TIMELINE | Timeline | `{start,end}` | yes | Gantt and Timeline placement. |
| NUMBER | Number | `{number}` | — | Shows the unit if set. Zero is a value. There is no UI for unit or decimals. |
| PLAIN_DATE | **Date** | `{date}` | — | A day with no deadline meaning. Format: short "Sep 16", medium "16 Sep 2026", numeric "16/09/2026", iso. |
| TIME | Time | `{time:"HH:MM"}` | — | 24h "19:06" or 12h "7:06 PM". |
| DATETIME | Date + Time | `{at:ISO}` | — | Compact "Sep 16, 19:06". Picking a day keeps the time (default 09:00). Shown in the viewer's zone. |
| COUNTDOWN | Countdown | `{at:ISO}` | — | Time left to a moment, redrawn every 15 s. Typed as `45m`, `3d 4h`, `2mo`, `in 45m` (v0.49.1); "m" is minutes, "mo" months. Quick picks 15m/1h/1d/1w/1mo. Format: style, units, what it says when time is up, when it turns amber. |
| PRIORITY | Priority | `{labelId}` | yes | Four fixed steps (critical/high/medium/low) on every board. |
| CHECKBOX | Checkbox | `{checked}` | — | Unchecked counts as empty. |
| LINK | Link | `{url,text}` | — | The icon opens only http(s)/mailto, with a bare domain read as https (v0.49.1). Clicking the cell edits it. |
| TAGS | Tags | `{tags}` (names) | — | Palette on the column; a rename remaps values. |
| STAKEHOLDER | **Department** | `{group}` | yes | Only listed ACTIVE departments (UI; trigger 0074 on Supabase). |
| SIZE | Size | `{size}` XS–XL | yes | T-shirt sizing. |
| ASSETS_RECAP | Assets recap | cached recap | yes | Read-only. Computed from live lines, shared ones included. Click opens Assets. |
| BOOKED_AT | **Booking time** | nothing stored; reads `item.createdAt` | system (Task Allocation only) | Never editable. `addColumn` refuses it elsewhere; Duplicate and templates can still carry it (F-134). |
| DEPENDENCY | Dependency | `{itemIds}` | — | Same-board, top-level tasks. "Blocked" while any is not done. Never synced. |

`emptyValueFor()` and `isEmptyValue()` define emptiness. Zero is a value; an unchecked box is empty. Check with these helpers, not with truthiness.

### Special columns

- **`SYSTEM_COLUMN_TYPES`** — STATUS, PERSON, REQUESTER, DATE, TIMELINE, PRIORITY, STAKEHOLDER, SIZE, ASSETS_RECAP, BRIEF, BOOKED_AT.
  - **`SPECIAL_BOARD_COLUMN_TYPES`** is the same list minus BOOKED_AT.
  - **`ONE_PER_BOARD_COLUMN_TYPES`** is all of them.
- **Every board holds one of each.**
  - `BoardService.ensureSpecialColumns` adds missing ones to new boards. It names each after its type label, or "{Label} (special)" if that name is taken.
  - `npm run db:special-columns [-- --dry]` backfills existing boards.
  - It is not called by `duplicateBoard` or for Task Allocation's creation.
- **Deleting a special column only removes it from the board.**
  - It sets `board_columns.removed` (0075) and asks "Remove “X” from the board? Nothing is lost. Add it back any time and its values return."
  - Re-adding the type restores the same column id and its values. The optimistic update appends it, then it jumps back to its old place (F-144).
  - Plain columns are deleted with their values after a confirmation. Board settings → Columns deletes them *without* one (F-133).
- **Removed columns are hidden** from the board model, views, filters, sort, the task panel, the Hide menu, board settings, automation pickers, board and task shares, and templates saved without the layout part.
- **Removed columns are still read** by the dashboard, the portal, My Work (removed PIC columns), booking and allocation mapping, link sync, and the default status on create.
- **The column type picker** has two groups:
  - "This board's own, as many as you like" (green-free);
  - "One each, read by the dashboard and portal" (green icons).
  - A type the board already has shows "Already added. Click to move “{name}” here."; a removed one shows "Removed from this board. Click to put it back."
- **Only roles are unique in the database.** Special types are unique per board by convention. Two tabs adding the same type at once can duplicate it (F-145).

### Column roles

`board_columns.role` (0048) gives 13 known roles, one holder per role per board (unique index). `setColumnRole` releases the previous holder first.

`resolveColumnRoles()` is the only way to find a board's status, due date, requester and so on:

1. an explicit role;
2. otherwise the first column of the implied type;
3. otherwise a hinted type whose name matches (requester: "requester, requested by, stakeholder, client, booked by"; department: "department, school, faculty…").

"Used as" lives only in the column header's chevron menu. "Nothing in particular" can't clear a role the type implies, because the guess picks it again (F-138).

### Formats and layout

- **Format menu.** In the header and right-click menus: Date (PLAIN_DATE, DATETIME, BOOKED_AT), Time (TIME, DATETIME, BOOKED_AT), Countdown (style, units, ending, amber). It applies to the whole column.
- **Column widths.** Drag 80–600 px, saved on release.
- **Item column.** Drag 320–800 px; double-click resets. Stored per browser per board in `streamline.ui.itemColumnWidths`. Not resizable on the phone grid.
- **Hidden columns.**
  - `hidden` works board-wide (header menu, toolbar Hide, "+" menu → Hidden columns).
  - `hiddenInPanel` (0044) is independent. It is set from a panel row's menu: On the board / On this panel / Both. The panel menu offers restore items.
  - The Ticket slot (92 px) is a per-person view setting (`toggle-ticket-column`).
- **Name cell.**
  - The name uses the whole cell at rest; row actions take room only on hover or focus.
  - A clipped name fades rather than ending in "…", and shows its full text in a tooltip.
  - Renaming spans the cell, and nothing drags while you rename (items, columns, groups).
  - Done tasks are muted, not struck through.
- **Folded group.** One summary row (`group-summary`):
  - label bars for Status/Dropdown/Priority;
  - avatars for people columns;
  - a date span and "N late" for Due date; a span for Timeline;
  - the sum for Number; ticked x/y for Checkbox; the top tags; sizes; departments;
  - "filled" for text types.
  - Date/time types, Countdown, Assets recap, Booking time and Dependency get blank summaries.
  - An editor's fold is stored for everyone; a reader's lasts the visit.
- **Alignment.** Long text, rich text, Brief and Dependency are left-aligned; everything else is centred.

### Board templates (v0.47)

- **Storage:** `board_templates` (0077), unique on (workspace, lower(trim(name))). Policy 0019: members read and insert as themselves; the creator or an admin updates or deletes. The local store is `boardTemplates` (v17), with no name uniqueness.
- **Spec** (`src/domain/board/board-template.ts`, version 1):
  - Columns, with name, type and role, always travel.
  - Optional `TEMPLATE_PARTS`: groups, columnSettings, layout (widths, hidden, hiddenInPanel, removed), automations, tasks (names and subitems only — never values or tickets), look (colour, icon, description).
  - `normaliseTemplateParts` drops automations unless groups and columnSettings are both chosen.
  - Groups and columns keep their source ids as `key`; `remapTemplateIds` rewrites every UUID in the rules through the new board's id map.
- **`BoardTemplateService.createBoard`** runs in this order:
  1. groups (or one "Group 1") and columns;
  2. special columns;
  3. **tasks**;
  4. **automations** — last since v0.49.1, so a template's own tasks do not wake its creation rules.

  Rules arrive enabled, as saved, and are not re-validated.
- **Names:** trimmed, required, ≤80 characters. A case-insensitive match saves over the existing template.
- **UI:**
  - One `SaveBoardTemplateHost` lives in the app shell, opened with `useSaveTemplateDialog.show(boardId)` from the board menu or from Create board ("Save a board as a template…").
  - Create board's template dropdown: "Built in" (Blank only) and "Saved". A delete button appears for the creator or an admin.
  - Picking a saved template also picks its colour and icon.

### Task Allocation

The admin-only intake board:

- Red, inbox icon, TEAM visibility in the Admin team.
- Groups: Incoming, Allocated, Closed.
- Columns (`taskAllocationColumns`): Requester (REQUESTER), Email, Department (STAKEHOLDER), Service and Asset type (TAGS), Brief (BRIEF), Assets & specs, Status, Priority, Due Date, Reference (LINK), Assets recap, **Booking time** (BOOKED_AT), PIC, Timeline, Size.

v0.47.4 dropped Requester department, Requested team and Allocated to. The top-up (`workspace-service.ts`) restores only special types, and doesn't delete old columns on existing boards.

### Seven views

| View | Main use | Reads |
| --- | --- | --- |
| Main Table | Grouped rows, subitems, typed editing, bulk actions | Every visible column |
| Kanban | Lanes and cards | Lanes by Status, Priority, PIC (first PIC column), Group or any Dropdown. Person lanes include pending and deactivated owners (v0.49.1). |
| Timeline | Spans on a date axis | Timeline role, else Due date |
| Calendar | Month/week | Timeline, else Due date |
| Gantt | Hierarchy, dependencies, milestones | Timeline / Due date, Dependency |
| Workload | Per person per week | PIC only |
| Chart | Counts, sums, asset units | Status, priority, group, person, tags, size, due week, each Dropdown; measures items / number sums / asset units |

**View choice** is resolved in this order:

1. `?view=`;
2. localStorage `streamline.board-view` (`{user}:{board}`);
3. the board visit.

**Per-view settings** live in `streamline.view-settings` (`{user}:{board}:{view}`) and sync to the server after 600 ms.

Search, filter, sort and Hide sit on the table toolbar, but filters apply to every view.

### Filtering and sorting

- **Board UI state** (Zustand, transient): search, person/status/priority/group/tag/date filters, sort, selection, expanded items, Kanban lane.
- **How filters combine.** Filter dimensions AND together. Person and tag filters match any of the chosen values.
- **What they read.**
  - The person filter reads PIC columns only.
  - Status and priority come from the resolved role columns.
  - Date buckets use `primaryDueDate`: the Due-date role, falling back to the Timeline end.
  - "This week" includes today.
- **Search** (`matchesSearch`) matches name and ticket. The board's box does not fold accents; the palette does (F-129).
- **Sorting** uses typed keys:
  - labels by the board's label order; people by display name;
  - rich text by its plain text; date/time types by epoch; SIZE XS→XL; recap by quantity; dependency by count; Booking time by `createdAt`;
  - empty cells last from the header. The toolbar's descending Priority/Status sort puts them first (F-131).

### Large tables and the archive

- `GroupRows` virtualises groups with more than 25 rows and renders them in full while you drag.
- The archive has its own route, not an eighth view.
  - `loadArchivePage()` pages 10/25/50 (default 50), newest-archived first or by name, with an exact filtered count.
  - Group, person, status, priority and tag filters run over the whole archive.
  - Search is a plain substring on name and ticket, so "cp14" does not find CP_014 here (F-129).
  - Editors can restore or delete permanently.
- **Linked items.** Archiving selected linked items offers `cascade` (archive direct counterparts too) or `break` (unlink first). The panel's "Archive task" skips that question (F-149).

## 11. Items, tickets, links, and assets

### Item identity and lifecycle

An item has an id, board, group, optional parent, name, description, position, creator, timestamps, archive marker, optional cover, optional ticket and, for bookings, `booking_brief`.

- **Operations.** `ItemService` does create, rename, move, archive/restore, delete, duplicate and value writes.
- **Board snapshots.** `loadBoardSnapshot()` reads the board, groups, columns, items, values and links. Comments and assets have their own queries.

### Tickets (v0.20 → v0.46)

- **Format.**
  - `PREFIX_NNN`: the prefix matches `^[A-Z0-9]{1,8}$` and defaults to `CP`.
  - Numbers have at least 3 digits and never truncate (CP_1000).
  - `TICKET_MAX` 18 characters; stored shape `^([A-Z0-9]{1,8})_(\d{1,9})$`; the number is ≥ 1.
- **Issuing.**
  - `next_ticket_numbers(workspace, count)` bumps `workspaces.ticket_counter` in one statement under a row lock. The local provider does the same inside one transaction.
  - A number that is taken is spent even if the write then fails. Gaps are by design.
  - Bookings take a ticket before the task is written. "Add a ticket" in the panel takes the next one.
  - Duplicates, template tasks and duplicated boards get none.
- **Typing a ticket.**
  - Double-clicking the panel chip opens the input.
  - Spaces and dashes become "_", so "cp-14" is accepted and becomes CP_014. "cp14" is refused.
  - `TicketService.setTicket` refuses a code held by any other task in the workspace, except across links that carry the ticket.
  - **Only `setTicket` checks uniqueness** (F-123), and there is no unique index.
- **Links.** Writing a ticket propagates it along ticket-carrying links. Linking takes the seed side's ticket. Unlinking renumbers nothing (F-124).
- **Prefix change** (Settings → Tickets, admins):
  - "Rewrite N" or "Use for new tickets".
  - The rewrite is one statement, `rewrite_ticket_prefix`. On Supabase it truncates numbers above 999 (F-107; fix proposed as 0081).
- **Counter resets.** A wipe can restart the series at `001` (`resetTickets`); a restore brings the counter back with everything else.
- **`npm run tickets:dedupe [-- --apply]`** renumbers shared tickets outside link chains. It groups across workspaces (F-125).
- **Display.**
  - The ticket slot sits in front of the name; click it to copy.
  - It also shows on mobile cards, palette results, the journey header and the portal.

### The task panel

- **Header** (`panel-header`), top to bottom:
  1. cover;
  2. breadcrumb (board, or Archived, then group and parent) with the icon row: journey, share (managers), menu, close;
  3. the name;
  4. the facts line: ticket, archived/shared badges, creator · time;
  5. the assets recap strip.
- **Widths.** Compact 300 / default 520 / wide 880. Drag the edge (snaps), double-click to reset, or use the arrow keys. Stored in `streamline.ui.itemPanelSize`.
- **Panes.**
  - Wide view and pop-up: Overview/Updates on the left (opening on Updates), Assets/Activity on the right.
  - Single pane: Overview, Updates, Assets, Activity.
- **Overview.** Description, "Columns" (every shown column as a draggable row with its own menu: Insert, Hide on board / in panel / both, Remove), Allocation, Linked items, Subitems.
- **Pop-up mode.**
  - "Open in pop-up" (row menu, panel menu) opens the task over the board, up to 1160 × 1040 px.
  - The mode lives in the board UI store. Only one task is open at a time.
  - Below 1024 px it falls back to the full-screen panel.
  - The pop-up body isn't wrapped in `PanelSizeProvider` (F-148).
- **Opening.** The panel is answered on the click and revealed once its comments, assets, links and share state have all loaded.
  - `?item=` deep-links to a task.
  - An archived task redirects to its board's archive.
  - Escape closes the panel unless focus is in a field or a menu.

### Task journey (v0.34 → v0.47.5)

- **Opening.** The panel's icon (`open-task-journey`) opens the `task-journey` dialog.
- **Contents:**
  - the header: ticket, name, "Booked through the portal by X for Dept", and the total time;
  - **Time in each status**, as one bar, longest segment first, with the current status striped. Segments of 16% or more carry their label; thinner ones point to it;
  - the timeline of steps, with "X later" gaps.
- **How it's built** (`src/features/journey/journey.ts`), from activities only:
  - Booked or created.
  - Allocated: the first move away from the queue.
  - Moves, stages and statuses. "Done" comes from the board's done labels.
  - Deliverables:
    - lines added within 2 minutes of creation arrive with the task;
    - adds within 10 minutes merge into one step;
    - completions in a row within 10 minutes become one step, counted against the booking's lines ("5 of 8 delivered").
  - Archived, restored.
- **Portal.** `/api/portal/[token]/tasks/[itemId]/journey` returns 9 event types with whitelisted metadata, `requesterName` among it (F-153).
- **Limits.** Activity is read unpaged, newest first, so a very long history loses its oldest rows on Supabase (F-151).

### Undo (v0.26)

One app-wide offer (`src/stores/undo-store.ts`, `UndoBar`).

| Action | Undo does |
| --- | --- |
| Rename | Rename back |
| Add | **Hard delete** |
| Move to a group, one or many | Move back |
| Archive | Restore |
| Duplicate | Delete the copy |

- **Not offered for:** cell edits (since v0.37.2), delete, drag moves, descriptions, tickets, covers, columns, groups, links, assets, comments, allocation.
- **Lifetime.**
  - A new offer replaces the old one.
  - Any board mutation clears it; so does a path change (query changes don't).
  - Deliverable, comment, link and allocation actions do **not** clear it. Undoing "Added X" after adding deliverables deletes those too (F-116).

### Item linking

- **What it is.** A link joins items on different boards of one workspace. The endpoints are stored as a sorted pair.
- **Refused links:**
  - self, or a task's own subitem;
  - the same board, or another workspace;
  - Task Allocation;
  - an existing link;
  - a chain that would hold two items from one board.
- **What syncs** (`src/services/item-link-sync.ts`, `mapColumns`):
  - Excluded first: DEPENDENCY, ASSETS_RECAP and BOOKED_AT.
  - Then pairs are made, in order:
    1. hand-made pairs (`item_links.pairs`, 0045);
    2. special types, when each side has exactly one — Status, PIC, Requester, Due date, Timeline, Priority, Department, Size, Brief — hidden and removed columns included;
    3. same name with a compatible type (the text family TEXT/LONG_TEXT/RICH_TEXT/BRIEF counts as compatible);
    4. a lone Status/Priority/PIC/Date/Timeline on each side.
- **How values translate.**
  - Labels translate by name; a missing label is skipped.
  - Single-person targets keep the first person.
  - Rich text is flattened into plain columns.
- **Exclusions** (`item_links.excluded`): `name`, `description`, `ticket`, `updates`, column ids. The "Choose what syncs" dialog sets them; assets are always shared.
- **Propagation** walks links breadth-first and stops at a link that excludes the field.
- **Updates.** "Post to linked task(s)", on by default, copies an update across the chain with a shared id. Replies stay on their own task.
- **Deliverables are shared across links.** A line lives on the task it was added to and shows on every linked task. `ItemAssetService.loadBoard()` returns `lines` (stored here, for totals) and `byItem` (shown, links included).

### Assets (deliverables)

- **Shape.** An `ItemAsset` has name, asset type, quantity (null counts as 1), several assignees, due date, completion, notes (the spec), `previewUrl`, `artworkUrl` (internal) and position.
- **Changes.** Each change logs `ASSET_*` activity and recomputes the cached recap of every task sharing the line.
- **Recap strip.**
  - Folded: "X of Y items done" with the bar across the line.
  - Expanded: quantity, overdue, next due, faces, types.
  - Progress counts lines, not units.
- **Booking deliverables** are one-line rows: name ≤160, type, quantity 1–9999, spec ≤500. A booking holds at most 50.
- **Portal and dashboard** projections drop notes and links.

### Covers and avatars

| Media | Processing | Supabase | Local |
| --- | --- | --- | --- |
| Cover | ≤3 MiB source → WebP q0.85, ≤1600 px | public bucket `item-covers`, `<itemId>/cover.webp` | data URL |
| Avatar | ≤10 MiB → square WebP q0.82, ≤256 px | public bucket `avatars`, `<userId>/avatar.webp` | data URL |

Public bucket URLs don't inherit a private board's visibility.

## 12. Booking and allocation

### Ways in

One `BookingWizard` serves three routes:

- `/book/<slug>/<key>` — public, behind the workspace key;
- `/book/<slug>` — signed-in members;
- `/portal/<token>/book` — through the portal gate.

`/workspace/<slug>/book` is the admins' Portal and Booking page; other members are redirected to `/book/<slug>`.

How the server decides (`src/server/booking.ts`):

| Request | Result |
| --- | --- |
| Unknown slug | 404 |
| Wrong key, even with a session | 403 |
| No key and no session | 401 |
| A session that isn't an ACTIVE member | 403 |
| A valid key plus an active member's session | Records that member as the booker |

The local provider checks the key only when one is passed.

### The four steps

Details → Brief → Deliverables → Confirm. Deliverables is dropped when `assets.enabled` is false.

- **Progress bar** (`booking-progress`) reads "Step i of n". You can jump only to steps already reached.
- **Details:**
  - requester name, email and department (all required);
  - title (required);
  - needed by (UI minimum today; the schema accepts past dates);
  - priority;
  - the **service** (Brand/Design/Production by default) and its sub-services (at least one when offered).
  - The routing note says where it goes: "our allocation queue", "straight to {team}", or "marked for {team}".
- **Department** is a select over the ACTIVE departments only, tinted with the department's colour. It shows "No departments set up yet" when there are none.
- **Identity:**
  - signed-in visitors see an account card (`booking-known-requester`) with "Booking for someone else?";
  - typing over the account offers "Fill these in from my account";
  - a visitor this browser remembers sees "Filled in from what this browser remembers";
  - otherwise the form offers sign-in.
- **Email check and name fill** (v0.48.1/v0.49):
  - After a 350 ms debounce the wizard asks who the email is. A spinner shows while it checks.
  - It then says "Used before. Name filled in." or "Used before as {name}. Use this name".
  - The name is replaced only if it hasn't changed since the email last did.
  - It runs signed in too, whenever the details aren't exactly the account's.
- **Brief:**
  - the chosen service's questions only;
  - single-choice follow-ups one level deep (≤12 per option, numbered 4a, 4b);
  - chips or a dropdown;
  - only visible blocks are validated.
- **Deliverables:** rows, type picker (types already named are shown fixed), skip, reference link.
- **Confirm:** re-validates every step. The receipt shows the **ticket** (issued by the server), the task, where it went, and "Book another task".

### Browser memory

`booking-remember.ts` keeps, in localStorage `streamline.booking` (scoped `book:<slug>` or `portal:<token>`, never used while signed in):

- the requester;
- the last 5 bookings;
- an unfinished draft, saved on every successful Next.

Restoring a draft or repeating a past booking keeps each deliverable's type (v0.49.1).

### Who is the requester

In `booking-service.ts`:

1. **A signed-in ACTIVE member** booking with a blank or their own email → that member, never renamed.
2. **Otherwise** `RequesterDirectory.ensure()` looks the email up, exactly and lowercased, by `.eq` since v0.49.1:
   - **A person this workspace has** is the requester, pending or joined, and **keeps their name**. Only someone new takes the typed name. v0.48.0 renamed anyone; v0.49.1 stopped it, on the owner's rule, because the form is public (F-102).
   - **An account from outside the workspace** is invited as pending and never renamed.
   - **A new email** becomes a pending MEMBER through `inviteMember`: a confirmed Auth user without a password, an INVITED membership and a 30-day join link.
3. **If the directory fails**, the booking still goes through, and "Requester: …" lands in the description.

The lookup endpoints (`/api/book/[slug]/requester`, `/api/portal/[token]/requester`) return `{name}` for any person the workspace has, INVITED and deactivated included. They have no rate limit.

### Destination and what is written

1. The service comes from the **live** form. An unknown service is refused.
2. The service's team's receiving board is used if it is active, non-system and in this workspace; otherwise Task Allocation. Either way the task goes into the first group.
3. The server validates the request:
   - answers are filtered to the service's questions, and sub-services to those offered;
   - the department is checked against the ACTIVE list and stored in the list's spelling;
   - the brief is recomposed on the server — the caller's brief and team are never trusted.
4. The server writes:
   - **One task** with its ticket.
   - Its deliverable lines: each line keeps its own type, or takes the request's single type; its due date is the booking's.
   - Values through `mapBookingToColumns`:
     - Requester → REQUESTER;
     - Department → STAKEHOLDER;
     - Brief → the BRIEF column, and `items.booking_brief` (0068);
     - anything that found no column → a "Request details" block in the description.
5. TASK_BOOKED notifies the active admins, subject to their preferences, and `count_form_booking` bumps the published form's counter.

These are several writes, not one transaction.

### Allocation

- **Where.** Allocation is offered in three places:
  - the panel's Allocation section (`allocation-target`, `allocation-submit`);
  - the row menu ("Allocate to" → a submenu per team, always opening to its boards, plus "No team");
  - the bulk bar.
- **While it runs.** The row shows "Moving…" and a sweep until the task has left.
- **What it does.** `BookingService.allocate()` **moves the original task**, keeping its id, ticket, assets, subitems and portal provenance.
  - Values map as links do: hand-made pairs, then special types by type, then names.
  - The brief travels as a value. It goes into the description only when the target has no Brief column.
  - Then the recap is recomputed and `ITEM_MOVED` is logged.
- **Caveats:**
  - Bulk moves run in parallel (F-159).
  - Trigger 0074 can refuse a department after the move (F-161).
  - Target boards are listed by view rights (F-160).

### The form editor, drafts and templates

- **The page.** Portal and Booking has tabs "Portal" and "Form Editor".
  - The editor writes `booking_form_draft` only.
  - **Publish** asks for a name, defaulting to "<team> · d MMM yyyy, HH:mm". It stores the name and publish time (0059), resets the booking counter, and clears the draft. Publishing the built-in default stores null.
- **Published card:** "N questions · M services", "Published …", "N tasks booked since".
- **Templates** (`booking_templates`):
  - save (name ≤80, description ≤280; the same name replaces, case-insensitively);
  - load; update a loaded template in one click; load the published form; reset.
- **Saved blocks** (`booking_saved_blocks`, 0039/0016) insert as copies with fresh ids.
- **Preview** sends nothing.
- **Service settings:** team routing ("Bookings go to"), sub-services, questions.
- **Legacy forms.** `migrateLegacyTemplate()` reads version-1 forms as a General service.

### Limits and retry boundaries

- **`bookingRequestSchema` limits:**
  - name 2–120; email ≤200; title 3–200; brief ≤20k;
  - ≤50 deliverables; quantity 1–9999; spec ≤500; ≤20 asset types;
  - text answers ≤10k; choices ≤40.
- **Portal submissions** use a key (8–100 characters, unique per portal). The flow is claim → book → complete:
  - the same key with the same content replays the receipt;
  - different content, or a claim still pending, gives 409;
  - a failure releases the claim, but does not roll back a task already created.
  - Department isn't part of the content hash (F-162).
- **Public `/api/book` has no retry protection.** A resubmission books twice (F-158).
- **Refusals** from `BookingService` (unlisted department, removed service, missing answer) reach Supabase callers as a generic 500 (F-113).

## 13. Board and task sharing

- **Board shares.**
  - A board has at most one share: a 22-character token, enabled flag, PUBLIC/PRIVATE access, optional expiry date and salted password (`salt:hash`, one SHA-256 round).
  - New links default to PRIVATE, which means a signed-in active member of the workspace.
  - Expiry is inclusive (`expiresAt < today` refuses). Disabling keeps the token; regenerating replaces it.
- **The board payload:**
  - metadata, groups, **columns that aren't removed** (their values filtered on the server too), active items, values, scoped assets and comments;
  - up to 200 board activities (the journey uses them);
  - referenced people as `toPublicUser()` (id, name, avatar; everything else blank).
  - It doesn't redact what people type into descriptions, cells or Updates.
- **Task shares** (`/share/item/<token>`) carry:
  - the task, its direct subitems and their values;
  - scoped assets and comments, and up to 100 activities;
  - the board's metadata, groups and columns — no links and no siblings.
  - An archived task can't be opened this way.
- **Refresh.** Share pages poll every 4 s (`SHARE_REFRESH_MS`) while visible, and on focus.

## 13b. Workspace dashboard

One scrolling report (`DashboardBody`): headline figures, the year comparison and mix, demand and delivery breakdowns, current operations and named workload.

### Snapshot and reporting contracts

`DashboardService.loadSnapshot()` reads the active boards the reader can see, with groups, columns (removed ones included), items (archived ones included), values and assets, plus output rates, teams, users, departments and links. `analytics.ts` builds the facts and `metrics.ts` the reporting contracts. The rules that decide what counts:

- **What counts as delivery.** A delivery task is top-level work outside Task Allocation. Intake items are requests, not delivery. Linked copies count once.
- **Archiving.** Archived items count in history; archived boards drop out entirely.
- **Asset units.** A line with no quantity counts as 1.
- **Departments.** Work is attributed from the STAKEHOLDER cell through the department registry, then requester hints, else Unknown.
- **Periods** are matched day ranges. The default is created-date year to date against the same span last year.
- **Comparisons.**
  - Missing history reads "Unavailable".
  - A base under 5 shows the difference but no percentage (`MIN_PERCENT_BASE`, v0.46.1).
  - A zero base shows "no % comparison".
- **Not reportable.** Nothing records a completion event or an original deadline, so neither completion-date throughput nor on-time delivery can be reported.

### Effort, workload and rates

- **Measures.** The page measures Tasks, Asset units or Effort. Effort appears only when output rates exist.
- **Rates** live in `workspaces.asset_rates` and are edited in Settings → Asset types as `{qty, every, per}`, with an 8-hour day and a 5-day week.
- **Workload** shows each person split by department, over 2, 4 or 8 weeks. A task with several people counts once for each of them.

### Presentation (v0.32–v0.46)

- **Motion.** Motion waits for load and a visible tab (`DashboardReveal`): shapes grow in and big figures count up. Reduced motion shows everything at rest.
- **Thin data.** Every panel says when there's nothing yet ("No {unit} in {period} yet.").
- **Scales.** Chart scales count in whole numbers.
- **Links.** On the signed-in page, names open profiles and team pages, and a department narrows the workload panel.
- **Preferences** are stored in `streamline.dashboard.v2`, keyed `<user>:<workspace>`. The settings menu hides panels (`PANEL_IDS`).

### Freshness and the public link

| Surface | Refresh | Notes |
| --- | --- | --- |
| In-app dashboard | Every 60 s, **visible only**; on focus | Realtime on 10 tables, coalesced over 2 s, at most once every 20 s |
| Profile's department split | A borrowed snapshot | No polling |
| Public link `/dashboard/<token>` | Every 60 s, **including background tabs** | About 4.5 MB per snapshot (F-119) |

The public link is one per workspace, managed by admins, with an optional password and expiry. `publicDashboardSnapshot()` strips from what it sends:

- descriptions and covers;
- asset notes and links;
- emails and job titles;
- every TEXT value except department-like columns;
- LONG_TEXT, LINK and DEPENDENCY values.

Named workload stays.

## 13c. Stakeholder portal

### One workspace link

- One `department_portals` row per workspace with `department_id` null (0037), created switched off, with a 32-character token.
- Old per-department links answer "This link has been replaced". Portal pages set noindex and no-referrer.
- The **admin card**, in Portal and Booking:
  - Open / Closed;
  - a password popover (add, change, remove);
  - "New link" (with a confirmation);
  - two tiles, each with copy and open buttons and a gear:
    - the portal link — its figure is the number of departments;
    - the booking link — its figure is requests booked; it shows "Not serving" when closed or not taking requests.
- **Settings dialogs** (`portal-portal-settings`, `portal-booking-settings`) edit a draft. Save writes every change in one call; Discard resets; closing with unsaved changes asks first.
- **Portal settings:**
  - team name (≤60), opening view, **default range** (1w/2w/1m/3m/6m, 0058), default theme and whether visitors may switch it;
  - the columns shown; figures; the boards' own groups (`show_item_groups`, off by default).
- **Booking settings:**
  - accept bookings; theme and switch;
  - headline (≤80) and lead (≤240) for the portal booking page;
  - the sign-in offer;
  - **interface size 80–150%** and whether visitors may change it (0060/0061).
- The portal `description` field is stored but has no UI (F-166).

### Gate

`StakeholderPortalService.resolve()` checks, in order:

1. the token's shape;
2. that it is the unified row;
3. that the link is enabled;
4. the credential version (password changes and New link bump it);
5. the password: PBKDF2-SHA256, 210,000 iterations, 16-byte salt, verified on every call, with no attempt limit (F-165).

A wrong password is 401; other refusals are 404; submission conflicts are 409.

### Departments and publication scope

- `stakeholder_departments` keeps durable ids through renames, via `reconcileDepartments` and the editor's rename map.
  - A removed department is disabled, never deleted. Re-adding its name makes a new one.
  - Settings → Departments is the only editing surface: ≤60 entries, names ≤40 characters.
- `scopeWithItems()` publishes unarchived top-level tasks that either:
  - carry a STAKEHOLDER value (read by column type; the label wins for attribution); or
  - have portal provenance.

  Linked candidates collapse to one.
- Department and range choices filter; they are not authorisation.

### Board presentation

- The portal renders as the app's own read-only board, with all 7 views. Its columns:
  - Requested; Department (only with All and more than one department);
  - Status, Priority, PIC, Due date;
  - then Timeline, Assets recap, Asset type and Brief where there is data.
  - The Brief row keeps its headings (`portalBriefMarkdown`).
- **Always withheld:** descriptions, requester contacts and profile details, asset notes and links.
- **Published:** update threads (without mention metadata) and the task journey.
- **Awaiting banner:** "Waiting for allocation · With {team}".
- **Header and toolbar:**
  - department picker (lists only departments with work, plus All); range picker (with an all-time warning); group by board/status/department; status order (`streamline.portal-status-order:<token>`);
  - Book a task; theme; staff sign-in.

### Ranges, search, refresh and theme

- **URL parameters:**
  - `?range` defaults to the link's own default, then 3 months;
  - search widens the range to all time;
  - `?task` opens a task from the current payload only, so a request outside the range shows "Item not found" (F-163).
- **Refresh.** The board polls every 4 s while visible and refetches on focus. It also polls on the booking page, because it supplies the department list.
- **Theme.**
  - The link's theme beats the visitor's app theme.
  - A visitor's own choice is stored per token and page (`streamline.portal-theme:<token>:<board|booking>` as `{theme, over}`) and lapses when the team changes the link's setting.
  - The theme is applied to `<html>` while the page is mounted; the app theme returns on leaving.
- **Booking size.** A visitor's size is stored in `streamline.portal-scale:<token>` as `{scale, over}`.

### Booking from the portal

1. The wizard offers every ACTIVE department on the list.
2. On submit, the page sends the department's id when its filters have one.
3. **Since v0.49.1** it sends null otherwise, and the service finds the department on the list by the request's name (`departmentNamed`).
   - Before that, every department with no work yet — so every department after a wipe — failed with "Pick which department this is for." (F-101).
4. Either way the server checks the department is ACTIVE and writes its name over whatever the body said.
5. `allowBooking = false` is enforced by the service: a closed link answers 404, "This portal is not taking new requests at the moment."

## 13d. The phone experience

**The boundary and the shell.**

- Below 768 CSS px `useIsMobile()` (the only place 767 appears; `useSyncExternalStore`, server snapshot `false`) switches `AppShell` to the phone shell: a top bar (brand, title, search) and five destinations — Home, My Work, Browse, Inbox, More. The desktop frame is not mounted at all.
- `browse` and `more` carry what the sidebar holds on desktop. Automations sit under More, with a running mark on the More tab.
- Only 16 files are phone-aware. Every other page relies on responsive CSS. `Test_prompts/audits/2026-09-26-full-e2e/MOBILE_AUDIT.md` records a page-by-page audit and the plan for a full phone revamp.

**The phone board.**

- **Header:** back, name, favourite, a menu sheet (members, invite, activity, the whole board menu, a rename sheet).
- **Tools strip:** views, search, filter, sort, columns, plus Cards/Grid and Select.
- **Cards** (`mobile-item-card`):
  - status, priority and date chips open bottom sheets;
  - the date sheet's Today, Tomorrow and Next week use the phone's own day since v0.49.1 (F-111);
  - a floating **New item** button (`mobile-new-item`), a bulk bar in select mode, and a subitems toggle.
- **The grid** lazy-loads the desktop table in a compact layout.
- **Kanban** shows one lane at a time, with "Move to".
- The other views reuse their desktop implementations.
- **Tasks** open full screen. Cell editors open as sheets (`cell-shell.tsx`), and automation dialogs become bottom sheets.

**Preferences and trackers.**

- Phone-only choices are stored in `streamline.mobile-view`. The sidebar's narrow-screen fold is derived, never persisted.
- Trackers get a row editor.

**Known gaps** (details in `MOBILE_AUDIT.md`):

- update and reply controls revealed only by hover;
- several desktop dialogs and popovers without sheet variants;
- dense settings, form-editor and dashboard layouts;
- the phone "Ticket" toggle changes the desktop setting.

## 13e. Automations

### Model

`src/domain/automation/automation.ts` defines a rule: `{name, enabled, trigger, conditionMatch: all|any, conditions[], actions[]}` plus `lastRunAt`, `runCount` and `lastError`. Rules are stored as jsonb.

| Timing | Trigger kinds |
| --- | --- |
| Event (17) | `item_created` (optional group), `subitem_created`, `item_renamed`, `name_contains`, `comment_contains`, `column_contains`, `column_changed`, `column_set_to` (label / tick / text), `column_cleared`, `number_crosses` (above/below a threshold), `person_assigned`, `person_unassigned`, `item_moved_to_group`, `item_moved_from_group`, `comment_added` (replies too), `item_archived`, `item_restored` |
| Schedule (3) | `date_arrives` (column, offset days, hour), `column_unchanged_for` (column, 1–365 days, hour), `recurring` (daily/weekdays/weekly/monthly, hour) |
| Manual (1) | `manual`: a quick run |

**Conditions.** There are four kinds: column, group, actor, and item kind (task/subitem). Each takes one of eleven operations: is, is_not, is_empty, is_not_empty, contains, not_contains, greater_than, less_than, before, after, is_overdue.

**Actions (23)**

| Category | Actions |
| --- | --- |
| Set or clear values | set_value, clear_value, copy_value, adjust_number, add_tags, remove_tags |
| Groups and people | move_to_group, assign_person, unassign_person |
| Dates | shift_date, set_date_relative |
| Names and descriptions | set_name, set_description |
| Parent and subitems | set_parent_value, set_subitems_value |
| Messages | notify, add_comment |
| Create | create_item, create_subitem, duplicate_item |
| Lifecycle | archive_item, restore_item |
| External | send_webhook |

**Notify audiences.**

- The audiences are people_on_item (PIC and People columns, not Requester), column, creator, actor, board_owners, board_members and specific.
- The actor is removed from every audience except actor and specific, so a rule you test on yourself logs "Nobody to tell". Delivery is type ASSIGNED, subject to each person's preferences.

**Placeholders.**

- `{item} {board} {group} {ticket} {actor} {today} {column:Name}`.
- Unknown placeholders stay as typed.

**Validation** (`automation-service.ts`):

- **Limits.**
  - A rule has 1–10 actions and at most 10 conditions.
  - Hours are integers 0–23; weekly rules need a weekday 0–6 and monthly rules a day 1–28.
  - Rules that only run on the clock may use only notify, create_item and send_webhook.
- **Webhooks** must be https, with no credentials in the URL and no private host or IP range.
- **Loop guards.**
  - A creation or name trigger can't create tasks on its own board.
  - A value trigger can't write its own column.
  - Chains stop at depth 3 (`MAX_EVENT_DEPTH`). The depth mark is `automation_marks` on Supabase (120 s).
  - Tasks *created* by actions carry no mark, so a duplicate-on-Done rule can loop (F-114).
- **Names.**
  - A rule with no name is saved as its auto-generated sentence.
  - Names are cut to 200 characters on create, and on edit since v0.49.1 (F-168).

### The runner

1. **Raising events (Supabase).** SECURITY DEFINER triggers insert `automation_events` rows, but only when an enabled rule on the board listens (`private.automation_board_listens`):
   - items raise `item_created`, archived, restored, moved or renamed;
   - values raise `value_changed` with `{before, after}`, passed through `jsonb_strip_nulls`;
   - comments raise `comment_added`.
2. **Draining.** `/api/automations/run` drains the queue with `AutomationEngine.drain()`:
   - It claims up to 200 events and splits them into lanes, one per task, up to 8 at a time.
   - For each event it reads the board's rules once, then builds the context, checks depth and conditions, and acts.
   - Actions write through the ordinary services, attributed to the actor, else the board owner. Each action logs one `automation_runs` row.
3. **Stripped payloads.** The engine reads a payload value as `wholeValue()` — `{...emptyValueFor(type), ...value}` — since v0.49.1. Before that, `column_cleared` never fired on Supabase for null-emptied types (F-106).
4. **Re-draining.** While a pass fires something (up to 3 more passes, within half the 50 s budget), the runner drains again, so chains finish in one tick.
5. **Schedules.** `recurring` rules fire in their hour, `column_unchanged_for` per quiet value, and `date_arrives` per task whose date matches. The clock reads `AUTOMATION_TIMEZONE` through `Intl`, so 9 am stays 9 am across daylight saving. String hours in jsonb are coerced to numbers.
6. **Receipts.** `automation_schedule_fires` stops the same firing twice. Recurring receipts fail on Supabase today because `item_id` sits in the primary key (F-105; fix proposed as 0080).
7. **Heartbeat and sweep.** The runner writes `automation_heartbeat` on scheduler ticks only. `automation_sweep(30)` clears old queue rows, runs and receipts. The workspace page and the board dialog flag a runner that has been silent for 20 minutes (`HEARTBEAT_STALE_MINUTES`).
8. **Member nudges.** Board and comment mutations nudge the runner 150 ms after they settle (POST `?sweep=0` with the member's session), so rules fire within about a second without waiting for the clock.
9. **Drivers.**
   - The production driver is `pg_cron` in the database: job `streamline-automations`, every minute, via `pg_net` (`supabase/optional/automations_pg_cron.sql`, set up by hand on 20 September).
   - `.github/workflows/automations.yml` (every 5 minutes) is kept but has never run on schedule.
   - `vercel.json` deliberately has no `crons` block.
10. **Local provider.** It queues events but nothing drains them: only quick runs execute, in the browser, with no permission check (F-181).

### Quick runs

- **What they are.** A quick run is a `manual` rule: a saved group of actions fired from a board dialog's Quick runs tab against up to 50 chosen tasks (`/api/automations/run-now`).
- **How it runs.** It runs under the caller's own session, which needs `canEditBoard`. Conditions are ignored.
- **Refusals:**
  - "That quick run no longer exists."
  - "Only a quick run can be started by hand."
  - A switched-off run reaches the UI as a generic 500 (F-172).

### Screens

| Screen | Contents |
| --- | --- |
| Workspace page (`/workspace/<slug>/automations`) | **Runner strip:** "The runner is live" / "Nothing is running these", with running / ran-today / with-errors figures. **Tabs:** Board automations (search, board filter, cards with toggle, open and remove — remove doesn't confirm, F-173), Recipes (10, managers only), Activity (refreshes every 30 s) |
| Board dialog | Rules ("When something changes" / "On the clock"), Quick runs, Activity (refreshes every 15 s). Runner pill, stale banner |
| Builder (`useRuleEditor`) | When → Only if → Then |
| Running indicator (Supabase only) | Realtime on `automation_events` keeps a busy board lit for ≥1.5 s: a ring on the board's Zap button, an orbit on the sidebar tile for other boards. On phones, a ring on the board menu and the More tab |

**The 10 recipes:** notify-on-done, deadline-reminder, overdue-chase, stuck-escalation, welcome-new-task, assign-on-create, weekly-review, stale-flag, subitems-follow-parent, archive-done.

### Persistence

**Tables** (0052–0057):

| Table | Holds |
| --- | --- |
| `automation_rules` | Rules. `trigger_kind` and `trigger_column_id` are generated columns |
| `automation_events` | The queue: bigint identity, payload, depth, claimed/processed stamps, attempts, error |
| `automation_marks` | Depth marks |
| `automation_schedule_fires` | Schedule receipts |
| `automation_runs` | The run log |
| `automation_heartbeat` | One row |

**Policies:**

- 0017: rules readable by board viewers, writable by board managers; runs readable by viewers.
- 0018: board viewers can read pending events.
- Marks and receipts have RLS on and no policies.

## 14. Personal work and collaboration

### Home, My Work and search

- **Home** shows recent boards, your work, favourites, teams and workspace activity.
- **My Work** (`MyWorkService.listAssigned`) reads every PIC column, removed ones included.
  - **Sections:** Overdue / Today / This week / Later / No date / Completed. Linked copies collapse.
  - **Filters** (`src/features/my-work/filters.ts`): search by kind (Items / People / Boards), PIC, board, status, priority by name, due bucket, type.
  - **Refresh:** every 30 s while visible.
- **Palette** (Ctrl/⌘ K or F, or the phone's search button):
  - **Kinds and scope.** Kinds are All, Items, Boards, Teams, People. "Search in" [this board] / Everywhere; an Archived chip.
  - **Matching.** `SearchService` folds accents (and đ). Every word typed must appear.
  - **Ranking** (lower is better):

    | Match | Score |
    | --- | --- |
    | Exact | 0 |
    | Ticket quoted in full | 0 |
    | Prefix | 1 |
    | Every word starts a word | 2 |
    | Contains, or a ticket that merely contains it | 3 |
    | Board description | 4 |
    | Person by email or title | name score + 3 |
    | Archived | +0.5 |

  - **Tickets.** Since v0.49.1 a query needs a digit to match a ticket at all, so typing "c" or "cp" no longer returns every ticketed task (F-112). "CP_014", "cp14", "cp-14", "14" and "014" all find CP_014.
  - **Results.** Groups of 6, items 12. Pending people are marked "Pending onboarding". People open their profile; archived tasks open in the board archive.

### Notifications

| Event | Default delivery |
| --- | --- |
| MENTION, ASSIGNED, COMMENT (a reply to your update), BOARD_INVITE, TASK_BOOKED | NOTIFICATION |
| STATUS_CHANGED, DUE_DATE_CHANGED, ITEM_LINKED | UPDATE |

Automation notify actions deliver as ASSIGNED.

- **Delivery classes.**
  - NOTIFICATION is the prominent class and can raise an OS notification: browser delivery must be switched on, the browser must allow it, and a tab must be open.
  - UPDATE is quiet.
  - OFF writes nothing.
- **Muting a board** turns its events off; it doesn't change access.
- **Inbox.**
  - Tabs: All / Notifications / Updates. Controls: unread only, Mark all read, Clear (per tab, with a confirmation).
  - The Notification settings dialog holds the delivery choices, board subscriptions, browser notifications and a test.
  - The bell moves on the workspace channel; the Inbox also polls every 120 s, background included.
  - The tab title carries the loud count (`99+` cap).
- **Mismatch.** The COMMENT preference is worded "Comments on my items", but only replies emit it (F-185).

### Updates: threads, replies, reactions (v0.35 → v0.41)

- **Composer.**
  - It rests as one line and opens into the full editor. Ctrl/⌘+Enter posts.
  - `@` mentions active people and notifies MENTION.
  - "Post to linked task(s)" is on by default.
- **Order.** Updates are newest first; replies oldest first.
- **Threads.**
  - `comments.parent_id` (0062) keeps threads one level deep: a reply to a reply is filed under the root.
  - Only the latest 3 replies show, behind "Show N earlier replies".
  - Replies start as a plain "Write a reply…" box that opens into the full editor.
  - The root's author is told of a reply (COMMENT), unless they wrote it or were mentioned. Replies are not copied to linked tasks.
- **Collapsing.**
  - A chevron or a click on the header folds one update; "Collapse all" / "Expand all" folds them all (for the visit only).
  - A collapsed card shows the author and time, the reaction tally, "N replies" and two lines of text.
- **Delete** turns the bin into a red "Delete?" badge; a second click deletes. Blur, Escape or 4 s stands it down. Replies and shared copies go too.
- **Edit.** Only the author can edit. Edited updates show "(edited)", and the edit sends no notifications.
- **Reactions** (0070, `comment_reactions`):
  - 16 emoji: 👍 👎 ❤️ 🎉 😄 😂 😮 😢 😡 🤔 👀 🙏 👏 🔥 🚀 ✅.
  - One per person per emoji; click a chip to toggle it; the tooltip names who reacted. They are live for everyone.
  - The add button is revealed on hover for replies (F-120).
- **Read markers.** Item read markers drive the updates badge, which is separate from the Inbox.

### Direct messages, profiles and hover cards

- **Messages** are one-to-one workspace threads (`?to=`) with read state, between active people.
- **Profile** (`/people/<id>`):
  - **Header:** role, pending/deactivated badges, department chip, teams, Message, Edit (yourself or an admin).
  - **Figures:** open tasks, overdue, assets done x/y, assets overdue.
  - **Splits:** open work by due date, by board (top 5), and by department.
  - **Tabs:** tasks (open/done), assets, boards, activity (from the workspace's latest 300 events).
- **Hover card** (v0.49, `person-card.tsx`): avatars and single-person cells open a card after 350 ms.
  - It shows the name, title, pending/deactivated status, email, department, teams, local time and "View profile".
  - Outside the workspace layout (shares, portal) it falls back to a name tooltip.

## 15. Trackers and Excel interchange

- **What a tracker is.** A workbook of ordered sheets, each holding its columns, rows (data, section, subsection) and a frozen-column count.
- **Column types:** text, longText, list (options with colours), date, url, number (plain, integer, decimal, currency, percent), checkbox.
- **Summaries:** filled, empty, sum, average, min, max, checked and percent checked.
- **Saving.** `useSheetEditor()` debounces saves by 600 ms and flushes on unmount (audit F-004, 9 September). Undo keeps about 50 snapshots, with a separate redo stack. There is no cell-level merge, so the last write wins.
- **Excel.** `tracker-xlsx.ts` (ExcelJS):
  - **Export** carries structure, formats, dropdowns and summary formulas.
  - **Import** reads cached formula results and literal-list validations; arbitrary Excel features do not round-trip.
  - CSV export covers the current sheet only.
- **Permissions.** Active non-guests edit.
- **Wipe.** The danger zone's wipe deletes every tracker (v0.47.1).

## 16. State, synchronization, and saving

### Cache identity and optimistic writes

- **Query keys** are centralised in `src/lib/query/keys.ts`.
- **Board mutations** follow one cycle:
  1. cancel the snapshot query;
  2. keep the previous state;
  3. patch optimistically;
  4. call the service;
  5. reconcile new ids;
  6. refetch once no mutations are pending.

  Errors restore the old state and toast.
- **Knock-on invalidations** cover linked boards, links, My Work, activity and notifications.

### Local cross-tab sync

BroadcastChannel `streamline.data-changes` carries compact invalidation hints between tabs of one origin. It is not a replication transport.

### Supabase Realtime

`useRealtime()` (`src/lib/realtime/use-realtime.ts`) does the following:

- opens one channel per name;
- invalidates the named keys once per burst of changes;
- re-reads everything after a reconnect;
- adds one unfiltered DELETE listener per filtered table. With RLS, a deletion arrives as its primary key only, so a filtered listener would never see it.

Channels are shared and reference-counted.

| Channel | Mounted by | Covers |
| --- | --- | --- |
| `workspace:<ws>:<user>` | `WorkspaceProvider` | Workspace, members, invitations, profiles, teams and their members, board members, boards, favourites (self), lists, notifications and preferences (self), direct messages (to and from), trackers, item reads (self) |
| `board:<id>` | Board and archive pages | Items, values, groups, columns (by board); comments, **reactions** (unfiltered, F-186), assets, links, activity |
| `board-linked-assets:<id>:<boards>` | Boards with linked rows | Assets on the far boards |
| `dashboard:<ws>` | Dashboard | The snapshot's tables (2 s coalesce, 20 s minimum) |
| `my-work:<ws>:<user>`, `item-links:<item>`, `tracker:<id>`, `workspace-activity:<ws>`, `portal:<ws>`, `booking:<ws>` | Their pages | As named |
| automations channels | Automations surfaces | Rules, runs, events (the running indicator), heartbeat |

**Publication history:** 0004 (board tables); 0005, 0015, 0024, 0026 and 0035 (messages, assets, boards, teams, lists, workspaces); **0049** (profiles, members, invitations, team and board members, favourites, item reads, preferences, booking templates and blocks, portal tables); 0052–0054 (automations); 0070 (reactions). Replica identity stays at its default.

**Never live:**

- search;
- share dialogs;
- the booking draft (so it isn't replaced under an admin's cursor);
- public pages, which poll instead.

### Storage keys

| State | Where |
| --- | --- |
| Local auth session | localStorage `streamline.local-session` |
| UI preferences | `streamline.ui`: sidebar width 240–480 and collapse; item column widths; panel size; asset recap expanded; team counts |
| Theme | `streamline.theme` (light / dim / dark / system) |
| View as | sessionStorage `streamline.view-as` |
| "Later" for a build | sessionStorage `streamline.version` |
| Board view; per-view settings | `streamline.board-view`; `streamline.view-settings` (+ server after 600 ms) |
| Dashboard preferences | `streamline.dashboard.v2` |
| Phone-only choices | `streamline.mobile-view` |
| Portal theme / status order / booking size | `streamline.portal-theme:<token>:<page>`, `streamline.portal-status-order:<token>`, `streamline.portal-scale:<token>` |
| Booking memory | `streamline.booking` |
| OS notifications already shown | `streamline.os-notifications.seen:<user>` |

UI stores rehydrate after mount, to avoid hydration mismatches.

### Unsaved-work guard

`beginUnsavedWork()` counts in-flight saves. `beforeunload` asks the browser to confirm while the count is above zero. Tracker autosave uses it; it is not an offline queue.

## 17. Database operations

### Heads and order

- **Heads:** migrations **0001–0078** (77 files; there is no 0069), policies **0001–0019**.
- **`supabase/sequence.txt`** lists all 96 files in the order they were first applied. The order was taken from git history, with rename detection off.
- **Why the order matters.** Thirteen migrations (0005, 0010, 0013, 0015, 0043, 0050–0052, 0055–0057, 0059, 0070) call `private.*` helpers defined by policy files. "Every migration, then every policy" therefore stops at 0005 on an empty database (audit F-108).

### Migration runner

`scripts/db-migrate.mjs` (the `db:migrate` script, and `predev`/`prebuild` with `--if-configured`):

- **Configuration.** It fills unset variables from `.env.local`/`.env` and connects with `SUPABASE_DB_URL`.
- **Locking and the ledger.** It takes advisory lock `8163` and keeps `public.schema_migrations` (name, sha256/16 checksum, applied_at; RLS on).
- **Order.** Pending files run in **sequence order**. A file the list doesn't name runs after the listed ones, in directory order, with a warning. `tests/unit/sql-sequence.test.ts` fails until it is listed.
- **Transactions.** Each file and its ledger row run in one transaction.
- **Drift.** A changed checksum is reported, not re-run. Add a new file instead of editing an applied one.

| Command | Meaning |
| --- | --- |
| `npm run db:migrate` | Apply pending files in sequence order |
| `npm run db:migrate -- --dry` | List pending files (still connects and ensures the ledger) |
| `npm run db:migrate -- --baseline` | Record pending files as applied without running them |
| `npm run db:setup [-- --no-seed]` | Migrate, seed, switch `.env.local` to Supabase |

**Adding SQL:** next number in its directory → **append to `supabase/sequence.txt`** → `npm run db:migrate`. `npm run dev` and every Vercel build apply pending files against whatever `SUPABASE_DB_URL` names — in this repo's `.env.local`, production.

### Migration inventory

| # | Change |
| --- | --- |
| 0001–0010 | Initial schema and profile trigger; item links; trackers; realtime publication; direct messages and avatars; status roles; notification delivery; shared comment ids; invitations; item reads |
| 0011–0020 | Size column; Files column removed; covers; task booking and system entities; item assets; board-visit views; multiple assignees; asset completion; booking templates; board shares |
| 0021–0030 | Item references, backfill, scramble (since renamed to tickets); dashboard shares; asset activity; workspace lists; STAKEHOLDER; profile details; item shares and share access; durable departments, portal credentials, provenance and submissions |
| 0031–0040 | Portal presentation; submission claims; output rates; asset links; workspaces in realtime; value `board_id`; unified portal; form draft; saved blocks; `show_item_groups` |
| 0041, 0042 | RICH_TEXT type; LONG_TEXT "Brief" columns become RICH_TEXT |
| 0043 | `workspace_keeps_an_owner` deferred constraint trigger |
| 0044 | `board_columns.hidden_in_panel` |
| 0045 | `item_links.pairs` (hand-paired columns) |
| 0046, 0047 | DROPDOWN, PEOPLE types |
| 0048 | `board_columns.role` + unique (board, role) |
| 0049 | 13 more tables into realtime |
| 0050, 0051 | Tickets (`items.ticket`, prefix/counter, `next_ticket_numbers`); `rewrite_ticket_prefix` |
| 0052–0057 | Automations: rules, queue, marks, receipts, runs, capture triggers, sweep; heartbeat; events visible and in realtime; more triggers; keyword triggers; subitem moves |
| 0058 | Portal link settings (default range, theme switches, booking theme, headline, lead, sign-in) |
| 0059 | Published form name, time and booking counter; `count_form_booking()` |
| 0060, 0061 | Booking page scale 80–150 and its visitor switch |
| 0062 | `comments.parent_id` (replies) |
| 0063–0065 | "Stakeholder" columns renamed Department; Task Allocation description; duplicate Department column dropped |
| 0066–0068 | BRIEF type; RICH_TEXT "Brief" columns become BRIEF; `items.booking_brief` + backfill |
| 0070 | `comment_reactions` |
| 0071 | `workspace_snapshots` (no FKs, RLS on, no policies) |
| 0072, 0073 | PLAIN_DATE, TIME, DATETIME, BOOKED_AT; COUNTDOWN |
| 0074 | `enforce_listed_department()` trigger |
| 0075 | `board_columns.removed` |
| 0076 | Snapshot kind `before_wipe` |
| 0077 | `board_templates` |
| 0078 | REQUESTER type |

| Policy | Change |
| --- | --- |
| 0001–0010 | Base RLS and helpers; links; trackers; notification preferences; invitations; system entities; booking templates; read-only visibility; board shares; dashboard shares |
| 0011–0016 | Workspace lists; item shares; portal/departments/provenance (submission claims service-role only); membership before ownership; board SELECT without re-read (current `board_role_for`); saved blocks |
| 0017 | Automation rules (view / manage board) and runs |
| 0018 | `automation_events` readable by board viewers |
| 0019 | Board templates: members read and insert as themselves; creator or admin updates/deletes |

**Proposed and not applied:** `Test_prompts/audits/2026-09-26-full-e2e/proposed-sql/` holds migrations 0079 (comments stay put), 0080 (recurring receipts) and 0081 (prefix rewrite keeps long numbers), and policy 0020 (comment edits need edit rights). Test them on a disposable database, then move them in and append them to `sequence.txt`.

`supabase/optional/automations_pg_cron.sql` is applied by hand only.

### Seeds and data scripts

| Command | What it does |
| --- | --- |
| `npm run db:seed` | **Replaces** the seed workspace: demo Auth accounts (`SEED_PASSWORD`, default `Password123!`; admin `ADMIN_PASSWORD`, default `admin123`), a fresh bundle, new invitation links. Keeps members who aren't in the seed. Fixed on 26 September (F-109). **Never against production.** |
| `npm run db:seed:topup` | Adds seed extras with `on conflict do nothing`, mapping live groups and columns by name. The safe way to add demo content to a hand-edited workspace. |
| `npm run db:special-columns [-- --dry]` | Adds missing special columns to every board, archived and system ones included. |
| `npm run db:snapshot:rehearse [-- --snapshot <id\|latest>]` | Captures, refills every table inside a rolled-back transaction, and compares fingerprints (a schema-change round-trip test). Locks every table for about 10 s. |
| `npm run tickets:dedupe [-- --apply]` | Renumbers tickets shared outside link chains. |
| `scripts/add-user.mjs`, `refresh-demo-data.mjs`, `archive-fixture.mts`, `add-stakeholder-column.mjs` | Admin and fixture tools. They write data. |

### Snapshots and restore (v0.40)

- **Where.** Settings → Snapshots, on Supabase only, for admins. The code is `src/server/snapshots.ts`, using a direct `postgres` connection.
- **Capture:**
  - one `repeatable read read only` transaction;
  - every public base table except `schema_migrations` and `workspace_snapshots`, each as `json_agg`;
  - a header `{format:"streamline-snapshot", version:1, name, createdAt, createdBy, appVersion, schemaVersion, tableCounts}`;
  - gzip level 9, stored as `bytea`.
  - Auth users and Storage files are **not** included.
- **Actions:**
  - download (`streamline-<name>-<time>.json.gz`);
  - upload (≤4 MiB; gz or plain JSON; refuses damaged, foreign or newer-version files);
  - delete.
- **Restore:**
  1. type **RESTORE** (the password check is off: `RESTORE_NEEDS_PASSWORD = false`);
  2. take advisory lock 7 441 902 (409 if busy);
  3. take a safety snapshot "Before restoring “…”";
  4. in one transaction with `session_replication_role = replica` (triggers and FKs off; `statement_timeout` 55 s): TRUNCATE every current table, then refill from the file via `jsonb_populate_recordset … overriding system value`, keeping columns present in both;
  5. reset identity sequences;
  6. stamp `restored_at`.
  - A blocking screen covers the initiating tab, then the page reloads.
- **What a restore really means:**
  - it covers the **whole database** — every workspace;
  - tables absent from an older file come back **empty**;
  - pending automation work is restored too;
  - skipped tables aren't shown;
  - the file contains live share, portal and invitation tokens and the booking key, so treat it as a secret (F-118).

### Danger zone: wipe all board data (v0.46)

- **Who and what's needed.** Admins/owners only, with **their password** (checked by a throwaway sign-in). It shares the restore's lock and takes a "Before wiping board data" snapshot first (`before_wipe`, 0076).
- **In one transaction it deletes:**
  - activities, notifications, automation runs and portal submissions that pointed at boards or tasks;
  - every non-system board (with cascades), and the tasks on built-in boards;
  - every tracker.
- **What stays:**
  - Task Allocation keeps its columns, groups and rules;
  - settings, lists, teams and people.
- **Tickets.** "Start tickets again from CP_001" (`resetTickets`) sets the counter to 0.
- **Knock-on effects:**
  - team receiving boards are unset (FK), so bookings go to Task Allocation;
  - portal provenance rows go (FK cascade);
  - departments then have no work, which is what exposed F-101.

## 18. Deployment, build identity and updates

- **Vercel** (`vercel.json`): Next.js, `npm ci --legacy-peer-deps --include=dev`, `npm run build`, functions in `sin1`, no `crons`. `prebuild` applies pending SQL whenever `SUPABASE_DB_URL` is set; `SKIP_DB_MIGRATE=1` bypasses it.
- **Production:** `https://rmit-streamline.vercel.app`, on Supabase project `lfkvrhycyrjgeqkyaiou` in ap-southeast-1.
  - `SUPABASE_DB_URL` must be the session pooler: the direct host is IPv6-only.
  - `NEXT_PUBLIC_*` values are Vercel "Config", not Secrets.
- **GitHub workflows:**
  - `db-migrate.yml` applies SQL on pushes to `main` that touch it, or on manual dispatch.
  - `supabase-keep-alive.yml` runs `SELECT 1` four times a day.
  - `automations.yml` (every 5 minutes) is kept but idle.
  - The automation driver is pg_cron (§13e).
- **Build identity.** `next.config.ts` bakes the version, build id and timestamp into the build.
  - The build id is the first of `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, `BUILD_ID`, `git rev-parse` or `local-…`, cut to 12 characters.
  - `/api/version` reports what the server is running.
- **Update notice.**
  - **Watching.** `VersionWatcher` (app shell only) checks on mount, every 30 s while the tab is visible, and on visibility, focus and online events. Any different build id or version counts as new, a rollback included.
  - **The card.** A compact card in the corner reads "v{x} is ready"; What's new fetches `/api/changelog?since=<running>`. Later is remembered per build and tab; Refresh reloads.
  - **Where it's absent.** Portal, share, booking and public-dashboard pages never check (F-190).
- **Changelog.** `src/lib/changelog.ts` gets an entry for every version bump. `tests/unit/changelog.test.ts` requires the top entry to equal `package.json`'s version. Small changes bump the patch; features bump the minor.

## 19. Testing and verification

### Commands

| Command | Scope |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `npm test`, `npm run check` | ESLint; `tsc --noEmit` (tests included); Vitest; all three in turn |
| `npm run test:e2e` | Playwright, local provider, `:3100`, one worker, Desktop Chrome 1440×900. Run it with `SKIP_DB_MIGRATE=1`: its web server is `npm run dev`, whose `predev` migrates the database `.env.local` names |
| `npm run test:e2e:supabase` | `supabase-smoke.spec.ts` with `E2E_PROVIDER`/`PW_PROVIDER=supabase`. It loads `.env.local` into the test process, so run it only where that names a disposable database |
| `npm run test:e2e:deployment` | Smoke tests against `E2E_BASE_URL` (defaults to production — it writes) |

`npm run check` includes no Playwright and no build. The baseline on 26 September: lint clean (6 warnings), typecheck clean, 950/954 unit tests. The 4 failures were 5 s timeouts under load (booking-wizard ×2, xlsx ×2); all pass when run alone (F-122).

### Coverage map

- **Unit (106 files after the audit), by area:**

  | Area | Files |
  | --- | --- |
  | Automations | `automation*.test.ts`, `quick-runs` |
  | Booking | `booking*` |
  | Portal | `portal-*`, `stakeholder-portal` |
  | Tickets and search | `ticket`, `search-service` |
  | Columns | `special-columns`, `column-roles`, `countdown-column`, `date-time-columns`, `dropdown-column` |
  | Boards | `board-templates`, `board-service`, `board-archive`, `board-filtering` |
  | Dashboard | `dashboard-*` |
  | Tracker | `tracker-*` |
  | Rich text | `rich-text*` |
  | Collaboration | `comment-reactions`, `task-journey` |
  | Snapshots | `snapshot-file` |
  | Seeds | `seed-*` |
  | Database | `sql-sequence` |
  | Audit | `audit-2026-09-26`, `automation-stripped-payloads`, `guide-content` |

  Plus component tests under `tests/unit/components`.
- **E2E (32 specs):** auth and navigation, boards, groups and items, column types and layout, filters/sort/DnD, views, cross-view sync, permissions, teams and members, onboarding, account, notifications, updates, assets, covers, tickets, trackers, booking, the portal, board sharing, mobile layout, a large board, accessibility, the version check, and the Supabase and deployment smokes.
- **Not covered by any test:**
  - automations in the browser;
  - replies, collapse and the delete badge;
  - reaction UI;
  - snapshots, restore and wipe (API or UI);
  - saved templates in the UI;
  - special-column remove/restore in the UI;
  - Format menu and Countdown cells;
  - "Used as";
  - resizing (item column, sidebar);
  - the loading screen;
  - any `src/server/*` route;
  - SQL triggers and policies added since 0040.
- **Stale specs (F-193):** `boards-lifecycle` (old templates), `column-types` (a Link column named "Brief"), `booking` (expects a full requester name).

### A disposable Supabase for backend tests

Set this up whenever RLS, a server route, a trigger, the runner, a restore or a wipe needs a real database. It was proven on 26 September.

1. Start Docker Desktop. In a separate folder, run `npm i supabase`, then `npx supabase init`.
   - In `config.toml`, switch off the dashboard section, `local_smtp`, `edge_runtime`, analytics, `storage.vector` and `db.seed`.
   - Then run `npx supabase start`.
2. `git worktree add --detach ../_streamline_sb HEAD`, then `npm ci` in the worktree.
   - Give the worktree its own `.env.local` with **only** the local stack's URL, keys and `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. No script can then fall back to production.
3. In the worktree: `node scripts/db-migrate.mjs`, `npx tsx scripts/db-seed.mts`, `npx tsx scripts/ensure-special-columns.mts`.
4. Run the app with `SKIP_DB_MIGRATE=1 npx next dev --port 3300`.
   - Point Playwright at it (with `E2E_PROVIDER=supabase`), or probe PostgREST with each persona's JWT from `/auth/v1/token?grant_type=password`.
5. Reset with `npx supabase db reset`, then steps 3–4 again. Remove everything with `npx supabase stop` and `git worktree remove`.

### Evidence rules

- A local-provider test proves UI behaviour, not RLS, triggers or server routes.
- View as is not a sign-in.
- Record which environment each result came from; the audit's `COVERAGE.md` does.

## 20. Troubleshooting

| Symptom | Likely area | Check |
| --- | --- | --- |
| Unexpected demo content | Provider fallback / another origin | Config warning; port and profile |
| `npm run dev` fails before Next starts | Migration hook | `SUPABASE_DB_URL`, runner output, `SKIP_DB_MIGRATE` |
| Fresh database stops at `0005` ("schema private does not exist") | Order | Use the current runner (`supabase/sequence.txt`) |
| `db:seed` crashes with `UNDEFINED_VALUE` | Old seed script | Use the fixed `scripts/db-seed.mts` |
| New SQL file warns "not in supabase/sequence.txt" | Sequence | Append it; `sql-sequence.test.ts` fails meanwhile |
| Portal booking says "Pick which department this is for." | F-101 before v0.49.1 | Update; or the name isn't on Settings → Departments |
| A colleague's name changed after a booking | F-102 before v0.49.1 | Update; rename them back in their profile |
| Searching "c" or "cp" shows every ticketed task | F-112 before v0.49.1 | Update |
| An automation "does not fire" | Runner or rule | Is something calling the runner (heartbeat, `cron.job`)? Is the queue growing (`automation_events where processed_at is null`)? What does `automation_runs` say — skipped runs carry the reason |
| A notify rule tested on yourself does nothing | Actor exclusion | "Nobody to tell": test with a second person |
| A recurring rule fails every hour | F-105 | Apply proposed 0080 |
| "When a column is cleared" never fires on Supabase | F-106 before v0.49.1 | Update |
| The board's automation ring never stops | Stuck claimed events (F-115) | Release old `claimed_at` rows |
| Automations never fire in local mode | By design (F-181) | Only quick runs run locally |
| A special column vanished | Removed, not deleted | Add the type back from the picker: its values return |
| "A Booking time column belongs on Task Allocation only." | BOOKED_AT guard | Use a Date + Time column |
| Department value refused | Trigger 0074 | Add it to Settings → Departments, or pick a listed one |
| Ticket refused as "already …" | Uniqueness | Another task holds it; typed tickets are checked workspace-wide |
| Prefix change produced duplicate tickets | F-107 on Supabase | Apply proposed 0081; `tickets:dedupe` |
| Board can be read but not edited | Visibility precedence | Ownership, explicit seat, admin, team visibility |
| Added person cannot sign in | Pending onboarding | Finish the join link |
| Booking, share or member creation fails while boards work | Service-role routes | Server key, route logs, token/key, migrations |
| Snapshot restore emptied a table | Older file | Restore the automatic "Before restoring" snapshot |
| Restore or wipe says another is running | Advisory lock | Wait; one runs at a time |
| Tab shows an update card after a rollback | Build identity | Any different build counts as new |
| Avatar or cover upload fails | Storage | Size and type, the bucket, write policies |
| Another person sees stale data | Realtime / RLS | Publication, subscription, readable rows |
| Tracker formula imports blank | Cached results | Save the workbook with results |

For a persistence defect, capture the provider, route, role, ids, operation and exact error. Follow the path hook → service → repository → row mapping → policy. Don't start with a reset.

## 21. Development change guides

### Adding a column type

Touch, at least:

- `COLUMN_TYPES`, labels, widths and default settings, and `COLUMN_TYPE_PURPOSE` (`column.ts`);
- the value union with `emptyValueFor`/`isEmptyValue` (`item.ts`);
- `column-type-icons.ts`; alignment in `board-model.ts`; the sort key in `board-filtering.ts`; `column-display.ts`;
- `item-link-sync.ts` (map it? translate it?);
- **`cell-renderer.tsx`** — its switch has no exhaustiveness guard, so typecheck won't catch a missing case;
- `group-summary-row.tsx`; the Format menu if it has a format; `column-type-picker.tsx` (which group; one per board?);
- automation set-value support in `rule-builder.tsx`; booking and portal mapping if it carries booking data;
- a forward migration for the enum value, appended to `sequence.txt`.

A special type also needs `SYSTEM_COLUMN_TYPES`, `ensureSpecialColumns` and `db:special-columns`.

### Adding an automation trigger or action

1. Extend `AUTOMATION_TRIGGER_KINDS`/`TRIGGER_TIMING` or the action union (`automation.ts`).
2. Add matching or execution in `automation-engine.ts`.
3. Validate it in `automation-service.ts`.
4. Describe it in `describeRule`, and add a builder control in `rule-builder.tsx`.
5. Raise the event in the Supabase capture trigger (a migration) **and** in the local repositories' `raise()`.
6. Test it on the local provider **and** against the stripped-null payload shape the database sends (see `automation-stripped-payloads.test.ts`).

jsonb enforces no types: coerce numbers read from rules.

### Changing SQL

1. Add the next number in its directory.
2. Append it to `supabase/sequence.txt`.
3. Make it idempotent (`if not exists`, `create or replace`).
4. Test it on a disposable database (§19).
5. Run `npm run db:snapshot:rehearse` when a table changes, so snapshots still round-trip.

Pushing to `main` applies it to production.

### Changing permissions

Change `permissions.ts` and the SQL helpers and policies together. Exercise these cases:

- owner, explicit editor, explicit viewer;
- admin, member, guest;
- team member, private board, system board;
- inactive member.

Use real Supabase sessions; View as and the local provider can't verify RLS.

### Adding a repository capability

1. Start from `src/data/repositories/index.ts`.
2. Implement it for local, Supabase and memory (read-only).
3. Wire it into `createServices`, the query keys and invalidation.
4. A new local store needs a `DB_VERSION` bump, an upgrade step, export/import handling and seeding. SQL persistence needs a migration, policies and a sequence entry.

### Changing booking or the portal

- **What to review, together:**
  - the version-2 template and legacy migration;
  - Zod and template validation;
  - service routing and `mapBookingToColumns`;
  - the requester directory (local **and** `src/server/requesters.ts`);
  - brief composition;
  - wizard steps and browser memory;
  - editor draft and publish, templates and saved blocks;
  - allocation mapping;
  - the portal's gate, `scopeWithItems`, projection and synthetic board.
- **What to test:** the public-key, member and portal paths, with and without department ids, and direct routing versus Task Allocation.
- **Trust rule:** never trust an actor, team or department id from the body.

### Changing sharing, templates or snapshots

- **Shares.** Review the gate, password and expiry, the projection, and removed-column filtering.
- **Templates.** Keep `remapTemplateIds` covering every id a new part can carry.
- **Snapshots.** Keep `EXCLUDED_TABLES` and the restore column intersection in mind, and rehearse.

### Working with this Next.js version

Follow `AGENTS.md`: read the relevant guide under `node_modules/next/dist/docs/` before changing Next.js code. Route params are promises; await them.

### Keeping documentation current

Update this file, `README.md` and the in-app guide (`src/features/workspace/documentation/guide-content.ts`; `tests/unit/guide-content.test.ts` checks its structure) when you change:

- routes, roles, scripts, schema heads, providers or domain types;
- user workflows.

Historical design notes in `docs/` and audits in `Test_prompts/` stay dated.

## 22. Documentation discrepancies and implementation limits

| Earlier assumption | Current implementation |
| --- | --- |
| Migrations then policies is a valid order | Only `supabase/sequence.txt` order builds an empty database |
| Tickets look like `TA-7441` | `CP_014`, from a counter; `TA-` references were renumbered by 0050 |
| Linked tasks keep separate deliverables | They share one set of lines (v0.19) |
| A board may have several Status or Due date columns | One of each special type; others are plain Date columns |
| Deleting any column deletes its values | Special columns are only removed from the board |
| The booking brief is copied into the description | It lives in the Brief column (and `booking_brief`); the description holds only what found no column |
| A booking keeps whatever name was typed for anyone | Nobody in the member list is renamed; only someone new takes the typed name (v0.49.1) |
| The portal can book only for departments with work | Any listed department, by id or by name (v0.49.1) |
| The dashboard is three tabs, refreshed every 15 s | One report, 60 s while visible; the public link polls in the background too |
| Automations run in the browser | A server drains a database queue; the local provider never does |
| GitHub Actions drives automations | pg_cron does; the workflow is idle |
| Settings has Lists, View and Data (Storage) | Workspace (Overview, Tickets, Teams), Lists (Departments, Asset types), People (Roles), You (Appearance), Data (Snapshots, Danger zone; Supabase admins only), Help (Guide, About) |
| Local mode can export and import its data | The controls went with Settings → Storage (v0.47.3); only Reset demo data remains |
| Restore asks for your password | It asks you to type RESTORE (the password check is switched off) |
| Two tasks can be open at once (changelog 0.20.0) | One task at a time; the release meant two browser tabs |
| Every folded column gets a summary (changelog 0.29.0) | Seven types show none |

Limits to keep in mind:

- **Board reads.** Board snapshots read whole boards; virtualisation bounds rendering, not reading.
- **No transactions.** Booking, allocation, list rewrites and portal submission are several writes each.
- **Shares don't redact.** Board and task shares carry typed content unredacted, and public bucket URLs are public.
- **History depends on today.** Dashboard history depends on the current boards, labels and rates.
- **Restore is database-wide.** Snapshots and restore cover the whole database and must be narrowed to one workspace before multi-workspace.
- **Public endpoints aren't rate-limited.** That covers booking, lookup, portal passwords and pending-member creation.
- **Local data is per origin.** One browser origin, one store; the local provider enforces no permissions and runs no automations.
- **Open defects** from the 26 September audit are in `Test_prompts/audits/2026-09-26-full-e2e/FINDINGS.md`.

## 23. Source index

| Question | Source |
| --- | --- |
| Scripts and versions | `package.json`, `package-lock.json` |
| Provider fallback | `src/lib/config.ts` |
| Composition | `src/features/data/data-context.tsx`, `src/services/index.ts` |
| Repository contracts | `src/data/repositories/index.ts` |
| Local schema | `src/data/local/database.ts` |
| Supabase rows and errors | `src/data/supabase/rows.ts`, `src/data/supabase/client.ts`, `src/server/http.ts` |
| Routes | `src/lib/routes.ts`, `src/app/**/page.tsx`, `src/app/api/**/route.ts` |
| Permissions | `src/lib/permissions/permissions.ts`, `supabase/policies/0015_boards_select_without_reread.sql` |
| Column types and special columns | `src/domain/board/column.ts`, `src/domain/item/item.ts`, `src/features/boards/components/cells/cell-renderer.tsx`, `column-type-picker.tsx` |
| Column roles | `src/domain/board/column-role.ts` |
| Date/time and countdown formats | `src/domain/board/date-time-format.ts`, `src/domain/board/countdown.ts` |
| Board lifecycle and templates | `src/services/board-service.ts`, `src/services/board-template-service.ts`, `src/domain/board/board-template.ts`, `src/features/boards/board-templates.tsx` |
| Views and lanes | `src/features/boards/components/views/*`, `kanban-lanes.ts`, `view-aggregates.ts` |
| Filtering and sorting | `src/features/boards/board-filtering.ts`, `src/stores/board-ui-store.ts` |
| Task panel, pop-up, journey | `src/features/items/item-detail-panel.tsx`, `panel-size.tsx`, `src/features/journey/*` |
| Tickets | `src/domain/item/ticket.ts`, `src/services/ticket-service.ts`, `src/features/workspace/ticket-settings.tsx`, migrations 0050/0051 |
| Undo | `src/stores/undo-store.ts`, `src/features/undo/undo-bar.tsx` |
| Search | `src/services/search-service.ts`, `src/features/search/command-palette.tsx` |
| Links and assets | `src/services/item-link-service.ts`, `src/services/item-link-sync.ts`, `src/services/item-asset-service.ts`, `src/domain/item/item-asset.ts` |
| Booking | `src/services/booking.ts`, `src/services/booking-service.ts`, `src/server/booking.ts`, `src/server/requesters.ts`, `src/features/booking/**` |
| Portal | `src/services/stakeholder-portal-service.ts`, `src/services/portal/*`, `src/server/portal.ts`, `src/features/portal/*` |
| Dashboard | `src/services/dashboard-service.ts`, `src/features/dashboard/*` |
| Automations | `src/domain/automation/automation.ts`, `src/services/automation-service.ts`, `src/services/automation-engine.ts`, `src/server/automations.ts`, `src/features/automations/*`, migrations 0052–0057, `supabase/optional/*` |
| Comments, replies, reactions | `src/services/comment-service.ts`, `src/features/items/item-updates.tsx`, `src/domain/comment/comment.ts` |
| Notifications | `src/domain/notification/notification.ts`, `src/services/notification-service.ts` |
| Profiles and hover cards | `src/features/profile/*`, `src/features/members/person-card.tsx`, `src/services/profile-service.ts` |
| Settings and guide | `src/features/workspace/settings-page.tsx`, `src/features/workspace/documentation/*` |
| Snapshots and wipe | `src/server/snapshots.ts`, `src/app/api/snapshots/**`, `src/features/workspace/snapshots-section.tsx`, `danger-zone-section.tsx`, `scripts/snapshot-rehearsal.mts` |
| Version and changelog | `next.config.ts`, `src/lib/version.ts`, `src/lib/changelog.ts`, `src/features/version/*` |
| Phone | `src/hooks/use-mobile.ts`, `src/components/layout/mobile-shell.tsx`, `src/features/mobile/*`, `src/features/boards/components/mobile/*` |
| Trackers | `src/domain/tracker/tracker.ts`, `src/features/trackers/hooks.ts`, `src/services/tracker-service.ts`, `src/services/tracker-xlsx.ts` |
| Realtime | `src/lib/realtime/use-realtime.ts`, `src/features/workspace/use-workspace-realtime.ts`, `src/features/boards/hooks/use-board-realtime.ts` |
| Migrations and seeds | `scripts/db-migrate.mjs`, `supabase/sequence.txt`, `scripts/db-seed.mts`, `scripts/db-seed-topup.mts`, `scripts/ensure-special-columns.mts` |
| Deployment | `vercel.json`, `.github/workflows/*` |
| Test harness | `vitest.config.mts`, `playwright.config.ts`, `playwright.deployment.config.ts`, `tests/setup.ts`, `tests/e2e/helpers.ts` |
| The 26 September audit | `Test_prompts/audits/2026-09-26-full-e2e/` |
