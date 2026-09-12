# Streamline knowledge base

## 1. Purpose, scope, and evidence

Streamline is an internal work-management application for the RMIT creative and marketing team. It combines configurable task boards, stakeholder booking, team allocation, deliverable tracking, spreadsheet-style trackers, discussions, direct messages, and workspace administration.

This document is a technical and operational reference for developers, maintainers, administrators, testers, and future coding agents. It describes the implementation present in this repository, explains how its parts fit together, and identifies the files to consult before changing behavior.

**Repository snapshot:** reviewed on 12 September 2026, at Git revision `b612633`; package version `0.17.0`. Unless explicitly marked as work in progress, versions, routes, constants and commands below describe that committed snapshot. The repository is the evidence source; this document does not certify the configuration, migration state, availability, or test results of any deployed environment.

**Evidence precedence:** executable implementation and current configuration take precedence over old comments and existing README prose. SQL must be read in application order, including later policy replacements. Tests describe intended behavior and regression coverage; their presence does not mean they were executed or passed during this documentation task.

This update was prepared by inspecting current source, configuration, migrations, test definitions, and changes since the earlier snapshot. This documentation task edits only this knowledge base; concurrent application edits by other work are left untouched. Verification is static documentation validation; no build, development server, database connection, migration, seed, or application test suite was run for this update.

### Changes since the earlier snapshot

- One workspace-wide stakeholder portal replaces separate department links; stakeholder and date selections filter an already authorized workspace scope.
- Booking uses a configurable service-based wizard, a saved draft separate from the published form, reusable form templates and brief blocks, and browser-local booking memory.
- New bookings create deliverable lines without duplicate subitems. Allocation moves the original task and retains its identity and portal provenance.
- Board archives have their own paginated route. Dashboard history includes archived items on active boards, while archived boards remain excluded.
- The dashboard is one page with effort, task and asset measures, output-rate settings, and workload split by stakeholder. Its public share includes named workload.
- Board and item shares offer public or member-only access, defaulting to member-only for new links. Shared board/item profile projection now uses an allowlist.
- Active workspace membership precedes ownership and explicit board seats. Tracker saves flush on unmount; board value events are scoped by board; dashboard refreshes are throttled.
- Repository schema heads are SQL migration **0040**, policy **0016**, and IndexedDB **15**.

### Concurrent work in progress

While this review was underway, additional uncommitted application edits appeared for formatted briefs and conditional questions. They are recorded here separately from the `b612633` baseline; their end-to-end integration, migrations and tests are not certified by this document.

- `src/domain/board/column.ts` and `src/domain/item/item.ts` add a `RICH_TEXT` column with a text payload, with corresponding display/filter/sort and link-mapping changes. Rich-to-plain translation removes formatting when targeting TEXT/LONG_TEXT.
- `src/domain/booking/booking-template.ts` adds single-choice follow-up blocks keyed by option name, a one-level branch model, visible/all-block helpers and lettered question numbering. `src/services/booking.ts` adds branch-aware validation and formatted brief composition.
- Shared rich-text rendering/editing helpers are being extended. Comments describe moving the composed brief into a dedicated rich-text Brief field rather than duplicating it in the description; confirm the completed booking service, renderer, persistence and migration paths before treating that change as delivered.

The column inventory, booking storage behavior and SQL heads in the main sections are the committed baseline. When this work is completed, reconcile these provisional notes into those sections and update the snapshot revision.

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
10. [Items, links, and assets](#11-items-links-and-assets)
11. [Booking and allocation](#12-booking-and-allocation)
12. [Public board sharing](#13-public-board-sharing)
    - [Individual task sharing](#13a-individual-task-sharing)
    - [Workspace dashboard](#13b-workspace-dashboard)
    - [Stakeholder portal](#13c-stakeholder-portal)
    - [Phone experience](#13d-the-phone-experience)
13. [Personal work and collaboration](#14-personal-work-and-collaboration)
14. [Trackers and Excel interchange](#15-trackers-and-excel-interchange)
15. [State, synchronization, and saving](#16-state-synchronization-and-saving)
16. [Database operations](#17-database-operations)
17. [Deployment and build identity](#18-deployment-and-build-identity)
18. [Testing and verification](#19-testing-and-verification)
19. [Troubleshooting](#20-troubleshooting)
20. [Development change guides](#21-development-change-guides)
21. [Documentation discrepancies and implementation limits](#22-documentation-discrepancies-and-implementation-limits)
22. [Source index](#23-source-index)

## 2. Product and terminology

The main hierarchy is a workspace containing teams and boards. Boards contain groups, columns, items, and subitems. Column definitions describe a board's structure; separate item-column value records hold each task's data.

| Term | Meaning in this application |
| --- | --- |
| Workspace | Organization-level container, with its own membership, roles, booking key, and booking form. |
| Team | A collection of workspace members; can organize boards and designate a board to receive bookings. |
| Board | A configurable work surface with ownership, visibility, memberships, groups, and typed columns. |
| Group | An ordered section within a board, such as Backlog or Completed. |
| Item | A task with identity, title, description, position, and optional cover and booking reference. |
| Subitem | An item whose `parentItemId` points to another item. It uses the board's column model. |
| Column | A board-specific field definition, including type, position, width, and type-specific settings. |
| Column value | A typed value associated with one item and one column. |
| Status role | The semantic meaning of a status label: done, stuck, or progress. |
| Linked item | A separate item on another board connected through selective field synchronization. |
| Asset | A structured deliverable line on an item, with quantity, assignees, due date, and completion. |
| Tracker | A lightweight workbook containing ordered sheets of typed cells and section rows. |
| Update | Depending on context, either a comment in an item's Updates tab or a quiet notification delivery class. |
| Task Allocation | The built-in, administrator-only board receiving bookings without a valid direct destination. |
| Board/item share | A read-only link to a board or individual task, with public or active-member access, optional password and expiry. |
| Stakeholder portal | One workspace-wide reading and booking link; stakeholder and time filters organize the published requests. |
| Booking service | A configured kind of work, with its own brief questions and optional receiving team. |
| Dashboard | Derived tasks, asset units, estimated effort, demand, and named workload; preferences, output rates and share settings are stored separately. |
| Invitation | A token-based onboarding link for a pending workspace member. |

### Main user journeys

- **Team member:** sign in, find a board or My Work assignment, update fields, discuss a task, track its assets, and review notifications.
- **Manager:** organize boards and groups, assign people, review workload and progress, and allocate incoming work.
- **Stakeholder:** open a booking link, submit a brief and deliverables, and receive a reference for follow-up.
- **Workspace administrator:** manage people, invitations, system entities, booking configuration, and workspace settings.
- **Share-link reader:** open a board or task link, satisfy member/password gates when configured, and inspect the scoped content.

These journeys use different access mechanisms. Booking keys, board/item/dashboard share tokens, portal tokens and onboarding tokens are separate credentials for separate purposes.

## 3. Technology and repository map

### Runtime and packages

Use the repository's declared **Node.js `22.x`** engine. The package is private and named `rmit-streamline`.

| Responsibility | Implementation |
| --- | --- |
| Application framework | Next.js `16.3.4`, App Router |
| UI runtime | React and React DOM `19.2.8` |
| Language | TypeScript `^5.9.0` |
| Styling | Tailwind CSS `^4.3.3`, CSS tokens, animation utilities |
| UI primitives | Radix UI, shared wrappers in `src/components/ui` |
| Icons, toast, search dialog | Lucide, Sonner, cmdk |
| Remote-state cache | TanStack Query `^5.102.8` |
| Board row virtualization | TanStack Virtual `^3.14.11` |
| Client UI state | Zustand `^5.0.15` |
| Browser persistence | IndexedDB through `idb` `^8.0.3` |
| Shared backend | Supabase JS `^2.115.0`, Postgres, Auth, Realtime, Storage |
| Rich text | Tiptap `^3.31.3`, including mentions and placeholder extensions |
| Forms | React Hook Form, resolver adapters, Zod |
| Drag and drop | dnd-kit core, sortable, modifiers, and utilities |
| Dates | date-fns and react-day-picker |
| Excel files | ExcelJS `^4.4.0` |
| Unit/component testing | Vitest, happy-dom, Testing Library, fake-indexeddb |
| Browser testing | Playwright |
| Database scripts | `postgres`, Node.js scripts, `tsx` for TypeScript seed scripts |

These are declared dependency versions or ranges, not a claim that every machine has the same resolved installation. `package-lock.json` controls reproducible npm installs.

### Directory responsibilities

| Path | Responsibility |
| --- | --- |
| `src/app` | App Router pages, layouts, providers, styles, and HTTP route handlers. |
| `src/components/layout` | App shell, sidebar, menus, and loading layout. |
| `src/components/shared` | Reusable rich text, inline editing, avatars, icons, colors, and state displays. |
| `src/components/ui` | UI primitives such as dialogs, buttons, inputs, popovers, and menus. |
| `src/domain` | Domain types, value unions, constants, and pure helpers. |
| `src/data/repositories/index.ts` | Shared persistence interfaces. |
| `src/data/local` | IndexedDB schema, connection lifecycle, and repositories. |
| `src/data/supabase` | Supabase repositories, row conversion, error handling, and HTTP transports. |
| `src/data/memory` | Read-only repositories backed by a public-board payload. |
| `src/data/seed` | Deterministic demo entities, extra content, history, trackers, and seed application. |
| `src/services` | Use-case orchestration and domain transformations. |
| `src/features` | Product screens, feature components, hooks, and contexts. |
| `src/server` | Server-side booking, sharing, onboarding, validation, and HTTP support. |
| `src/lib` | Configuration, dates, routes, permissions, IDs, rich text, auth utilities, and synchronization. |
| `src/stores` | UI preferences, per-board interaction state, and version-check state. |
| `supabase/migrations` | Ordered schema/data migrations. |
| `supabase/policies` | Ordered RLS policies and helper-function replacements. |
| `scripts` | Migration, seed, setup, user administration, and Supabase test runners. |
| `tests/unit` | Unit and component regression tests. |
| `tests/e2e` | Browser workflows, provider smoke tests, and deployment smoke tests. |
| `Test_prompts` | QA prompts and historical QA notes; not the executable test harness. |

`tsconfig.json` enables strict checking, `noUncheckedIndexedAccess`, and `noImplicitOverride`. Imports beginning with `@/` resolve to `src/`.

## 4. Architecture and request flow

### Normal application flow

```text
App Router page/layout
  -> feature screen/context
  -> feature hook and TanStack Query cache
  -> service
  -> repository interface
  -> IndexedDB or Supabase implementation
```

Pages are generally entry points into feature modules. The feature layer owns interaction and rendering. Services own use cases that span several entities. Repositories provide persistence in domain types.

The composition root is `src/features/data/data-context.tsx`. It resolves configuration, constructs repositories, creates services, and creates the corresponding auth provider. `useServices()` exposes this graph to features.

`src/services/index.ts` constructs services in dependency order. A shared `NotificationService` is supplied to the services that emit notifications. `ItemLinkService` is shared with items and comments. Booking receives workspace, item, link, asset, and notification services. This makes booking reuse the normal business behavior instead of implementing another task subsystem.

### Provider selection

`createRepositories()` in `src/data/provider.ts` chooses between local and Supabase persistence. Both expose the same `Repositories` contract. Switching providers selects another store; it does **not** copy existing browser data into Postgres or vice versa.

The memory implementation is a specialized read-only adapter for public board rendering. It is not a third configurable workspace backend. It serves a bounded payload, returns empty results outside that payload, rejects writes, and ignores incidental visit/read markers that public visitors cannot persist.

### Application providers

`src/app/providers.tsx` composes QueryClient, local synchronization, data, auth, tooltips, theme synchronization, and toast rendering. Query defaults are:

| Setting | Value |
| --- | --- |
| `staleTime` | 30 seconds |
| `gcTime` | 5 minutes |
| Query retry | 1 |
| Refetch on window focus | Disabled by default |

Individual feature hooks can override these defaults. Mutation failures are logged centrally, while feature-specific mutation paths supply user-facing errors.

### Boundaries to preserve

Use repository interfaces and services for normal task data. Keep pure mapping, formatting, and aggregation in modules that do not require a browser or a database. Use the shared permission helpers rather than copying role logic into components.

The architecture is a convention with some explicit exceptions: avatar and cover upload helpers access Supabase Storage directly; some feature reads use `services.repos`. Do not interpret the layering description as a claim that the code has no direct provider-aware paths.

Server-side booking and sharing route the ordinary Supabase repositories through the service-role client. `routeRepositoriesThrough()` uses a module-level override. It is intended for server use and must not be invoked in browser code. Any future change to per-request clients needs to account for that shared state.

## 5. Configuration and local development

### Configuration behavior

`src/lib/config.ts` is authoritative:

1. Trim and lowercase `NEXT_PUBLIC_DATA_PROVIDER`.
2. Select local mode only when its value is exactly `local` after normalization.
3. Otherwise select Supabase.
4. If the Supabase URL or anon key is absent, log a warning and fall back to local mode.

An unknown provider string therefore follows the Supabase branch; it does not produce a configuration validation error. A successful app startup is not proof that it is using the intended backend.

### Environment variables

| Variable | Scope and purpose |
| --- | --- |
| `NEXT_PUBLIC_DATA_PROVIDER` | Browser-visible provider choice; `local` or `supabase`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe project key; row authorization depends on RLS and the user session. |
| `NEXT_PUBLIC_SUPABASE_REGION` | Optional human-readable backend region for the About UI. |
| `SUPABASE_DB_URL` | Server/script-only Postgres connection URI for migrations and seed operations. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged key for onboarding, public booking, public sharing, and administrative seed operations. |
| `SKIP_DB_MIGRATE` | Set to `1` to bypass the migration runner. |
| `SEED_PASSWORD` | Demo account password override used by seed/test tooling. |
| `ADMIN_PASSWORD` | Seed administrator password override. |
| `SEED_APP_URL` | Base URL used when the seed prints invitation links. |
| `ADD_USER_PASSWORD` | Alternative password input for `scripts/add-user.mjs`. |
| `E2E_BASE_URL` | Deployed site target for deployment smoke tests. |
| `E2E_EMAIL`, `E2E_PASSWORD` | Smoke-test sign-in overrides. |
| `E2E_PROVIDER`, `PW_PROVIDER` | Supabase test gating and dev-server provider selection. |

Build identity variables are described in section 18. Do not place privileged values in variables prefixed with `NEXT_PUBLIC_`.

### Local-only development on Windows

From the repository root, with Node.js 22 available:

```powershell
npm ci
$env:NEXT_PUBLIC_DATA_PROVIDER = 'local'
$env:SKIP_DB_MIGRATE = '1'
npm run dev
```

The normal development URL is `http://localhost:3000`. The environment assignments above affect the current PowerShell session. Persistent project configuration can instead be placed in `.env.local`, using `.env.example` as the field reference.

The migration skip is explicit because `npm run dev` has a `predev` hook. Selecting local data does not itself disable migrations when a database URL is configured. The same issue applies to the `prebuild` hook.

`.npmrc` contains `legacy-peer-deps=true`. Vercel also installs with that option. Preserve this repository setting when reproducing installs.

### First local session

Opening a local repository lazily initializes IndexedDB and seeds it when the `meta` store lacks `seededAt`. The familiar seed includes the RMIT workspace, creative teams, campaign boards, tasks, values, and collaboration records. The seed source is the reliable place to check exact current entities.

The documented local walkthrough starts with Danh Nguyen (`danh@rmit.local`) and workspace `/workspace/rmit`. Local sign-in allows active demo users to enter without a password; pending onboarding and deactivated-user checks still apply.

Local data belongs to the browser profile and origin. `localhost:3000` and `localhost:3100` have separate browser storage. Another browser, private window, device, or origin does not automatically receive the same local workspace.

## 6. Routes and server endpoints

Use `src/lib/routes.ts` for application links. Board and workspace slugs are distinct from entity IDs.

### Page routes

| Route | Purpose |
| --- | --- |
| `/` | Root entry point. |
| `/login` | Sign-in screen. |
| `/join/[token]` | Public onboarding screen. |
| `/book/[slug]/[key]` | Public stakeholder booking wizard authorized by the workspace key. |
| `/book/[slug]` | The same booking wizard for signed-in workspace members. |
| `/share/[token]` | Public read-only board. |
| `/share/item/[token]` | Read-only individual task share. |
| `/portal/[token]` | Unified workspace stakeholder portal with stakeholder, range and grouping controls. |
| `/portal/[token]/book` | Portal booking wizard, retaining the chosen stakeholder through `?for=`. |
| `/workspace/[workspaceSlug]` | Workspace home. |
| `/workspace/[workspaceSlug]/boards/[boardSlug]` | Board and selected view. |
| `/workspace/[workspaceSlug]/boards/[boardSlug]/archive` | Paginated archived tasks, detail, restore and delete actions. |
| `/workspace/[workspaceSlug]/browse` | Phone directory of teams, boards, favourites and trackers. |
| `/workspace/[workspaceSlug]/more` | Phone navigation to less frequent destinations and account controls. |
| `/workspace/[workspaceSlug]/my-work` | Assigned work across boards. |
| `/workspace/[workspaceSlug]/inbox` | Notifications and quiet updates. |
| `/workspace/[workspaceSlug]/dashboard` | The live delivery dashboard across every board the reader can see. |
| `/dashboard/[token]` | Public, full-screen, read-only dashboard behind a share token. |
| `/workspace/[workspaceSlug]/book` | Stakeholder Portal management and form editor for administrators; other members redirect to `/book/[slug]`. |
| `/workspace/[workspaceSlug]/members` | Member directory and administration. |
| `/workspace/[workspaceSlug]/people/[userId]` | Person profile. |
| `/workspace/[workspaceSlug]/messages` | Direct-message threads. |
| `/workspace/[workspaceSlug]/teams/[teamId]` | Team page. |
| `/workspace/[workspaceSlug]/trackers` | Tracker collection. |
| `/workspace/[workspaceSlug]/trackers/[trackerId]` | Tracker and selected sheet. |
| `/workspace/[workspaceSlug]/settings` | Workspace settings. |

Relevant query parameters are `view` and `item` on boards, `item` on archives, `task`, `view`, `for`, `range`, and `group` on portals, `sheet` on trackers, `to` on messages, `next` on login, and `section` plus `guide` on settings. Portal task deep links use `task`, not the internal board's `item` parameter. Settings `section=rates` displays Lists.

Search - both a board's own box (`matchesSearch`) and the command palette (`SearchService`) - matches an item's booking code as well as its name, with the hyphen optional, so `TA-7441`, `ta7441` and `7441` all find the same task. The palette shows the code it matched on. `routes.board()` omits `view=table`, the default view. An `item` deep link allows a task panel to reopen after refresh.

### HTTP endpoints

| Endpoint | Methods | Behavior and access |
| --- | --- | --- |
| `/api/version` | GET | Reports server build identity. |
| `/api/invitations` | POST | Adds a pending member; requires an active workspace administrator. |
| `/api/invitations/regenerate` | POST | Renews an invitation for a pending member. |
| `/api/invitations/cancel` | POST | Cancels a pending invitation/membership through the onboarding service. |
| `/api/invitations/reinitiate` | POST | Starts onboarding again for an existing member. |
| `/api/join/[token]` | GET, POST | Previews an invitation, then completes profile/password setup. |
| `/api/book/[slug]` | GET, POST | Loads a booking form or creates a booking using a valid key or active-member session. |
| `/api/share/[token]` | GET, POST | GET reports the access gate; POST returns the board after password validation. |
| `/api/share/item/[token]` | GET, POST | Gate and scoped task payload; member-only links also verify an active membership in the task's workspace. |
| `/api/dashboard/[token]` | GET, POST | GET reports the dashboard link's gate; POST returns the trimmed workspace snapshot after password validation. |
| `/api/portal/[token]` | GET | Reports the unified portal gate; legacy department links report replacement/revocation. |
| `/api/portal/[token]/board` | POST | Synthetic board for the admitted workspace, narrowed by stakeholder and range. |
| `/api/portal/[token]/tasks` | POST | Cursor-paged requests and totals for the selected scope; search spans all dates. |
| `/api/portal/[token]/tasks/[itemId]` | POST | One request, after checking it belongs to this portal. |
| `/api/portal/[token]/book` | PUT, POST | PUT loads the booking form behind the gate; POST submits, idempotent on a submission key. |
| `/api/portal/[token]/comments` | POST | Staff-only update; re-checks the gate, the portal scope and a board seat. |
| `/api/portal/[token]/assets` | POST | Staff-only deliverable edit; also verifies the asset belongs to the named item. |

Dynamic handlers shown in the implementation use promised route parameters and await them. The repository's `AGENTS.md` requires reading the relevant installed Next.js guides in `node_modules/next/dist/docs/` before writing Next.js code; do not substitute assumptions from older releases.

`src/server/http.ts` wraps handlers. Explicit `HttpError` status codes are preserved, Zod failures become HTTP 400, malformed JSON becomes HTTP 400, and unhandled errors are logged and returned as a generic HTTP 500. Standard JSON responses use `Cache-Control: no-store`.

Booking POST accepts a body containing `key` and `request`; the key is a query parameter for GET. The share password is sent in a POST body, not in the URL. Share failures additionally expose a reason used by the gate UI; wrong passwords produce 401 and unavailable links produce 404 in the payload-loading path.

## 7. Domain and persistence

### Principal entities

| Domain | Key records and relationships |
| --- | --- |
| Identity | User/profile, auth session, workspace membership, invitation. |
| Organization | Workspace, team, team membership. |
| Board | Board, board membership, favourite, visit, group, column, public share. |
| Task | Item, parent item, typed column value, item link, asset, read marker. |
| Collaboration | Comment, activity, notification, notification preferences, direct message. |
| Booking | Published workspace form, editor draft, service types and brief blocks, named templates, saved blocks, request and receipt. |
| Lists/reporting | Workspace asset types, stakeholder groups, output rates, dashboard snapshot and share. |
| Tracker | Tracker/workbook, ordered sheet, column definition, row, primitive cell value. |
| Stakeholder portal | Durable department identity; one unified portal per workspace in `department_portals` with null `departmentId`; request provenance and submission claims. Legacy per-department credential rows are retained but refused. |

Domain types use camelCase. SQL rows normally use snake_case. `src/data/supabase/rows.ts` performs conversion. JSON structures such as column settings, typed cell payloads, and tracker documents preserve their application shapes.

### Repository contracts

`Repositories` exposes `users`, `workspaces`, `onboarding`, `teams`, `boards`, `items`, `links`, `trackers`, `comments`, `itemAssets`, `workspaceLists`, `stakeholderPortals`, `bookingTemplates`, `bookingSavedBlocks`, `boardShares`, `itemShares`, `dashboardShares`, `itemReads`, `messages`, `activities`, `notifications`, `notificationPreferences`, and `admin`. Workspace-wide link reads use `links.listByWorkspace()`; targeted link reads chunk IDs and page results instead of constructing one oversized URL.

A change to a contract can affect local repositories, Supabase repositories, the public memory adapter, service composition, and test fixtures. `NotFoundError` represents required missing entities; optional lookups return `null` where their contracts specify it.

### Local database

The IndexedDB database is named `rmit-streamline`, at schema version **15**. `LocalConnection` caches one opening promise per connection instance and injects a `getDb` function into repositories.

The schema covers users, workspaces, workspace members, invitations, local credentials, teams and memberships, boards and memberships, favourites, groups, columns, items, values, links, trackers and sheets, comments, assets, booking templates, shares, read markers, activity, notifications and preferences, direct messages, board visits, and metadata.

Incremental IndexedDB upgrades added links in v2, trackers in v3, messages in v4, notification preferences in v5, onboarding/credentials in v6, read markers in v7, assets in v8, booking templates in v9, board shares in v10, dashboard shares in v11, workspace lists in v12, item shares in v13, four portal stores in v14, and booking saved blocks in v15. Workspace JSON fields such as form drafts and output rates do not require separate object stores. Upgrade callbacks log when another open tab blocks progress.

### Supabase database

`profiles.id` corresponds to `auth.users.id`. The initial migration creates the profile-creation trigger and base relational schema. Later migrations extend that schema. Do not reconstruct the current database from `0001_initial_schema.sql` alone.

Database triggers enforce relationships such as group/board consistency and item-column board consistency. Item-asset migrations add their own board and assignee-related maintenance. RLS provides server-side access enforcement.

`src/data/supabase/client.ts` centralizes PostgREST response handling. Supabase returns many errors in a response object rather than rejecting automatically; `unwrap`, `unwrapList`, `unwrapMaybe`, and `assertOk` convert those responses into consistent domain-facing results or exceptions. Long ID lists are chunked with `ID_CHUNK = 200`.

### Export and reset boundaries

Local `exportAll()` produces an envelope with `format: "streamline-export"`, `version: 1`, an export timestamp, and all stores. It is a full local-store export, including the onboarding/credential stores; it is not just a selected board export.

Local `importAll()` clears existing stores before loading supplied rows. Local `resetToSeed()` clears the database contents and reseeds them. Both replace local state rather than merging it.

The Supabase admin repository rejects reset, whole-database export, and whole-database import with `NotSupportedError`. Postgres backup/restore and the repository's database scripts are separate operational paths. Tracker `.xlsx` export is independent of these full-database operations.

## 8. Authentication and onboarding

### Local authentication

`LocalAuthProvider` stores its session under `streamline.local-session` in localStorage. It resolves the account by normalized email, rejects missing/deactivated users, and rejects users whose memberships indicate pending onboarding.

If a password is supplied and local onboarding stored a credential, the password is checked. Omitting a password remains allowed for local demo sign-in. This provider is a development convenience, not production authentication.

The provider listens for storage changes so sign-in/out changes can be observed by other tabs on the same origin. Session restoration rechecks that the user still exists and is eligible under its local checks.

### Supabase authentication

`SupabaseAuthProvider` uses `signInWithPassword`, session retrieval, sign-out, and auth-state subscriptions from the Supabase client. Passwords are required. Domain-facing errors use `AuthError`, with sign-in wording normalized by `src/lib/auth/auth-messages.ts`.

Workspace access is additionally governed by membership and RLS. A successful Auth session and an active workspace membership are related but different facts.

### Invitation lifecycle

An administrator adds a person through the members feature. The Supabase server path verifies the bearer token with Auth and verifies active OWNER/ADMIN membership in the requested workspace. It can create an Auth account without a password, obtain its profile, create an `INVITED` membership, and create an invitation token.

The join screen previews the token without requiring a session. Completion validates the link and input, sets the password through the Auth Admin API, updates profile data, and activates the membership. The product returns a link for the administrator to distribute; the onboarding workflow does not automatically send an email.

New invitations have a 30-day lifetime, and the shared password minimum is eight characters. Invitation status distinguishes PENDING, ACCEPTED, EXPIRED, REVOKED, and INVALID. Unlike the date-only board-share expiry, invitation expiry uses an exact timestamp and expires when that timestamp is reached. Regenerating a link replaces the old credential rather than extending that old URL.

Regeneration applies to pending members. Reinitiation is a separate path for someone who has already completed onboarding; the server rejects self-reinitiation. Cancellation can remove membership and related account state according to the server's existing-account checks. Read `src/server/onboarding.ts` before treating cancellation as merely hiding a link.

Pending and deactivated people remain resolvable for history. `WorkspaceProvider` separately exposes `activeUsers` for assignment, mentions, and messaging: members must be ACTIVE and their profiles must not be deactivated.

## 9. Authorization

### Workspace and team roles

Workspace roles are OWNER, ADMIN, MEMBER, and GUEST. Membership states are ACTIVE, INVITED, and DEACTIVATED. Team roles are LEAD and MEMBER. Board roles are OWNER, EDITOR, and VIEWER.

`buildPermissionContext()` resolves the active workspace role, team IDs, explicit board roles, and user ID. OWNER and ADMIN count as workspace administrators. Administrators manage workspace settings and people. Non-guest active workspace members can create boards and edit trackers. Team-management helpers allow workspace administrators or members of that team.

### Effective board role: exact precedence

`boardRoleFor()` applies these checks in order:

1. If the board is a system board and the user is not a workspace administrator, deny access.
2. If no active workspace role exists, deny access, including ownership and explicit seats.
3. If the user is the literal board owner, return OWNER.
4. If an explicit board membership exists, return its role.
5. If the user is a workspace administrator, return EDITOR.
6. For WORKSPACE visibility, return VIEWER for a non-guest; guests receive no inherited role.
7. For TEAM visibility, return EDITOR if the user belongs to the board's team; otherwise deny.
8. For PRIVATE visibility, deny inherited access.

Policy 0014 introduced membership-before-ownership. The current SQL implementation is `supabase/policies/0015_boards_select_without_reread.sql`: `private.board_role_for()` receives board fields directly, while `private.board_role()` delegates for existing rows. The board SELECT policy avoids rereading the new row during `INSERT ... RETURNING`, fixing application board creation under RLS. Policy 0008 is historical, not the final definition.

| Situation after earlier precedence checks | Result |
| --- | --- |
| Ordinary member sees a workspace-visible board | VIEWER |
| Team member sees that team's TEAM-visible board | EDITOR |
| Explicit VIEWER membership | VIEWER, even if a later rule would grant editing |
| Guest without ownership or explicit membership | No visibility-derived access |
| Private board without ownership, membership, or admin access | No access |
| System board and non-admin | No access, even if ownership/membership would otherwise help |

Team membership alone does not add an extra editing rule to a WORKSPACE-visible board: that branch returns VIEWER. Board **type** (`MAIN`, `PRIVATE`, `SHAREABLE`) is not the same property as board **visibility** (`WORKSPACE`, `TEAM`, `PRIVATE`), and public share links are managed separately.

`canEditBoard()` requires effective OWNER or EDITOR. `canManageBoard()` allows effective OWNER or a workspace administrator. `canDeleteBoard()` checks literal ownership or workspace administration, while `BoardService` separately protects system boards against archive/delete operations. Do not rely on a single helper to describe every operational constraint.

### Membership subtleties

Deactivation removes the active workspace role before ownership or explicit board seats can grant access. `canDeleteBoard()` also requires an active workspace role. Existing ownership and seat records can remain for history without overriding that rule. Verify deployed SQL through 0015 when testing this behavior against Supabase.

Comment editing is author-only in the shared helper. Comment deletion allows the author or workspace administrator. SQL policies also determine whether the caller can reach and operate on the underlying record.

### View as

An administrator can preview a colleague's visibility through `WorkspaceProvider`. The effective display permissions change, but the actual signed-in user remains `currentUser`, and writes retain that real actor. `ownPermissions` preserves the signed-in person's permissions separately.

The preview ID uses sessionStorage key `streamline.view-as`; it survives reload in the same tab. It is a UI preview, not a Supabase login as the colleague, and is not a substitute for testing RLS using that person's authenticated session.

### RLS and privileged endpoints

Browser Supabase operations use the signed-in user's session. Privileged server routes use the service-role client and therefore must enforce their own token/admin checks and output scope. Public access to booking or sharing does not mean anonymous PostgREST access to arbitrary workspace tables.

Keep TypeScript permission rules and SQL helpers aligned when changing authorization. Apply all policy files in order before judging backend behavior.

## 10. Boards, columns, and views

### Board lifecycle

`BoardService` supports template-based creation, metadata updates, slug changes, archive/restore, deletion, duplication, favourites, membership management, group operations, and column operations. Built-in templates live in `src/features/boards/templates.ts`.

Boards have a workspace, optional team, owner, type, visibility, visual identity, description, archive marker, and optional system marker. Groups have order and collapse state. Items and columns have their own positions; sorting a rendered view and changing stored positions are separate operations.

The built-in Admin team and Task Allocation board are recognized by `system` values, not their names. They can be renamed. Administrative workspace loading calls `ensureSystemEntities()` to create/repair required entities, the booking key, expected columns, and related palettes.

### Column types at the committed snapshot

| Type | Stored meaning |
| --- | --- |
| `TEXT` | Short string. |
| `LONG_TEXT` | Longer text payload. |
| `STATUS` | Label ID in that column's status settings. |
| `PERSON` | Array of user IDs; settings control multiple assignment. |
| `DATE` | Nullable ISO date. |
| `TIMELINE` | Nullable start and end dates. |
| `NUMBER` | Nullable number with unit/decimal display settings. |
| `PRIORITY` | Label ID in that column's priority settings. |
| `CHECKBOX` | Boolean checked state. |
| `LINK` | URL and optional display text. |
| `TAGS` | Array of tag names. |
| `SIZE` | Nullable XS, S, M, L, or XL. |
| `ASSETS_RECAP` | Derived line, quantity, type, people, next-due, and overdue figures. |
| `DEPENDENCY` | Array of item IDs on the relevant board. |
| `STAKEHOLDER` | Nullable stakeholder-group name (`group`), selected from the workspace list. Used for portal publication and reporting; distinct from generic TEXT/TAGS. |

`FILES` is absent from the current TypeScript column union. Historical attachment documentation should not be used to add a current Files-column workflow.

`emptyValueFor()` and `isEmptyValue()` centralize empty-value behavior. Numeric zero is a populated NUMBER value; an unchecked checkbox counts as empty for the domain helper. Avoid truthiness checks that erase legitimate values.

### Labels and tags

Status labels carry semantic roles through `doneLabelIds`, `stuckLabelIds`, and `progressLabelIds`. Completion depends on those IDs, not the visible word “Done.” Stuck styling also depends on semantic role. Renaming a label should preserve its intended role.

Tags store names rather than palette IDs. Renaming a tag therefore requires remapping existing tag values. Label definition synchronization and column renaming across linked boards have dedicated service logic; a UI-only label rename is insufficient.

### Seven views

| View | Main use |
| --- | --- |
| Main Table | Grouped task rows, subitems, typed cell editing, selection, and bulk actions. |
| Kanban | Lane-based cards, grouping, and drag/drop movement. |
| Timeline | Work spans on a date axis, with undated work handled separately. |
| Calendar | Date-oriented work in month/week layouts. |
| Gantt | Hierarchy, dates, progress, milestones, and dependency visualization. |
| Workload | Assignments distributed across people and time periods. |
| Chart | Aggregated counts, numeric sums, or asset-unit metrics across selected categories. |

These are views over the same task data. The board model, filtering helpers, view settings, and aggregate functions translate one snapshot into the appropriate display. Editing a card or date should flow through the same mutation/service paths used by the table.

### Filtering and sorting

Per-board UI state includes search, person/status/priority/group/tag/date filters, sort, selection, expanded items, and Kanban lane override. Filter dimensions combine as requirements; selections within person and tag filters use matching-any semantics.

The pure `matchesSearch()` helper matches item names and booking references case-insensitively, including references without a hyphen. The command palette is a separate search surface with the same reference support. My Work and archive search have their own rules. The primary due date is the first DATE column's populated value, falling back to the first TIMELINE column's end. The “this week” filter also includes today.

Column sorting uses typed values: labels follow palette rank, people resolve to names, and empty values sort last. SIZE has its defined XS-to-XL order. The underlying stored item position is not the same as the active sort order.

Board filters/search/selection are transient Zustand state. Remembered view selection is persisted separately, using both browser storage and board-visit data.

### Large tables and archived tasks

`GroupRows` in `virtual-rows.tsx` uses TanStack Virtual above **25 rows** per group, measuring against the shared table scroll container. During drag operations it renders the full group so drag targets exist. This bounds rendered rows, not the size of the ordinary board snapshot.

Archive is a separate route, `/workspace/<slug>/boards/<boardSlug>/archive`, not an eighth board view. `loadArchivePage()` fetches one page of archived top-level tasks, then their values and links, with an exact filtered count. Page sizes are **10, 25 or 50**, default **50**. Ordering is archived timestamp descending by default, or name, with an ID tie-break. Search matches name/reference substrings; unlike normal board reference search, it does not normalize away the hyphen. Group, person, status, priority and tag filters run over the whole archive before paging. Date-bucket filters are absent.

The archive has read-only cells and task details. Editors on an active board can restore or permanently delete selected items. `?item=` can fetch a same-board detail outside the current page without adding it to the page count. Page/filter choices are component state; the route and focused item survive refresh, not every pager selection.

Archiving sets `archivedAt`; restoration clears it and retains original group/position. Activity records identify archive/restore actions. For selected linked items the dialog offers `cascade` (also archive directly connected counterparts) or `break` (unlink selected items before archiving). Without an explicit policy the service preserves links. The current impact collection visits direct links, not an arbitrary transitive closure; do not promise that selecting one end archives an entire long chain. Archive/restore patch the selected item IDs and do not implicitly rewrite all descendants' archive timestamps.

### Workspace lists and built-in help

Settings → Lists manages ASSET_TYPES and STAKEHOLDER_GROUPS, defaulting from domain definitions where no stored list exists. Options are names/colors/order. Saving replaces list rows, so their IDs are not durable identities. Renames rewrite matching asset types or STAKEHOLDER cells; removal can preserve historical words, replace them or clear them. Department reconciliation maintains separate durable stakeholder IDs. `list-draft.ts` tracks edits and rename intent; output rates are edited alongside asset types and stored on the workspace.

Settings → Documentation is a separate in-app user guide, backed by `guide-content.ts` and `documentation-section.tsx`. It includes stakeholder/admin/manager quick starts, searchable articles, copy and Markdown download. Deep links use `?section=documentation&guide=<articleId>`. It is not generated from this technical knowledge base; maintain both when changing user workflows.

## 11. Items, links, and assets

### Item identity and lifecycle

An item has a stable entity ID, board ID, group ID, optional parent, name, description, position, creator, timestamps, archive marker, optional cover, and optional booking reference. `ItemService` orchestrates create, rename, description/reference changes, typed value changes, moves, archive/restore, deletion, and duplication.

`loadBoardSnapshot()` reads the board, groups, columns, items, values, and links. Item-panel concerns such as comments and assets also have dedicated queries. Do not assume the board snapshot contains every detail rendered in the panel.

Move and delete operations need to account for subitems and associated values. Use the service/repository implementation rather than updating one item row in isolation. Activity and notification side effects vary by operation; not every metadata write follows the same fan-out path.

### Booking references

References are separate from UUID identity, capped at seven characters, and normalized to trimmed uppercase by `normaliseItemReference()`. Ordinary newly created tasks need not have a reference. A new booking creates one referenced task; deliverable lines no longer produce additional referenced subitems.

Current `bookingReference()` calculates a deterministic FNV-1a-derived short hexadecimal code, prefixed with `TA-`. It is not a sequence number or security credential. Because the displayed suffix is short, it should not replace the item ID as a unique database key.

Migrations 0021–0023 added and backfilled references. Migration 0023 uses an MD5 fragment for the specific legacy references it rewrites, so historical database references are not guaranteed to be reproducible by the current runtime helper. Display stored references instead of recomputing every row's code.

### Item linking

Links connect separate items on different boards within one workspace. Endpoint IDs are normalized into a sorted pair so the reverse pair is not a second link.

Validation rejects self-links, missing items/boards, parent-to-own-subitem links, same-board links, cross-workspace links, and existing direct links. It also checks the combined connected set so a link chain cannot contain two different items from the same board.

Links synchronize name, description, reference, compatible column values, and access to the Updates conversation, subject to exclusions. Exclusion keys include `name`, `description`, `reference`, `updates`, and column IDs from either side.

### Column mapping across linked boards

`src/services/item-link-sync.ts` applies these rules:

1. Exclude DEPENDENCY and ASSETS_RECAP from generic synchronization.
2. Match normalized column names when types are compatible.
3. Treat TEXT and LONG_TEXT as compatible text payloads.
4. For STATUS, PRIORITY, PERSON, DATE, and TIMELINE, use the single-column fallback when its source/remaining-target conditions identify a counterpart.
5. Report unmapped source columns and target-only columns.

Status and priority values translate by normalized label name, not by copying an ID from another board. A missing target label produces a skipped translation. A single-person destination retains only the first source user. Dependencies remain local to their board, and asset recaps remain derived from each item's own assets.

Propagation traverses connected links and tracks the records involved. Use that service rather than recursively calling public mutation methods, which could duplicate activity or notifications and create loops.

### Shared discussions

Comments remain associated with their source item while the linked conversation can be read across the connected Updates chain. Excluding `updates` affects that conversation reachability. Historical `sharedId` support also exists for shared-comment identity. Do not implement synchronization by blindly copying the same comment onto every linked item.

### Assets

`ItemAsset` records a name, optional type, nullable quantity, multiple assignees, due date, completion timestamp, notes, order, creator, and item/board IDs. Assets support task-level deliverables without requiring a separate tracker workbook.

`recapAssets()` counts lines, quantities, distinct types, distinct assignees, unassigned lines, completed lines and quantities, next due date, and overdue lines. Null quantity counts as one. Completed lines do not contribute to overdue or next-due figures. Next due is the earliest outstanding date on or after today.

The compact recap formatter shows quantity and people, for example `14 assets · 2 PIC`; type counts still exist in the recap data. `ItemAssetService` updates cached ASSETS_RECAP values when asset lines change.

Allocation moves the existing item and its asset records to the receiving board and recomputes the recap. Generic linked-field synchronization still does not synchronize the asset-line list or ASSETS_RECAP values.

Assets also carry `previewUrl` and `artworkUrl` (Preview and Final artwork/FA), added in migration 0034. The shared asset composer is reused by item editing and booking. Service mutations record ASSET_ADDED, ASSET_UPDATED, ASSET_REMOVED, ASSET_COMPLETED and ASSET_REOPENED activity (migration 0025). Portal and dashboard projections exclude notes and both URLs; ordinary board and item shares carry their scoped asset records, so that exclusion does not apply to every share type.

### Covers and avatars

| Media | Processing | Supabase storage | Local storage |
| --- | --- | --- | --- |
| Item cover | Image source up to 3 MiB; WebP at quality 0.85; longest edge at most 1600 px. | Public `item-covers` bucket, `<itemId>/cover.webp`. | Data URL saved on the item. |
| Avatar | Image source up to 10 MiB; center-cropped square WebP at quality 0.82; at most 256 px. | Public `avatars` bucket, `<userId>/avatar.webp`. | Data URL saved on the user. |

Uploads use stable object paths with a cache-busting query parameter on the stored URL. Public bucket URLs do not inherit a private board's row visibility. Storage write policies and object availability must be checked separately from table RLS.

## 12. Booking and allocation

### Access paths

The same `BookingWizard` serves `/book/<slug>/<key>` for a public booking key, `/book/<slug>` for an authenticated member, and `/portal/<token>/book` through the portal gate. The in-app Stakeholder Portal destination is now an administrator management screen; members without management permission redirect to the standalone member form.

Generated booking keys contain 24 characters. The Supabase server checks the supplied key against the workspace. An explicitly invalid key is rejected rather than falling back to a session; a valid key permits public access. Without a key, the server requires an active workspace member and derives the actor from the verified session. Local mode runs directly against browser services and is a demo, not equivalent server authorization.

### Wizard and validation

The default sequence is **Details → Brief → Deliverables → Confirm**. Disabling the assets section removes Deliverables from the sequence. Details identifies the requester and service type; Brief changes with the selected service; Confirm reviews the assembled request before submission. The built-in services are Brand, Design and Production, configurable by administrators.

The current `BookingFormTemplate` is version **2**. It contains standard fields, services with optional team routing and sub-services, service-specific blocks, asset settings and confirmation wording. Requester name, email and department remain required; the title is also a locked standard field. Brief block kinds are `short`, `long`, `multi`, `single`, `link`, `separator`, and `text`. Single choice supports chips or a dropdown; text supports heading, subheading and body. Separators and text are not numbered questions.

Answers are their own `BookingAnswer` union (text, choice, link), not board `ColumnValue` records. The service validates against the live template, drops unasked answer IDs and unoffered sub-services, and recomposes the brief from the configured questions. It does not trust the caller's composed brief or team selection. The brief is stored together in the item description and compatible Brief column; the current form does not create one board column per custom question. Existing historical columns and answers are not removed by this change.

`bookingRequestSchema` and template-aware validation are in `src/services/booking.ts`. Asset lines are capped at 50; specified booking quantities are positive integers up to 9999. Each line can carry its own asset type and specification. Version-1 forms are adapted on read by `migrateLegacyTemplate()` to a General service preserving supported wording and questions; named templates are normalized on read without immediately rewriting their stored rows.

### Destination and created records

1. Resolve existing system entities, repairing them only when absent.
2. Resolve the selected service in the published form, then its configured active, non-system team in this workspace. A caller-supplied `teamId` does not override this.
3. Use that team's valid active, non-system receiving board in the same workspace; otherwise use Task Allocation.
4. Place the task in the first destination group by position, map compatible standard values and retain unmapped request details in the description.
5. Create **one task and its structured asset lines**. New bookings no longer generate duplicate asset subitems. Each asset uses its own type, or the sole request-level type as fallback, and inherits the requested due date.

The form proposes an item ID to preview its reference. The service honors it only if free and returns the actual reference in the receipt. The receipt includes task/board identity, destination slug, direct-team name when applicable, reference, timestamp and asset-line count. Active administrators receive TASK_BOOKED notifications according to their notification preferences.

Writes are multiple repository operations, not an enclosing database transaction. Portal submission claims add retry protection but do not make task/asset creation transactional; see section 13c for partial-failure boundaries.

### Allocation from Task Allocation

`BookingService.allocate()` **moves the original task** to an active non-system destination board in the same workspace. It keeps the item ID, reference, description and portal provenance. The request leaves the allocation queue; no linked copy or new provenance record is created.

Before moving, the service maps and translates the parent task's column values using the shared link-mapping helpers. Values without destination columns are dropped; the description retains the submitted brief. `moveToBoard()` carries subitems and asset records, removes incompatible old column values, and updates denormalized board IDs. Allocation restores translated parent values, recomputes the asset recap and writes ITEM_MOVED activity. Existing subitems move, but their old column values are not individually remapped by this service. These writes are also not one transaction.

Generic cross-board item linking remains a separate feature for deliberately mirrored work. Candidate search excludes the allocation queue; old linked allocations can still exist in historical data.

### Drafts, publishing and reuse

Workspace `bookingForm` is live; `bookingFormDraft` is work in progress. `getDraft()` falls back to the live form, `saveDraft()` saves only the draft, `discardDraft()` restores the editor to the live form, and `publishForm()` replaces the live form and clears the draft. `resetForm()` clears both overrides. Publishing the exact built-in default stores a null override so future built-in improvements remain available.

The editor supports service selection, brief-block editing/reordering, choice configuration, preview and explicit publishing. Named `booking_templates` include descriptions; saving a name again case-insensitively replaces it. `booking_saved_blocks` holds reusable individual blocks, also replaced by normalized name; inserting one into a brief creates a copy with a fresh block ID, not a live link to all inserted copies. Both have local/Supabase repositories and dedicated query keys. SQL 0038 adds form drafts/template descriptions; 0039 and policy 0016 add saved blocks; IndexedDB v15 adds the block store.

`booking-remember.ts` keeps requester name/email, the last five submitted bookings and an unfinished request in localStorage `streamline.booking`, scoped by portal or workspace. This is separate from the administrator's persisted form draft. It supports resuming, repeating and clearing browser-local details; it does not provide a shared server-side draft or submission ledger.

## 13. Public board sharing

A board has at most one share record, with a 22-character random token, enabled flag, PUBLIC/PRIVATE access, optional expiry date and salted password hash, creator and timestamps. New board and item links default to **PRIVATE**, meaning a signed-in active member of the relevant workspace. PUBLIC opens to a holder of the link who passes any password gate. This link access setting is separate from the board's visibility. Migration 0029 preserves older board links as PUBLIC.

GET reports the gate. POST checks token, enabled state, date expiry, member access where required and password before reading through the privileged server. PRIVATE requires workspace membership, not a separate edit seat on the source board, and grants read-only link access. Local share services supply a local-member stand-in; local tests do not prove the server membership check.

`refuseShare()` rejects when `expiresAt < today`, so the selected expiry day is inclusive. Disabling retains a token; regeneration replaces it; removing a share deletes its credential record. Board, item and dashboard passwords use `salt:hash` with one SHA-256 round from `password-hash.ts`; portal passwords use a different PBKDF2 scheme.

The board payload includes board metadata, groups, columns, active items, values, scoped assets and comments, up to 200 recent board activities, workspace name, expiry and referenced people. Cross-board links are excluded unless both endpoints are in the payload. The read-only memory adapter supplies the board UI through `ShareGuestProviders` and a dedicated QueryClient.

`toPublicUser()` now explicitly supplies ID, display name and avatar with blank/null values for email, job title, department, timezone, stakeholder group, working hours and other profile fields. It no longer spreads a complete user object. This does not redact contacts or other information typed into descriptions, columns, Updates, activity metadata or asset fields. Board sharing is broader than portal/dashboard projection.

Board and task share pages poll every **4 seconds** (`SHARE_REFRESH_MS`), stop interval refetching in background tabs and refetch on focus. `share-shell.tsx` holds common gate, theme, providers and readonly presentation.

## 13a. Individual task sharing

`ItemShareService` uses the same access/password/expiry model at `/share/item/<token>` and `/api/share/item/<token>`. `item_shares` and policy 0012 were added with migration 0029; local storage arrived in IndexedDB v13.

The payload contains the selected unarchived task, its direct subitems and their values, scoped assets/comments, up to 100 activities from the selected task, and sanitized referenced users. It still includes the source board metadata, groups and columns needed to render the panel. It supplies no item links and no sibling tasks. An archived or missing selected task cannot be loaded through its item share. Do not describe this as a metadata-free or field-redacted export.

## 13b. Workspace dashboard

The dashboard is now **one scrolling report**, rendered by `DashboardBody` in `views/overview.tsx`. It combines headline figures, year comparison and mix, demand/delivery breakdowns, current operations and named workload. The old Overview / Demand & Delivery / Resourcing tab constants and some comments remain in source, but `DashboardScreen` renders the combined body rather than those three tabs.

### Snapshot and reporting contracts

`DashboardService.loadSnapshot()` reads active boards available to the reader, their groups, columns, items (including archived items), values and assets, plus workspace output rates, teams, referenced users, stakeholder departments and scoped workspace links. `analytics.ts` builds facts; `metrics.ts` derives reporting contracts. The public loader uses the service role to load all active boards of the workspace before projection, not merely the administrator's currently visible subset.

- A delivery task is top-level work outside Task Allocation. Linked copies collapse deterministically to one representative. Archived **items** count in history; archived **boards** remain excluded, so archiving a whole campaign board still removes its history from this report.
- Asset units use `assetCount()` on deliverable lines; null quantity counts as one. Intake assets represent requests rather than duplicate delivered output.
- Stakeholder attribution prefers a STAKEHOLDER cell resolved through the department registry. Legacy department-like TEXT fields and requester profile hints can supply inferred attribution; missing attribution has an explicit Unknown bucket. Check `buildFacts()` for precedence when adding a new field.
- Periods are matched day ranges. Default reporting is created-date year-to-date against the same span of the previous year. Other controls support year, quarter, month and custom ranges. Partial periods are labelled; unreached months are not rendered as zero history.
- Missing history is Unavailable; a real zero baseline reports an absolute difference without a fabricated percentage. Due-date reports exclude and separately count undated work.
- Created and due are the supported reporting bases. A durable task-completion event and original committed deadline are not stored, so completed-date throughput and reliable on-time delivery remain unavailable.
- Current operations do not take the historical reporting period. Overdue, blocked and other figures can overlap. Archiving alone does not mark a task done; current operational calculations still use the task's status and date facts.

### Effort, workload and rates

The page-wide measure is **Tasks**, **Asset units**, or **Effort**. Effort is offered only when output rates exist; an old saved effort selection falls back to Tasks if rates disappear. Headline cards can also select the measure.

Rates live in `workspaces.asset_rates` and are edited beside asset types in Settings → Lists. A rate `{qty, every, per}` means `qty` outputs every `every` hours/days/weeks. `hoursPerUnit = every × unitHours / qty`; a working day is **8 hours**, a week **5 working days / 40 hours**. Effort sums units times this rate, matched case-insensitively by asset-type name. Unrated types contribute no estimated hours and coverage gaps are reported. Changing a rate recalculates historical estimates; no actual time-tracking records are written.

Workload shows associations per person, split by stakeholder group, in the selected measure and a 2/4/8-week window. A multiply assigned task contributes to each person's row; those rows are not additive unique-task totals. Unassigned work and former members with assignments are represented. Profile pages reuse the stakeholder split with a non-polling borrowed dashboard query. Output-rate estimates and profile working-hour fields are not a capacity/leave/commitment model; there is no reliable capacity percentage.

### Preferences and freshness

Preferences use `streamline.dashboard.v2`, keyed by `<userId>:<workspaceId>`, hydrated after mount. They include reporting period, comparison, measure, basis, team filter, workload weeks and stakeholder filter. Invalid team selections are dropped.

The internal snapshot safety refresh is **60 seconds**, with background polling disabled and focus refresh enabled. Realtime listens to items, values, assets, groups, columns, boards, teams, links, workspaces and workspace lists. Events coalesce for **2 seconds**, with at least **20 seconds** between invalidations scheduled by that realtime hook. These limits do not prevent explicit mutation invalidations or other refetch triggers. Borrowed profile queries have a 60-second stale time and no interval. Migration 0035 publishes workspace changes so output-rate edits can be observed.

### Public dashboard

One dashboard share exists per workspace, managed by workspace administrators, with an optional password and expiry. Its link is public-only at `/dashboard/<token>`, uses `/api/dashboard/<token>`, and refreshes every **60 seconds**. It renders the same combined report without callbacks that navigate into internal tasks and boards.

`publicDashboardSnapshot()` is an explicit projection, but it **does include named workload**: PERSON values, asset assignee IDs, output rates and user names/avatars travel. User projection also retains timezone, deactivation marker and timestamps; it is not an anonymous aggregate. It clears email, job title and department, omits working-hour/stakeholder-profile fields, replaces board owner/task creator identities, clears task descriptions and covers, and strips asset notes, Preview and Final artwork URLs. Allowed column types include STATUS, PRIORITY, DATE, TIMELINE, TAGS, SIZE, NUMBER, CHECKBOX, ASSETS_RECAP, STAKEHOLDER and PERSON, plus department-like TEXT. LONG_TEXT, LINK and DEPENDENCY are excluded. Board/task names, grouping metadata and permitted raw values remain in the payload.

Historical dashboard design reports describe earlier versions, including a people-free public snapshot and three tabs. Use current `dashboard.ts`, `DashboardScreen`, `DashboardBody` and regression tests as evidence for present behavior.

## 13c. Stakeholder portal

### One workspace link

The portal now has **one link per workspace**, `/portal/<token>`. Its credential admits the workspace's publishable request set; the stakeholder selector is a filter, not a department access boundary. Anyone admitted can select another stakeholder or All. It is not intended to isolate departments from each other.

The database table remains `department_portals`. A unified row has `department_id = null`; migration 0037 adds a partial unique index for one such row per workspace, disables enabled legacy department rows and bumps their credential versions. Services refuse every legacy row with a non-null department ID and report that the link was replaced. The migration does not automatically publish a new unified link: management creates one, initially disabled.

Administrators manage the single link, password, enabled state and presentation in Stakeholder Portal at `/workspace/<slug>/book`, alongside the form editor. `creativeTeamName` changes the portal's display identity without renaming the workspace or its slug. Ordinary members redirect to the member booking form.

### Department identity and publication scope

Settings → Lists remains the editing surface for stakeholder groups. List rows are replaced on save, so `stakeholder_departments` maintains durable IDs. Reconciliation uses the editor's explicit rename map: rename preserves identity, removal disables the old department, and later adding the same name creates a new department rather than reviving old provenance. Existing labels can still match an active department by name; provenance and label matching are distinct rules.

`scopeWithItems()` combines workspace STAKEHOLDER-labelled tasks with `portal_requests` provenance. It reads STAKEHOLDER by **column type**, not its display name, and matches group names trimmed and case-insensitively. A label takes precedence over provenance for stakeholder attribution. Without a label, provenance attributes the request to its still-active department. Disabled/unrecognized departments resolve to no active stakeholder; their eligible work may remain visible in All, so disabling a department is not a global portal revocation control.

Only unarchived top-level candidates become request rows. Linked candidates collapse to one representative, preferring an item with provenance and otherwise the earliest creation. This still matters for manually linked work and historical allocations, even though current allocation moves the original item. A labelled task without provenance has no public brief. `items.description` is never used as a substitute: it can contain requester contact details appended by booking.

Adding or editing a stakeholder label changes the request set the unified portal publishes. Hiding a column, narrowing a date range or selecting one stakeholder does not change that authorization. Scope and output projection must be reviewed separately.

### Gate and writing permissions

`StakeholderPortalService.resolve()` checks token shape, unified-row status, enabled flag, credential version and password before scoped operations. Tokens are generated with 32 characters. Regeneration and password changes bump `credentialVersion`; stale grants are refused on the next request. Unknown/disabled links are unavailable, and superseded or stale links report revocation. Password errors map to HTTP 401, other portal access errors to 404; submission conflicts map to 409.

Portal passwords use PBKDF2-SHA256 with 210,000 iterations when newly set, a 16-byte salt and a 256-bit key, encoded as `pbkdf2$<iterations>$<salt>$<hash>`. Verification reads the encoded count. Passwords travel in request bodies, not URLs. Policy 0013 lets authenticated workspace administrators manage portal credentials and provenance, and lets active members read stakeholder departments; department insert/update also requires administration. Ordinary members and anonymous callers cannot read credentials or provenance directly. Submission claims have RLS with no browser policy and are service-role only. Scoped public reads and writes pass through the application endpoints.

Visitors can read and book when enabled. Comment or deliverable writes additionally require a verified session, active membership in the item's workspace and OWNER/EDITOR access on that concrete item's board; asset writes verify item ownership. Supabase resolves the actor from the bearer token, never a browser actor claim. The token itself grants no edit permission. The local provider exercises services directly and cannot establish deployed RLS behavior.

### Projection and board presentation

`portal-projection.ts` maps source-board status/priority, dates, people and deliverables into allowlisted `PortalTask` fields. `portal-board.ts` then builds a synthetic `PublicBoardPayload`, rendered by the normal board views and item panel through readonly memory repositories. All seven views are available, with the normal search/filter/sort tools.

Published data includes task title/reference, stored public brief, stakeholder, status and semantic role, priority, dates, display names, deliverable summaries, subitem summaries and scoped Updates. General item descriptions, requester contacts, profile directory fields, activity history, asset notes and asset URLs are excluded. Comments on published tasks do travel in the board projection; the prose staff put in Updates is therefore visible to portal readers. Mention metadata is removed, but this is not a semantic redactor for sensitive prose.

Statuses normalize by meaning across boards. Priorities map to the application's fixed four-level palette. Requested dates are displayed as TEXT to avoid a due-date cell marking historical request dates overdue. Columns without values can be omitted. Optional presentation keys are `requested`, `priority`, `people`, `due`, `timeline`, `assets`, and `asset-types`; hidden columns are presentation only.

Presentation settings include description (280 characters), default view, default theme, hidden columns, `allowBooking`, `showRecap` and **`showItemGroups`**. SQL 0040 defaults item groups off: status grouping is the default and the board grouping option is hidden. When enabled, board/source groups are available and are the default; visitors may also group by stakeholder. Grouping lives in `?group=board|status|stakeholder`; visitors can reorder status groups with order saved per token in `streamline.portal-status-order:<token>`.

### Ranges, search and refresh

`?for=<departmentId>` selects a stakeholder; omission shows All. `?range=` supports configured rolling week/month windows, a four-digit year or `all`; the default UI/HTTP range is the **last three months**. Direct service calls can deliberately use the full set. Range filtering uses provenance `bookedAt`, falling back to item creation time, rather than due dates. An unknown stakeholder narrows to nothing.

Portal search widens the time range to All while retaining the stakeholder filter. `?task=<itemId>` opens a request independently of the current time window; `?view=` overrides the configured opening view. `/portal/<token>/book` opens the booking wizard separately and can retain `?for=`. Browser Back and reload preserve URL selections.

The synthetic board poll runs every **4 seconds**, pauses interval reads in background tabs, and refetches on focus/reconnect. Changing stakeholder/range keeps the prior board visible with a loading indication until the new response arrives. Theme choice is isolated under `streamline.portal-theme:<token>`, not the internal workspace theme.

### Booking and retry boundaries

The unified portal requires a **department ID in the booking request**, validates that it is an active department of this workspace, then overwrites the request's department name with the trusted registry name. The department is no longer inferred from a per-department token. The service composes and captures the public brief separately, then uses the same published wizard template and booking service as other booking paths. `allowBooking=false` is enforced by the service, not just by hiding a button.

A client submission key of 8–100 characters is unique per portal. The service hashes the request, claims the key, creates the booking, associates provenance and records the receipt. The same completed key/content replays the receipt; different content or a pending claim is refused. A caught failure attempts to release the claim. This compensates the claim only: it does **not** roll back an already created task or its assets, and a process failure can leave a pending claim. Inspect partial records before retrying a failed multi-write booking.

### Read scaling and sources

Portal scope/projection batch item, value, link and comment reads. Portal batches are 80 IDs; Supabase targeted link reads use 100-ID chunks because both endpoints repeat the filter, then page and deduplicate results. `unwrapAll()` pages growing result sets past PostgREST's default response limit; chunking bounds URLs but does not itself guarantee all rows were returned. The synthetic board endpoint returns the selected board set, while the tasks endpoint uses cursors. Totals and stakeholder counts are not merely counts of the current visible page.

Primary sources are `stakeholder-portal-service.ts`, `portal-projection.ts`, `portal-board.ts`, `portal-view.ts`, the portal feature screens, `src/server/portal.ts`, migrations 0030–0032/0037/0040 and policy 0013. Some comments and older design documents still describe department-isolated credentials, provenance-only publication or linked-copy allocation; those descriptions have been superseded by the executable paths above.

## 13d. The phone experience

Below 768 CSS pixels the application mounts a phone interface of its own. At 768 and above it uses the desktop shell. Historical rebuild screenshots describe that earlier comparison, not a guarantee that the current desktop matches every prior release.

**One boundary, one hook.** `useIsMobile()` (`src/hooks/use-mobile.ts`) is the only place 767 appears. It reads a media query through `useSyncExternalStore` whose server snapshot is `false`, so the server renders the desktop branch, hydration matches, and the swap lands on the first commit. Width, never the user agent.

**One shell is mounted, not two.** `AppShell` branches on that hook and returns either the phone shell (`src/components/layout/mobile-shell.tsx`: a compact top bar and five destinations - Home, My Work, Browse, Inbox, More) or the existing frame. The other is absent from the tree rather than hidden with CSS, so its queries, subscriptions and focusable controls never exist. Providers, notifications, the command palette and the version watcher sit above the branch and are shared.

**Two new routes**, `browse` and `more`, carry what the sidebar used to: teams, boards, favourites, trackers, people; and Dashboard, Book, Messages, Members, Settings, Profile, theme, About, sign out. Every other destination keeps its existing URL.

**Boards.** The Main Table becomes a grouped card list carrying status, priority, owners, due date, overdue, blocked state and the booking code; the real grid stays one tap away and scrolls inside its own box. Kanban shows one lane at a time with an explicit "Move to" control instead of dragging. Timeline, Calendar, Gantt, Workload and Chart reuse their existing implementations within the screen. Task details open full screen with stacked fields; `PopoverCell` uses a Sheet below 768 for touch editing. Trackers provide a mobile row editor while preserving the workbook model.

**Presentation is new; logic is reused.** Nothing is reimplemented: the mobile board reads the same `BoardModel`, writes the same `useBoardMutations`, and drives the same `board-ui-store`. Where a rule lived inside a desktop component it was extracted rather than copied - Kanban lane building into `useKanbanLanes`, the member row's mutations into `MemberActions`.

**Touch sizing lives in the primitives.** Button, Input, Textarea, Select, Tabs and dropdown rows provide narrow-screen touch sizing and readable input text. Inspect the actual primitive variants when adding compact or icon-only controls rather than assuming every instance has identical dimensions.

**State isolation** is the rebuild's one non-negotiable, and it has three parts. The narrow-screen sidebar fold is derived (`preferCollapsed || autoCollapsed`), never persisted - the old shell wrote `setSidebarCollapsed(true)` into the shared preference, which then followed the reader back to their desktop. Phone-only presentation choices (cards or grid, the mobile Kanban's lane) live under `streamline.mobile-view`. Explicit view switches still go through the normal `setView`, and deep-linked `?view=` and `?item=` keep working on both.

Related: `useUiStore.persist.rehydrate()` runs in a parent effect while the sidebar's team auto-expand runs in a child one, and child effects run first. Opening straight onto a board therefore used to persist the session's defaults over the reader's saved sidebar width; the auto-expand now waits for hydration.

## 14. Personal work and collaboration

### Home and My Work

Home combines workspace activity, teams, favourites, recent boards, and personal work. Board visits store recent-access information and remembered view preferences.

`MyWorkService.listAssigned()` considers non-archived boards and tasks returned by their repositories, checking every PERSON column for the requested user. It uses the first STATUS and PRIORITY columns for their summaries, the first DATE value with TIMELINE-end fallback for due dates, and semantic done-label IDs for completion.

Sections are Overdue, Today, This Week, Later, No Date, and Completed. Completion takes precedence over date grouping. Results sort by due date and then name. Linked entries present in the assignment result collapse into one representative row, with other linked boards recorded alongside it.

Asset-line assignment and task PERSON-column assignment are different records. Do not assume assigning an asset automatically gives the containing task a My Work assignment.

My Work has separate item-name, person-name and board/group search modes; a search is active only after its kind is chosen. Filters include boards (including linked boards), status/priority by normalized name, people, due bucket and items/subitems. It polls every **30 seconds**, refetches on focus, and coalesces Supabase invalidations over **250 ms**. Its item search is name-only, unlike the board's booking-reference search.

### Notifications

| Event | Default delivery |
| --- | --- |
| MENTION | NOTIFICATION |
| ASSIGNED | NOTIFICATION |
| COMMENT | NOTIFICATION |
| BOARD_INVITE | NOTIFICATION |
| TASK_BOOKED | NOTIFICATION |
| STATUS_CHANGED | UPDATE |
| DUE_DATE_CHANGED | UPDATE |
| ITEM_LINKED | UPDATE |

NOTIFICATION is the prominent inbox class that can raise an OS notification. UPDATE is a quiet inbox class. OFF writes no notification row. `NotificationService` applies the recipient's preferences when the event is written.

Muted board IDs override event delivery to OFF. Muting does not revoke board access. Browser notification delivery defaults to disabled and additionally requires browser permission. Quiet updates are not OS interruptions.

`countUnread()` splits unread counts by stored delivery. The inbox query polls every 30 seconds and explicitly allows background refetching, in addition to relevant realtime invalidations. Notification read state and item Updates read state are separate concepts.

Inbox Clear deletes the current user's records for the selected delivery tab (or all deliveries on All), including read records hidden by the unread-only filter. It does not delete tasks/comments and is distinct from Mark all read. The browser title displays only the loud notification count, capped at `99+`; the favicon is unchanged (`use-tab-badge.ts`).

### Item Updates and rich text

Rich-text editing and rendering use shared components and Tiptap. The domain helpers in `src/lib/rich-text.ts` and `src/lib/rich-text-doc.ts` support conversion and document interpretation. Mentions have semantic user IDs used by notification behavior, not just visible `@name` text.

Comments use the service layer for posting, editing, deleting, and notification handling. Item read markers record when a person caught up on an item's Updates. The updates badge combines relevant comments/read information rather than acting as the workspace notification counter.

### Direct messages and profiles

Direct messages are one-to-one workspace threads with sender/recipient identity and read tracking. `routes.messages()` supports selecting a conversation with `?to=<userId>`. `MessageService` and the message repositories implement thread loading, creation, read marking, and deletion.

Profiles combine person information and related work. Avatar processing is provider-aware as described earlier. Historical users remain available for resolving names even when they are not eligible for new assignments or mentions.

Profiles also support stakeholder group and work-hours start/end (migration 0028), alongside department/timezone. A person's profile stakeholder group is distinct from a task's STAKEHOLDER value. The profile workload panel uses dashboard-derived assignment splits by stakeholder, with a borrowed non-polling snapshot.

## 15. Trackers and Excel interchange

Trackers are lightweight workbook documents, not board columns in another layout. Each sheet stores its columns and rows as a document, designed for moderate-sized team sheets rather than hundreds of thousands of rows.

### Data model and editing

Tracker cell values are strings, numbers, booleans, or null. Column types are text, longText, list, date, url, number, and checkbox. Rows are data, section, or subsection; the latter two render as full-width bands. Each sheet has an order and a leading frozen-column count.

Dropdown columns support options and colors. Number formats include plain, integer, decimal, currency, and percent. Summary kinds include none, filled count, empty count, sum, average, min, max, checked count, and percent checked.

`TrackerService` manages workbook metadata, sheet creation/copying/renaming/deletion/reordering, and saving. `sheet-view.ts`, `grid-model.ts`, and the grid components handle visible presentation and interaction. Sheet display preferences such as stripes, wrap, grid lines, density, and crosshair are separate UI preferences.

`canEditTrackers()` permits active workspace roles except GUEST. A tracker `teamId` organizes it but the shared editing helper describes workspace-wide editing; it is not board-style TEAM/PRIVATE visibility.

### Autosave and undo

`useSheetEditor()` keeps a local draft and debounces persistence by **600 ms**. It saves columns, rows, and frozen-column state, exposes idle/pending/saving/error states, and retains approximately 50 prior snapshots for undo. Redo uses a separate future stack.

A new server version replaces the draft only while no local dirty work is pending. Persistence is a sheet-document write; there is no cell-level collaborative merge algorithm in that hook. Concurrent editing of the same sheet therefore requires attention to last-write behavior.

The hook registers unsaved work during the debounce/write interval. Unmount now invokes `flush.current?.()`, clears the outstanding timer and starts the pending save immediately, including on sheet switches. This is an asynchronous, fire-and-forget write, not a guarantee against network failure or browser termination. `tests/unit/components/tracker-flush.test.tsx` covers the regression; the previous cancel-only behavior is no longer current.

### `.xlsx` export and import

`src/services/tracker-xlsx.ts` uses ExcelJS. Export carries sheet structure, headers, section rows, widths, frozen panes, display formats, dropdown validations, color formatting, and summary formulas. Footer formulas include COUNTA, COUNTBLANK, SUM, AVERAGE, MIN, MAX, and checkbox-related COUNTIF expressions.

Import reads workbook content back into the tracker model and infers supported structures. It recognizes totals/formula rows so they do not simply become ordinary data rows. Formula cells are read through their cached result; a formula without a result can become null. This is not a general in-app Excel calculation engine.

The dropdown importer handles literal-list validation; range references to another sheet are not imported as option lists by that helper. Do not assume arbitrary Excel features, macros, formulas, or formatting round-trip without loss. Test representative user workbooks against the supported model.

Tracker export/import is independent of whole-workspace local JSON export/import and of Postgres backups.

## 16. State, synchronization, and saving

### Cache identity

`src/lib/query/keys.ts` centralizes query keys. Use those keys for reads, optimistic writes, and invalidation so surfaces agree about which records changed.

Board mutations cancel the current snapshot query, keep the previous snapshot, apply an optimistic patch, execute the service call, reconcile newly created IDs when needed, and refetch when the pending mutation count reaches zero. Errors restore the captured snapshot and display a toast.

Related invalidations include linked-board snapshots, item links, My Work, activity, and notifications. This reconciliation matters because one edit can affect more than the board currently visible.

### Local cross-tab synchronization

`src/lib/realtime/local-realtime.ts` publishes compact invalidation hints through BroadcastChannel `streamline.data-changes`. Messages include affected board/item IDs and coarse change kinds. A per-tab sender ID prevents a tab from processing its own message.

The local synchronization component responds by invalidating queries. The channel is a freshness signal over a shared same-origin IndexedDB store; it is not cross-device synchronization or a replication transport.

### Supabase Realtime

`useBoardRealtime()` subscribes to item, value, group, column, comment, asset, link, activity, and notification changes. Item values now have denormalized `board_id` (migration 0036), maintained by the integrity trigger and move paths, so value events are filtered to the open board. Comments and links still use broader subscriptions where no board filter is present. Dashboard and My Work freshness have separate intervals described in their sections.

Events are coalesced over **400 ms** so one service operation writing several rows does not force a separate refetch for every event. Notification subscriptions are scoped to the current user. Cleanup cancels pending timers and removes the channel.

Freshness requires the appropriate tables in the realtime publication and permissions that allow the authenticated subscriber to read relevant rows. A working local BroadcastChannel test does not verify Supabase publication or RLS configuration.

### Storage keys and preference scope

| State | Persistence |
| --- | --- |
| Local auth session | localStorage `streamline.local-session` |
| Sidebar/tracker appearance preferences | localStorage `streamline.ui` |
| View-as preview | sessionStorage `streamline.view-as` |
| Remembered board view | localStorage `streamline.board-view`, keyed by person and board with legacy fallback |
| Board visits and per-view settings | Admin repository / provider persistence |
| Board filters, search, selection, expanded items | Transient Zustand state |
| Dashboard preferences | localStorage `streamline.dashboard.v2`, keyed by user and workspace |
| Phone cards/grid and Kanban lane | localStorage `streamline.mobile-view` |
| Portal theme and status order | localStorage `streamline.portal-theme:<token>` and `streamline.portal-status-order:<token>` |
| Booking requester, recent requests and unfinished request | localStorage `streamline.booking`, scoped by portal/workspace |
| Published booking form / editor draft / output rates | Workspace repository fields; not browser-only preferences |
| Task data | Selected repository provider |

UI-store persistence hydrates after mount to avoid server/client markup mismatches. The sidebar width is constrained between 240 and 480 pixels.

### Unsaved-work guard

`beginUnsavedWork()` increments a shared in-flight count and returns an idempotent completion callback. While the count is positive, the beforeunload handler asks the browser to confirm leaving. Call completion in `finally` so failed operations do not leave the guard active forever.

This mechanism protects registered in-flight work. It is not durable offline queuing, a guarantee that every draft is registered, or a transaction spanning network requests. Validate navigation and failure paths when adding debounced writes.

## 17. Database operations

### Current schema heads

The repository contains **40 migrations**, through `supabase/migrations/0040_portal_item_groups.sql`, and **16 policies**, through `supabase/policies/0016_booking_saved_blocks_policies.sql`. IndexedDB is **DB_VERSION = 15**. These are repository heads, not verified applied versions of any database. Later SQL includes behavioral/data changes: 0037 retires department portal links and 0040 changes the default portal grouping. Do not assume every migration is purely additive or preserves old access behavior.

New SQL takes the next free number in each directory. Add a follow-up file instead of editing applied SQL: the runner records checksums, warns about drift and skips already-ledgered files rather than reapplying them.

### Migration runner

`scripts/db-migrate.mjs` reads `.env.local` and `.env` when needed, connects with `SUPABASE_DB_URL`, and collects SQL from migrations followed by policies. Files are ordered lexicographically within each directory.

The runner uses a single connection and Postgres advisory lock `8163`, creates/maintains `public.schema_migrations`, and records a shortened SHA-256 checksum for each applied file. Each normal migration file and its ledger insertion run in one transaction.

| Command | Meaning |
| --- | --- |
| `npm run db:migrate` | Apply pending SQL files. |
| `npm run db:migrate -- --dry` | Report pending files without executing those migration bodies. |
| `npm run db:migrate -- --baseline` | Record pending files as already applied without executing their bodies. |
| `npm run db:setup` | Run migration, seed, and provider-switch workflow. |
| `npm run db:setup -- --no-seed` | Migrate and switch existing `.env.local` to Supabase without reseeding. |

The dry path still connects, acquires the lock, and calls `ensureLedger()` before reporting pending files. It can create the ledger and enable its RLS; it is not literally zero-write inspection on an uninitialized database.

A checksum mismatch is logged as drift; the runner does not automatically reapply the edited file or necessarily fail the command. Add a new migration/policy file to evolve an already deployed schema. Baseline only when the target database already has the intended schema, since it changes the ledger without installing missing objects.

### Migration inventory

| Prefix | Change |
| --- | --- |
| 0001 | Initial schema, enums, relational constraints, indexes, and profile trigger. |
| 0002 | Item links. |
| 0003 | Trackers and tracker sheets. |
| 0004 | Realtime publication setup. |
| 0005 | Direct messages and avatar-related storage setup. |
| 0006 | Status-label roles. |
| 0007 | Notification delivery and preferences. |
| 0008 | Shared comment ID support. |
| 0009 | Workspace invitations. |
| 0010 | Item read markers. |
| 0011 | Size column. |
| 0012 | Removal of Files-column support/data covered by that migration. |
| 0013 | Item covers and related storage setup. |
| 0014 | Task booking and system-entity support. |
| 0015 | Item assets. |
| 0016 | Board-visit view persistence. |
| 0017 | Multiple item-asset assignees. |
| 0018 | Item-asset completion. |
| 0019 | Booking form templates. |
| 0020 | Board shares. |
| 0021 | Item reference field. |
| 0022 | Reference backfill. |
| 0023 | Scrambling of selected legacy references. |
| 0024 | Dashboard shares; boards and teams join the realtime publication. |
| 0025 | Asset activity event types. |
| 0026 | Workspace lists and their persistence. |
| 0027 | STAKEHOLDER column type. |
| 0028 | Profile stakeholder group and work-hour fields. |
| 0029 | Item shares and board-share access modes; existing board links remain PUBLIC. |
| 0030 | Durable departments, portal credentials, request provenance, submission records and creative-team name. |
| 0031 | Portal description, hidden columns, default view, booking and recap controls. |
| 0032 | Pending submission claims and receipt completion for portal idempotency. |
| 0033 | Workspace asset output rates. |
| 0034 | Asset Preview and Final artwork URLs. |
| 0035 | Workspace rows in the Realtime publication. |
| 0036 | Backfilled, required and indexed value `board_id`; integrity trigger maintenance. |
| 0037 | Unified workspace portal, partial unique index and legacy-link revocation. |
| 0038 | Booking form draft and named-template descriptions. |
| 0039 | Reusable booking saved blocks. |
| 0040 | Portal `show_item_groups`, false by default. |

Policy files 0001–0010 cover base RLS, item links, trackers, notification preferences, invitations, system entities, booking templates, read-only workspace visibility, board shares, and dashboard shares. Later definitions may replace earlier helper functions.

| Policy | Change |
| --- | --- |
| 0011 | Workspace-list access. |
| 0012 | Individual item-share access. |
| 0013 | Member department reads, administrator department/portal/provenance management, service-role-only submission claims. |
| 0014 | Active membership before ownership/explicit board roles, including deletion. |
| 0015 | Board SELECT policy evaluates supplied row fields for INSERT RETURNING; current board-role helper. |
| 0016 | Booking saved blocks: active-member reads, administrator writes. |

Storage-related SQL is advisory in places because the connected database role may not be able to alter Storage objects. A completed migration run should be followed by verification of the required buckets and policies when testing uploads.

### Seed modes and side effects

`npm run db:seed` runs **`scripts/db-seed.mts`**, building from the TypeScript seed modules. It is not merely a wrapper that executes `supabase/seed.sql`.

The full seed creates/updates demo Auth accounts, recreates pending accounts as needed, deletes the seeded workspace and specified seed-user notifications, and writes a fresh bundle. It can replace hand-edited work inside that seed workspace. Treat it as a reset of that demonstration dataset.

`npm run db:seed:topup` runs `scripts/db-seed-topup.mts`. It adapts extras to existing content, checks relationships, and inserts with `ON CONFLICT DO NOTHING`. It is designed to add demonstration content without updating existing rows.

The seed has built-in demonstration passwords and environment overrides. Read the script for those defaults when using an isolated demo environment; do not assume they match a separately administered deployment. Pending invitation links printed by seed tooling are credentials for completing those accounts.

`scripts/add-user.mjs` is an administrative account/membership creation path with email, role, name, title, and password inputs. `scripts/refresh-demo-data.mjs` mutates demonstration wording/completion data; it is not a read-only report.

Seed modules also include deterministic 2025 history in `seed-archive.ts`, tested by `seed-archive.test.ts`; this historical seed is distinct from the paginated archive fixture. `scripts/archive-fixture.mts` creates an `archive-load-test` board with 300 archived and 12 live tasks; `--remove` deletes that fixture board. `scripts/add-stakeholder-column.mjs` is a database backfill utility. These are mutation tools, not documentation-verification commands.

### npm lifecycle consequences

Both `predev` and `prebuild` invoke migrations with `--if-configured`. The hook skips an absent database URL but does not inspect the app's local/Supabase provider choice. A normal build can therefore mutate a configured database before compiling application code.

For documentation-only work or local UI work that must avoid database effects, do not run lifecycle commands casually. `SKIP_DB_MIGRATE=1` is the runner's supported bypass, not a replacement for applying required schema changes when deploying features that depend on them.

## 18. Deployment and build identity

`vercel.json` selects Next.js, installs with `npm ci --legacy-peer-deps --include=dev`, builds with `npm run build`, and requests region `sin1`. This is application hosting configuration; it does not establish the Supabase database's actual region.

The repository names `https://rmit-streamline.vercel.app` as its deployed application and uses it as the deployment-test default. That URL was not contacted during this documentation task.

`next.config.ts` creates build identity from package version, build ID, and build timestamp. Build ID precedence is `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, `BUILD_ID`, local Git revision, then a generated local fallback. Environment/Git IDs are shortened to 12 characters where implemented.

The client receives `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_BUILD_ID`, `NEXT_PUBLIC_BUILT_AT`, and `NEXT_PUBLIC_DEPLOY_ENV`. `/api/version` supplies the server identity. `isNewerBuild()` detects differing version or build ID; despite its name, it does not compare chronological deployment order.

`VersionWatcher` checks immediately and then every 30 seconds while the tab is visible, and checks again on visibility, focus, or online events. A detected change offers Reload or Later. It does not force a page reload, and Later suppresses the notice for that build.

The GitHub workflow `.github/workflows/db-migrate.yml` applies pending SQL on matching pushes to `main` and supports manual dispatch. It uses Node 22 and the repository secret `SUPABASE_DB_URL`, serializes its migration jobs, and calls the same migration runner. Its configured scope is database migration, not a claim that all test suites run in CI.

`.github/workflows/supabase-keep-alive.yml` runs at 00:17, 06:17, 12:17 and 18:17 UTC, or manually. It uses the same repository database secret, requires SSL, and issues `SELECT 1` with up to three attempts. It neither reads application records nor applies migrations. Its presence does not prove the workflow is enabled, secrets are configured or a paused project has resumed. Build/version information is also shown on signed-out screens; the full-page loader does not carry it.

## 19. Testing and verification

### Commands

| Command | Scope |
| --- | --- |
| `npm run lint` | ESLint over the project. |
| `npm run typecheck` | TypeScript without emitted application output. |
| `npm test` | Vitest unit/component suite. |
| `npm run test:watch` | Vitest watch mode. |
| `npm run check` | Lint, typecheck, then unit/component tests. |
| `npm run test:e2e` | Standard Playwright suite with the local provider by default. |
| `npm run test:e2e:supabase` | Supabase smoke/audit runner and provider selection. |
| `npm run test:e2e:deployment` | Smoke tests against a deployed URL. |
| `npm run build` | Production compile, preceded by configured migration hook. |

`npm run check` does not include Playwright or a production build. Type checking uses an incremental configuration, and build/test tools can create generated output; none were needed for this documentation-only change.

### Unit and component coverage

Vitest uses happy-dom, React transformation, `tests/setup.ts`, and fake-indexeddb. The include patterns cover `tests/unit/**/*.test.{ts,tsx}` and `src/**/*.test.{ts,tsx}`, excluding E2E files.

Existing suites cover permissions, repositories, dates/slugs, seed integrity/history/top-up, services, filtering, links and label sync, booking, onboarding, notifications, rich text, trackers and Excel export, views/aggregates, assets, references, public shares, version detection, and unsaved work. Component tests include status cells, person pickers, item details, label editing, and the board toolbar.

### Regression coverage for recent changes

| Area | Checked-in tests |
| --- | --- |
| Membership-first access and public-user allowlist | `tests/unit/audit-regressions.test.ts` |
| Archive paging, filtering, focus, restore and linked policies | `tests/unit/board-archive.test.ts` |
| Booking validation, service routing, allocation move and form lifecycle | `tests/unit/booking.test.ts`, `tests/unit/booking-wizard.test.tsx`, `tests/e2e/booking.spec.ts` |
| Portal scope, gate, department selection, retry claims and projection | `tests/unit/stakeholder-portal.test.ts`, `tests/unit/portal-scope.test.ts`, `tests/unit/portal-booking.test.ts`, `tests/unit/portal-board.test.ts` |
| Portal ranges, grouping, passwords and department identity | `tests/unit/portal-range.test.ts`, `tests/unit/portal-grouping.test.ts`, `tests/unit/portal-password.test.ts`, `tests/unit/department-reconciliation.test.ts` |
| Dashboard contracts, public fields, effort and workload | `tests/unit/dashboard-analytics.test.ts`, `tests/unit/dashboard-metrics.test.ts`, `tests/unit/dashboard-share.test.ts`, `tests/unit/asset-rates.test.ts`, `tests/unit/workload-section.test.tsx` |
| Charts and exact figure disclosures | `tests/unit/year-comparison.test.tsx`, `tests/unit/treemap.test.tsx`, `tests/unit/trend-line.test.tsx`, `tests/unit/headline-figure.test.tsx` |
| Task shares and asset URLs | `tests/unit/item-share.test.ts`, `tests/unit/asset-links.test.tsx` |
| Lists, personal filters and inbox clearing | `tests/unit/list-draft.test.ts`, `tests/unit/my-work-filters.test.ts`, `tests/unit/notifications-clear.test.ts` |
| Paging large Supabase value/link reads | `tests/unit/supabase-paging.test.ts`, `tests/unit/supabase-link-paging.test.ts` |
| Tracker unmount saves and phone boundaries | `tests/unit/components/tracker-flush.test.tsx`, `tests/unit/mobile-boundary.test.tsx`, `tests/unit/components/mobile-tracker-row.test.tsx` |
| Historical seed | `tests/unit/seed-archive.test.ts`, `tests/unit/seed-history.test.ts` |

These suites provide targeted starting points for regression work. Mocked repository tests and local browser tests are not deployed authorization or performance verification. Historical runs under `Test_prompts/audits/2026-09-09-full-operations` apply to their recorded revision and environment.

### Local Playwright

`playwright.config.ts` runs one worker with full parallelism disabled. It uses Desktop Chrome settings at 1440 × 900 and base URL `http://localhost:3100`. The web server starts through `npm run dev -- --port 3100`, with `NEXT_PUBLIC_DATA_PROVIDER` pinned to local unless `PW_PROVIDER` overrides it.

It reuses an existing server outside CI, retains traces on failure, and allows one retry in CI. If a server is reused, verify that server's actual provider; a configured launch environment does not reconfigure a process that is already running.

Suites exercise board lifecycle, groups/items, columns, filters/sort/drag/drop, multiple views, deep links, cross-view sync, permissions, teams/members, onboarding, messages/account behavior, notifications, bookings, assets/covers, references, trackers, mobile layout, large boards, accessibility, and version notices.

`tests/e2e/mobile-layout.spec.ts` covers the phone shell, the card list, all seven views, the contained grid, the explicit Kanban move, ID search, a full-screen item with its deep link and Back, and every destination for overflow; two of its cases assert the 767/768 boundary by resizing live, and a desktop-to-mobile-to-desktop round trip that leaves a non-default sidebar width alone. `tests/e2e/stakeholder-portal.spec.ts` defines local-provider coverage for the single workspace portal, per-stakeholder filtering and All, default three-month range, search across ranges, booking with a department, revocation/disable/password gates, presentation, theme isolation, deep links, all seven views and read-only stakeholder behavior. These are checked-in tests, not results from this documentation update.

### Supabase and deployment tests

`scripts/e2e-supabase.mjs` loads environment values, sets `E2E_PROVIDER=supabase` and `PW_PROVIDER=supabase`, and runs `supabase-smoke.spec.ts`. That suite includes direct API checks of RLS; it is skipped under the normal local-provider setting.

Deployment tests use `playwright.deployment.config.ts`, start no server, and target `E2E_BASE_URL` or the repository's deployed default. They use configurable sign-in credentials, one worker, one retry, and a longer timeout for remote workflows.

Both remote suites perform writes, including task lifecycle and collaboration operations. They are not passive health checks. Run them against an intended test environment and review their fixtures/cleanup before using a shared workspace.

### Choosing evidence for a change

Use pure/unit tests for mappings, permissions, date behavior, and transformations. Use component tests for interactive controls. Use local E2E for complete user workflows. Use Supabase tests for actual backend contracts and RLS. Use deployment smoke tests for deployed integration behavior.

A successful local test cannot establish production RLS correctness, service-role availability, storage permissions, or migration state. Report exactly which verification ran rather than treating all test categories as interchangeable.

## 20. Troubleshooting

| Symptom | Likely area | Useful check |
| --- | --- | --- |
| App opens with unexpected demo content | Provider fallback or another browser origin | Inspect config warnings and provider environment; check port/browser profile. |
| `npm run dev` fails before Next starts | Migration lifecycle hook | Check `SUPABASE_DB_URL`, runner output, and intended migration behavior. |
| Workspace-visible board can be read but not edited | Current visibility rule | Check ownership, explicit role, admin role, and board visibility. |
| Admin cannot edit a specific board | Explicit membership precedence | Check whether an explicit VIEWER membership wins before admin-derived EDITOR. |
| Admin sees no Task Allocation | System initialization, RLS, or view-as | Check system markers, effective permissions, and `ensureSystemEntities()` warnings. |
| Added person cannot sign in | Pending onboarding | Check invitation and membership status; finish the join workflow. |
| Add member fails with server configuration error | Privileged server client | Verify service-role availability on the server and required migrations. |
| Booking/share fails although ordinary boards work | Privileged public endpoint | Check server key, route logs, token/key validity, and schema. |
| Booking lands on a team board | Service routing | Inspect the selected service's `teamId` and team's `bookingBoardId`. |
| Booking remains on Task Allocation | No valid direct receiving board | Check service team routing and receiving board archive/system/workspace state. |
| Booking error after a long wait | Multi-operation submission | Check whether task/assets were partly created before resubmitting. |
| Linked status does not transfer | Label translation | Check target label names, mapping report, and excluded fields. |
| Link creation is refused | Link-chain invariants | Check workspace, board, duplicate link, and one-item-per-board chain rules. |
| Old linked task copies have different assets | Separate asset ownership | Generic links do not synchronize asset lists; current allocation moves one task instead. |
| Completed-looking work remains in My Work | Status semantics | Inspect the first status column and its done-label IDs. |
| Asset owner sees no task assignment | Different assignment model | Check task PERSON values separately from asset assignees. |
| Inbox count differs from task updates badge | Different read-state models | Inspect delivery/read state and item-read markers separately. |
| No OS notification | User preference/browser permission | Check loud delivery, board mute, browserEnabled, and browser permission. |
| Another tab shows stale local data | Local broadcast/origin | Check same origin, BroadcastChannel support, and invalidation. |
| Another user shows stale Supabase data | Realtime/RLS | Check publication, subscription, readable rows, and query invalidation. |
| Local upgrade is blocked | Open IndexedDB connection | Check other tabs holding the prior database version. |
| Avatar or cover upload fails | Conversion or Storage | Check source type/size, bucket existence, and write policies. |
| A share reveals more detail than expected | Share-specific projection | Board/item shares include scoped content; portal publishes Updates; dashboard publishes named workload. Review the actual projection. |
| Tracker formula imports as blank | Missing cached Excel result | Inspect the workbook's saved formula result and import support. |
| Tracker edit disappears around navigation | Persistence failure | Unmount now flushes; inspect save errors, concurrent writes and browser termination. |
| Migration says a file changed after application | Checksum drift | Add a follow-up migration; do not assume the changed file reran. |
| Deployment notice appears after a rollback | Build identity comparison | Any differing build/version counts as a change. |
| Old department link says it was replaced | Unified portal migration | Use the newly managed workspace portal; changing a filter cannot restore an old token. |
| A portal seems to omit an older request | Default range / stakeholder / archive | Check All time, stakeholder selection, label/provenance and item archive state. |
| Form edits do not appear to stakeholders | Draft versus live | Check whether the saved draft has been published. |
| Board creation fails RLS despite valid membership | INSERT RETURNING policy | Verify policy 0015 is applied; older board SELECT helpers reread the new row. |
| Effort is missing or incomplete | Output-rate coverage | Check Settings → Lists → Asset types and current rate keys. |
| Archived task affects dashboard operations | Status/date facts | Archive is not completion; check its semantic status and active-board membership. |

For a persistence defect, capture the provider, route, user role, board/item IDs, operation, and exact error. Follow the flow from feature hook to service, repository, row conversion, and database policy. Avoid beginning with a full seed/reset when the issue may be configuration, cache, or access.

## 21. Development change guides

### Adding a column type

Update the domain column list and typed value union, default/empty-value helpers, settings and width defaults, picker/icon/renderer support, filtering/sorting/display/export rules, and any view aggregates using that value. Decide explicitly whether item links may map it and whether booking forms may expose it.

Add a forward SQL migration for schema/enum changes, update row handling and local compatibility where needed, and cover the behavior with meaningful unit and browser tests. A picker entry alone is not a complete new column implementation.

### Changing permissions

Update `permissions.ts` and the database helper/policies together. Preserve deliberate precedence or document the change. Exercise owner, explicit editor/viewer, administrator, member, guest, team, private-board, system-board, and inactive-membership cases relevant to the change.

Use an actual authenticated Supabase session for backend enforcement checks. View-as and local UI behavior alone cannot verify RLS.

### Adding a repository capability

Start from `src/data/repositories/index.ts`, then implement local and Supabase behavior and decide the public memory adapter's bounded read or read-only response. Connect it through service composition, query keys, feature hooks, and related invalidation.

For a new local object store, increment the IndexedDB version and add an upgrade step, export/import coverage, and seed support if appropriate. For SQL persistence, add an ordered migration and policies rather than editing previously applied files.

### Changing booking fields

Review version-2 template definitions, legacy migration, Zod/template validation, service routing, brief composition, wizard steps, editor draft/publish behavior, named templates/saved blocks, browser memory, board mapping and portal public-brief projection. Retain historical answers when changing questions. Cover allocation as an identity-preserving move, including asset board IDs and provenance.

Test public-key, active-member and unified-portal paths, with service-configured direct reception and Task Allocation fallback. Do not trust actor IDs supplied by an unauthenticated browser.

### Changing the stakeholder portal

Review the unified credential gate, `scopeWithItems()` publication rules (labels plus provenance), the allowlisted `portal-view.ts` model, `portal-projection.ts` mapping and `portal-board.ts` synthetic board together. Stakeholder/range/group choices are not authorization. Add published fields explicitly and test both inclusion and exclusion; do not infer current behavior from comments describing the old department-only design.

Every scoped call must go through `StakeholderPortalService.resolve()` to check the token, unified portal row, enabled state, credential version and password. Booking separately validates the selected department against active departments in the admitted workspace. A write additionally re-checks the portal scope and a seat on the concrete item's own board, and never trusts an actor id from the body.

Changing department identity means changing `reconcileDepartments()`, which is pure and unit-tested. Keep Settings -> Lists as the only editing surface, and keep identity flowing through the rename map rather than matching names - the tests in `tests/unit/department-reconciliation.test.ts` pin the cases where guessing would hand one department's history to another.

### Changing links or shared Updates

Review validation, mapping, translation, exclusions, chain traversal, comment reachability, label-definition synchronization, notification behavior, and multi-board query invalidation together. Include asymmetric column names, missing labels, single-person destinations, exclusions, and chains in regression coverage.

### Adding a board view

Extend the view kind, view switcher, routing validation, remembered-view handling, settings persistence, shared-board compatibility, and cross-view mutation behavior. Reuse board snapshot/filtering rather than inventing a second source of task truth.

### Changing public sharing

Review the token gate, password handling, expiry behavior, privileged server access, payload projection, memory repositories, public contexts, and refresh behavior. Test rejection and payload scope as well as successful rendering. A disabled edit button does not substitute for read-only service/repository behavior.

### Working with this Next.js version

Before changing Next.js code, follow `AGENTS.md` and read relevant installed guides under `node_modules/next/dist/docs/`. The existing handlers already demonstrate awaited `params`. The package version and repository instructions explicitly caution against carrying older conventions forward without checking.

### Keeping documentation current

Update this file, its snapshot and source index when provider defaults, roles, routes, scripts, domain types, persistence versions or supported workflows change. Also review README and `src/features/workspace/documentation/guide-content.ts` for user-facing drift; historical design/audit reports should remain labelled as historical evidence. Distinguish implementation, intended behavior, tested behavior, and deployed behavior. Prefer explaining a rule and naming its source over copying long code blocks that will drift.

## 22. Documentation discrepancies and implementation limits

This reference describes source at the snapshot named above. README prose, in-app guide text, design reports, historical audits and source comments may describe earlier behavior. In particular, do not carry these superseded assumptions forward:

| Earlier assumption | Current implementation |
| --- | --- |
| Local is the default backend, or Supabase is a stub | Supabase is the default complete provider, falling back to local when public credentials are missing. |
| Board ownership survives workspace deactivation | Active membership is checked first in TypeScript and policies 0014/0015. |
| WORKSPACE visibility grants editing | Visibility alone grants non-guests VIEWER; explicit seats, ownership, administration and TEAM visibility have separate precedence. |
| Allocation creates a linked copy | It moves the original task and assets, preserving the ID and portal provenance. |
| Booking deliverables also become subitems | New bookings write asset lines only. Historical subitems are not automatically removed. |
| Stakeholders choose a team directly | The chosen service's configured team determines routing. |
| Editing the form immediately changes public booking | Draft saves are separate; publishing replaces the live form. |
| Each department has its own private portal | One workspace-wide credential admits all publishable stakeholders; selectors are filters. Old department tokens are refused. |
| Portal publication is provenance-only | STAKEHOLDER labels also publish tasks and take precedence for attribution. |
| Removing a department hides every task it ever owned | Provenance remains; eligible work can appear in All without an active stakeholder attribution. |
| The portal lacks board views or refreshes every 15 seconds | It reuses all seven views and polls every 4 seconds while visible. |
| Portal columns or date filters are authorization boundaries | They control presentation/selection after the token gate. |
| Updates are internal on a published task | The portal board projection includes Updates; activity logs remain internal. |
| New board and item links are always anonymous | New links default PRIVATE and require active workspace membership; PUBLIC is a separate choice. |
| Public board/item users are complete profiles with email removed | `toPublicUser()` explicitly constructs sanitized fields. Content typed elsewhere is not redacted. |
| Dashboard is three tabs or measures only tasks/assets | It is one report with optional rate-derived Effort and named workload. |
| Dashboard history excludes archived items | Archived items count; archived boards remain excluded. |
| Public dashboard contains no people | It includes assignment IDs and projected names/avatars for workload, plus some user metadata. |
| Effort is logged time or available capacity | It is estimated from current asset output rates; leave and commitments are not modeled. |
| Tracker navigation cancels the pending save | Unmount starts the pending save immediately; it still depends on successful persistence. |
| Chunking a request guarantees complete results | ID chunks bound URLs; response paging is also needed on growing result sets. |
| Editing an applied SQL file reruns it, or drift always fails the command | The runner logs drift and skips ledgered files; create a forward migration. |
| Migration dry-run is guaranteed zero-write | It skips migration bodies but ensures the ledger and its RLS. |
| Switching providers transfers data | It selects another store; no transfer occurs. |

Practical limits to retain in change reviews:

- Normal board snapshots still read board data as a whole, even when the table virtualizes rows. Supabase `listValuesByBoard()` can include archived-item values; row virtualization alone does not remove that read cost.
- Archive cascades currently cover directly connected counterparts, and item archive timestamps do not automatically cascade to descendants. Restore/delete UI and backend access must be assessed together.
- Booking, allocation, list rewrites and portal submission are multiple persistence operations. Claim cleanup is not rollback of every created record; a failed or interrupted operation can leave partial state.
- Public board/item shares carry substantially more task content than portal or dashboard allowlists. Public media bucket URLs have their own access behavior. Hidden columns are not a general redaction mechanism.
- Historical dashboard counts depend on the current active-board set, current labels and current rates. Completion-date and reliable on-time reports need additional durable event/deadline data.
- Local data belongs to the browser origin/profile. Whole-store import/reset replaces it; Supabase whole-database export/reset is unsupported by the admin repository. Tracker import reads cached formula results rather than implementing Excel.
- The local provider, view-as preview and checked-in tests do not establish deployed RLS, storage policy, migration, performance or availability results. No live environment was audited for this update.

## 23. Source index

The following paths are repository-relative source references. Start with the indicated file and follow its imports when implementing a change.

| Question | Source |
| --- | --- |
| Which scripts and versions are declared? | `package.json`, `package-lock.json` |
| How does provider fallback work? | `src/lib/config.ts` |
| Where are dependencies composed? | `src/features/data/data-context.tsx`, `src/services/index.ts` |
| Which persistence methods exist? | `src/data/repositories/index.ts` |
| What is the local schema version? | `src/data/local/database.ts` |
| How is the local seed initialized? | `src/data/local/connection.ts`, `src/data/seed/apply-seed.ts` |
| How are Supabase rows converted? | `src/data/supabase/rows.ts` |
| How are backend errors handled? | `src/data/supabase/client.ts`, `src/server/http.ts` |
| Where are routes constructed? | `src/lib/routes.ts` |
| What are effective board permissions? | `src/lib/permissions/permissions.ts`, `supabase/policies/0015_boards_select_without_reread.sql` |
| How does workspace context/view-as work? | `src/features/workspace/workspace-context.tsx` |
| How are system entities created? | `src/services/workspace-service.ts` |
| Where are board templates? | `src/features/boards/templates.ts` |
| How are board snapshots and mutations implemented? | `src/services/item-service.ts`, `src/features/boards/hooks/use-board-mutations.ts` |
| How do filters and sort work? | `src/features/boards/board-filtering.ts`, `src/stores/board-ui-store.ts` |
| Where are view aggregates? | `src/features/boards/components/views/view-aggregates.ts` |
| What does a typed value contain? | `src/domain/board/column.ts`, `src/domain/item/item.ts` |
| What can an item link carry? | `src/domain/item/item-link.ts`, `src/services/item-link-sync.ts`, `src/services/item-link-service.ts` |
| How are assets counted? | `src/domain/item/item-asset.ts`, `src/services/item-asset-service.ts` |
| How are booking references generated? | `src/domain/booking/booking.ts` |
| How are bookings validated and mapped? | `src/services/booking.ts`, `src/services/booking-service.ts` |
| How is public booking authorized? | `src/server/booking.ts` |
| How are booking templates represented? | `src/domain/booking/booking-template.ts`, `src/features/booking/editor` |
| How is a share payload scoped? | `src/services/board-share-service.ts`, `src/domain/board/board-share.ts` |
| How do public boards reuse the UI? | `src/data/memory/index.ts`, `src/features/share/shared-board-page.tsx` |
| How is onboarding authorized and completed? | `src/server/onboarding.ts`, `src/domain/workspace/invitation.ts` |
| How does local login differ? | `src/features/auth/providers/local-auth-provider.ts` |
| How does Supabase login work? | `src/features/auth/providers/supabase-auth-provider.ts` |
| How is My Work grouped? | `src/services/my-work-service.ts`, `src/lib/dates/dates.ts` |
| How is notification delivery chosen? | `src/domain/notification/notification.ts`, `src/services/notification-service.ts` |
| How are Updates and read markers handled? | `src/features/comments/updates.ts`, `src/features/items/updates-badge.tsx`, `src/services/comment-service.ts` |
| How do direct messages work? | `src/services/message-service.ts`, `src/features/messages/hooks.ts` |
| How do tracker editing and saves work? | `src/domain/tracker/tracker.ts`, `src/features/trackers/hooks.ts`, `src/services/tracker-service.ts` |
| How are Excel files converted? | `src/services/tracker-xlsx.ts` |
| Where are query identities defined? | `src/lib/query/keys.ts` |
| How do local tabs refresh? | `src/lib/realtime/local-realtime.ts`, `src/features/data/local-realtime-sync.tsx` |
| How do Supabase boards refresh? | `src/features/boards/hooks/use-board-realtime.ts` |
| How is pending work guarded? | `src/lib/unsaved-work.ts` |
| How are media files processed? | `src/features/items/cover-upload.ts`, `src/features/profile/avatar-upload.ts` |
| What do migration/seed commands actually do? | `scripts/db-migrate.mjs`, `scripts/db-seed.mts`, `scripts/db-seed-topup.mts`, `scripts/db-setup.mjs` |
| How is build identity generated? | `next.config.ts`, `src/lib/version.ts`, `src/features/version/version-watcher.tsx` |
| What deployment settings are checked in? | `vercel.json`, `.github/workflows/db-migrate.yml` |
| What are the test harness defaults? | `vitest.config.mts`, `playwright.config.ts`, `playwright.deployment.config.ts`, `tests/setup.ts` |
| What instructions govern Next.js edits? | `AGENTS.md`, relevant guides in `node_modules/next/dist/docs/` |
| How are archived tasks paged and restored? | `src/domain/item/item-archive.ts`, `src/services/item-service.ts`, `src/features/boards/archive` |
| How are table rows virtualized? | `src/features/boards/components/table/virtual-rows.tsx` |
| Where are lists, renames and rate settings managed? | `src/domain/workspace/workspace-list.ts`, `src/domain/workspace/asset-rate.ts`, `src/services/workspace-list-service.ts`, `src/features/workspace/list-draft.ts`, `src/features/workspace/lists-section.tsx` |
| How does the wizard save and publish forms? | `src/domain/booking/booking-template.ts`, `src/services/booking-service.ts`, `src/features/booking/book-task-page.tsx`, `src/features/booking/editor`, `src/features/booking/wizard` |
| Where are personal booking drafts/repeats stored? | `src/features/booking/booking-remember.ts` |
| Where are saved brief blocks persisted? | `src/data/local/repositories/booking-saved-block-repository.ts`, `src/data/supabase/repositories/booking-saved-block-repository.ts` |
| How is an individual task link scoped? | `src/services/item-share-service.ts`, `src/server/share.ts`, `src/features/share/shared-item-page.tsx`, `src/features/share/share-shell.tsx` |
| What does the unified portal authorize and publish? | `src/services/stakeholder-portal-service.ts`, `src/services/portal/portal-projection.ts`, `src/services/portal/portal-board.ts`, `src/domain/portal/portal-view.ts` |
| How do portal routes validate visitors and writes? | `src/server/portal.ts`, `src/data/supabase/portal-transport.ts`, `src/lib/auth/portal-password.ts` |
| How do portal filters and grouping work? | `src/domain/portal/stakeholder-portal.ts`, `src/features/portal/portal-page.tsx`, `src/features/portal/portal-grouping.ts`, `src/features/portal/portal-board-screen.tsx` |
| What does the dashboard count and share? | `src/services/dashboard-service.ts`, `src/domain/dashboard/dashboard.ts`, `src/features/dashboard/analytics.ts`, `src/features/dashboard/metrics.ts` |
| Where is the current one-page dashboard assembled? | `src/features/dashboard/dashboard-screen.tsx`, `src/features/dashboard/views/overview.tsx`, `src/features/dashboard/views/workload-section.tsx` |
| How are dashboard preferences and refreshes bounded? | `src/features/dashboard/prefs.ts`, `src/features/dashboard/hooks.ts`, `src/features/dashboard/public-dashboard-page.tsx` |
| How do the phone shell and touch views work? | `src/hooks/use-mobile.ts`, `src/components/layout/mobile-shell.tsx`, `src/features/boards/components/mobile`, `src/features/trackers/mobile-row-editor.tsx` |
| Where is the built-in user guide maintained? | `src/features/workspace/documentation/guide-content.ts`, `src/features/workspace/documentation/documentation-section.tsx` |
| What keeps the database connection active in CI? | `.github/workflows/supabase-keep-alive.yml` |
