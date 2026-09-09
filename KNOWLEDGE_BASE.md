# Streamline knowledge base

## 1. Purpose, scope, and evidence

Streamline is an internal work-management application for the RMIT creative and marketing team. It combines configurable task boards, stakeholder booking, team allocation, deliverable tracking, spreadsheet-style trackers, discussions, direct messages, and workspace administration.

This document is a technical and operational reference for developers, maintainers, administrators, testers, and future coding agents. It describes the implementation present in this repository, explains how its parts fit together, and identifies the files to consult before changing behavior.

**Repository snapshot:** reviewed on 8 September 2026, at Git revision `05f6aca`; package version `0.8.0`. Versions, routes, constants, and commands below describe that snapshot. The repository is the evidence source; this document does not certify the configuration, migration state, availability, or test results of any deployed environment.

**Evidence precedence:** executable implementation and current configuration take precedence over old comments and existing README prose. SQL must be read in application order, including later policy replacements. Tests describe intended behavior and regression coverage; their presence does not mean they were executed or passed during this documentation task.

Only this knowledge base was created for the task. No application code, configuration, database, dependencies, or other documentation was intentionally changed. No build, development server, migration, seed, or test suite was run to prepare it.

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
| Board share | A read-only public link with optional password and expiry. |
| Dashboard | The workspace-wide figures: tasks and asset units by team, mix, workload across the year, stakeholder requests. Derived from the boards; nothing stored but its share link. |
| Invitation | A token-based onboarding link for a pending workspace member. |

### Main user journeys

- **Team member:** sign in, find a board or My Work assignment, update fields, discuss a task, track its assets, and review notifications.
- **Manager:** organize boards and groups, assign people, review workload and progress, and allocate incoming work.
- **Stakeholder:** open a booking link, submit a brief and deliverables, and receive a reference for follow-up.
- **Workspace administrator:** manage people, invitations, system entities, booking configuration, and workspace settings.
- **External board reader:** open a share link, satisfy its password gate when configured, and inspect the published board and item details.

These journeys use different access mechanisms. A booking key, board-share token, and onboarding token are separate credentials for separate purposes.

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
| `/book/[slug]/[key]` | Public stakeholder booking form. |
| `/share/[token]` | Public read-only board. |
| `/portal/[token]` | A stakeholder department's own portal: its requests, and the form to add another. |
| `/workspace/[workspaceSlug]` | Workspace home. |
| `/workspace/[workspaceSlug]/boards/[boardSlug]` | Board and selected view. |
| `/workspace/[workspaceSlug]/my-work` | Assigned work across boards. |
| `/workspace/[workspaceSlug]/inbox` | Notifications and quiet updates. |
| `/workspace/[workspaceSlug]/dashboard` | The live delivery dashboard across every board the reader can see. |
| `/dashboard/[token]` | Public, full-screen, read-only dashboard behind a share token. |
| `/workspace/[workspaceSlug]/book` | Stakeholder Portal: department links (admins) and booking from inside the workspace. The URL is unchanged; only the destination's name is. |
| `/workspace/[workspaceSlug]/members` | Member directory and administration. |
| `/workspace/[workspaceSlug]/people/[userId]` | Person profile. |
| `/workspace/[workspaceSlug]/messages` | Direct-message threads. |
| `/workspace/[workspaceSlug]/teams/[teamId]` | Team page. |
| `/workspace/[workspaceSlug]/trackers` | Tracker collection. |
| `/workspace/[workspaceSlug]/trackers/[trackerId]` | Tracker and selected sheet. |
| `/workspace/[workspaceSlug]/settings` | Workspace settings. |

Relevant query parameters are `view` and `item` on boards, `task` on a portal, `sheet` on trackers, `to` on messages, and `section` on settings.

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
| `/api/dashboard/[token]` | GET, POST | GET reports the dashboard link's gate; POST returns the trimmed workspace snapshot after password validation. |
| `/api/portal/[token]` | GET | Reports the portal gate. A closed portal and an unknown token answer identically. |
| `/api/portal/[token]/tasks` | POST | One page of the department's requests, plus totals over the whole authorised set. |
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
| Booking | Workspace booking configuration, form template, named template, request, receipt. |
| Tracker | Tracker/workbook, ordered sheet, column definition, row, primitive cell value. |
| Stakeholder portal | Department (a stakeholder group with a durable id), department portal (one per department, holding the link credentials), portal request (provenance: which task belongs to which department), portal submission (idempotency for a booking). |

Domain types use camelCase. SQL rows normally use snake_case. `src/data/supabase/rows.ts` performs conversion. JSON structures such as column settings, typed cell payloads, and tracker documents preserve their application shapes.

### Repository contracts

`Repositories` exposes `users`, `workspaces`, `onboarding`, `teams`, `boards`, `items`, `links`, `trackers`, `comments`, `itemAssets`, `bookingTemplates`, `boardShares`, `dashboardShares`, `itemReads`, `messages`, `activities`, `notifications`, `notificationPreferences`, and `admin`. `links.listByWorkspace()` exists because a workspace's item ids do not fit in one PostgREST URL: `listByItems()` builds an `or(in…)` filter that exceeds Node's 16 KB header limit past roughly two hundred ids.

A change to a contract can affect local repositories, Supabase repositories, the public memory adapter, service composition, and test fixtures. `NotFoundError` represents required missing entities; optional lookups return `null` where their contracts specify it.

### Local database

The IndexedDB database is named `rmit-streamline`, at schema version **11**. `LocalConnection` caches one opening promise per connection instance and injects a `getDb` function into repositories.

The schema covers users, workspaces, workspace members, invitations, local credentials, teams and memberships, boards and memberships, favourites, groups, columns, items, values, links, trackers and sheets, comments, assets, booking templates, shares, read markers, activity, notifications and preferences, direct messages, board visits, and metadata.

Incremental IndexedDB upgrades added links in v2, trackers in v3, messages in v4, notification preferences in v5, onboarding/credentials in v6, read markers in v7, assets in v8, booking templates in v9, board shares in v10, and dashboard shares in v11. Upgrade callbacks log when another open tab blocks progress.

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
2. If the user is the literal board owner, return OWNER.
3. If an explicit board membership exists, return its role.
4. If the user is a workspace administrator, return EDITOR.
5. If no active workspace role exists, deny inherited access.
6. For WORKSPACE visibility, return VIEWER for a non-guest; guests receive no inherited role.
7. For TEAM visibility, return EDITOR if the user belongs to the board's team; otherwise deny.
8. For PRIVATE visibility, deny inherited access.

The current database counterpart is `supabase/policies/0008_visibility_is_read_only.sql`. It replaces the older helper definition.

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

For ordinary boards, ownership and explicit membership checks occur before the null active-workspace-role check. Do not document a blanket guarantee that all ordinary-board access is removed solely by changing workspace membership status; assess the entire UI/service/RLS path and remaining board membership records.

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

### Current column types

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

The pure `matchesSearch()` helper matches item names case-insensitively. The command palette is a separate search surface. The primary due date is the first DATE column's populated value, falling back to the first TIMELINE column's end. The “this week” filter also includes today.

Column sorting uses typed values: labels follow palette rank, people resolve to names, and empty values sort last. SIZE has its defined XS-to-XL order. The underlying stored item position is not the same as the active sort order.

Board filters/search/selection are transient Zustand state. Remembered view selection is persisted separately, using both browser storage and board-visit data.

## 11. Items, links, and assets

### Item identity and lifecycle

An item has a stable entity ID, board ID, group ID, optional parent, name, description, position, creator, timestamps, archive marker, optional cover, and optional booking reference. `ItemService` orchestrates create, rename, description/reference changes, typed value changes, moves, archive/restore, deletion, and duplication.

`loadBoardSnapshot()` reads the board, groups, columns, items, values, and links. Item-panel concerns such as comments and assets also have dedicated queries. Do not assume the board snapshot contains every detail rendered in the panel.

Move and delete operations need to account for subitems and associated values. Use the service/repository implementation rather than updating one item row in isolation. Activity and notification side effects vary by operation; not every metadata write follows the same fan-out path.

### Booking references

References are separate from UUID identity, capped at seven characters, and normalized to trimmed uppercase by `normaliseItemReference()`. Ordinary newly created tasks need not have a reference. Bookings create references for the main item and their newly created asset subitems.

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

The current compact recap formatter shows quantity and people, for example `14 assets · 2 PIC`; type counts still exist in the recap data. `ItemAssetService` updates cached ASSETS_RECAP values when asset lines change.

Allocation copies asset lines to the new item. Generic linked-field synchronization does not synchronize the asset-line list or ASSETS_RECAP values. Copied allocation subitems are also not linked individually.

### Covers and avatars

| Media | Processing | Supabase storage | Local storage |
| --- | --- | --- | --- |
| Item cover | Image source up to 3 MiB; WebP at quality 0.85; longest edge at most 1600 px. | Public `item-covers` bucket, `<itemId>/cover.webp`. | Data URL saved on the item. |
| Avatar | Image source up to 10 MiB; center-cropped square WebP at quality 0.82; at most 256 px. | Public `avatars` bucket, `<userId>/avatar.webp`. | Data URL saved on the user. |

Uploads use stable object paths with a cache-busting query parameter on the stored URL. Public bucket URLs do not inherit a private board's row visibility. Storage write policies and object availability must be checked separately from table RLS.

## 12. Booking and allocation

### Access paths

Stakeholders use `/book/<workspaceSlug>/<key>`. Members use the in-app booking page, whose HTTP transport carries their session. A valid current key permits public booking; an authenticated active member can book without that key.

Generated booking keys contain 24 characters. They are distinct from seven-character booking references, which identify work for discussion and do not authorize access.

The Supabase server validates the supplied key against the workspace's stored key. A supplied invalid key is rejected even before falling back to member access. If a valid key accompanies an invalid or absent session, the request can still proceed as a public booking. The server derives a trusted member ID from Auth/membership checks and does not trust a browser-supplied actor ID.

Local booking runs directly against the local services and is a demo path. A local booking link depends on the same origin's browser data; it is not a remotely shared backend.

### Form and submission

The form includes requester name/email, department, title, brief, asset categories and deliverable lines, requested team, due date, priority, reference link, receiving-board extra fields, and custom-template answers.

`BookingRequest` represents the submitted data. `bookingRequestSchema` validates its structure, while template-aware validation applies the workspace's configured questions and requirements. Asset lines are bounded at 50; quantities, when supplied, are positive integers up to 9999.

The booking form can ask TEXT, LONG_TEXT, NUMBER, DATE, LINK, CHECKBOX, TAGS, and SIZE fields directly. Operational fields such as task ownership, internal status, and dependencies are not in that public field-type list.

### Destination selection

1. Resolve or ensure the system entities.
2. Validate the requested team as an active, non-system team in the workspace.
3. If the team has a valid active, non-system `bookingBoardId` in this workspace, use it.
4. Otherwise use Task Allocation.
5. Place the task in the destination board's first group by position.

A booking therefore does not always land on Task Allocation. Direct receiving-board configuration is a supported path.

Standard answers map to compatible receiving-board columns. Unmapped details are preserved in the description. Custom questions can target a column or the brief; missing matching destination columns cause those answers to fall back into the brief instead of disappearing.

The form can propose the item ID before submission so it can display the reference early. The service uses that ID only if it is still free, otherwise generating a new ID and returning the actual reference in the receipt.

### Created records

Submission creates the task and initial mapped values, asset subitems, structured asset lines, and administrator notifications. The main task and booking subitems receive their own references. Asset lines inherit the request due date; a single selected asset category is applied as the line type, while multiple categories do not become one arbitrary type.

These are multiple service/repository operations. The HTTP request is not evidence of one all-or-nothing database transaction across the whole booking. When troubleshooting a failed submission, inspect whether a task was already created before retrying.

The receipt contains item and board identity, board slug, direct-team name when applicable, reference, submission timestamp, and the number of asset lines.

### Allocation from Task Allocation

Allocation creates a new destination item and links it to the source request, seeding synchronized fields from that source. It copies subitems and structured assets, records the receiving board in the allocation metadata column when present, and moves the request to the Allocated group when available.

The source must be a Task Allocation system-board item. The destination must be active, non-system, in the same workspace, and have a receiving group. The UI and backend access paths must also permit the operation.

### Form editing and templates

Workspace booking form configuration lives on the workspace; named reusable forms live in booking templates. Saving a custom question to a column ensures an appropriate Task Allocation column exists, reusing by ID or compatible name/type where possible.

Removing a question does not delete its old column and historical answers. Saving an exact normalized copy of the built-in form resets the stored override to null so the workspace follows future built-in defaults. Named templates are replaced by case-insensitive name matching, and their names are capped at 80 characters.

A booking made from a department's portal takes the same path with two differences: the department is resolved from the portal credential rather than the body, and the submission is idempotent on a client-generated key. See section 13c.

## 13. Public board sharing

A board has at most one share record, containing a random token, enabled flag, optional expiry date, optional password hash, creator, and timestamps. The generated token length is 22 characters. Disabling retains the token; regeneration replaces the link credential.

The expiry is a date: `refuseShare()` rejects when `expiresAt < today`. A link remains valid on its selected expiry date under that comparison.

GET reports only gate state. POST checks availability and password before loading a public payload. The payload includes the board, groups, columns, items, values, assets, comments on those items, up to 200 recent board activities, the workspace name, expiry, and referenced people.

Cross-board links are filtered out of the payload: both ends must belong to the shared board. The memory repository then supplies this bounded data to normal board rendering while preventing writes. The shared board uses a dedicated query client and refresh interval of 10 seconds.

The public-user sanitizer currently clears the `email` field while retaining other properties on the selected user objects. It is not a strict name/avatar-only projection. Likewise, clearing profile emails does not redact email addresses or other details written into task descriptions, columns, comments, or activity metadata. Assess the actual board content and payload when deciding what a link publishes.

A share link grants access to the shared-board payload, not workspace membership. Password hashing and token validation live in the service/domain helpers, while Supabase sharing uses the privileged server transport because visitors have no normal authenticated table session.

## 13b. Workspace dashboard

Three views over one snapshot: **Overview** (what shipped, and what needs a decision today), **Demand & Delivery** (the operations review), **Resourcing** (the allocation meeting). Real tab semantics with arrow-key movement; the reading order on Overview is headline figures -> month comparison -> current operations -> attention -> upcoming, and on a 1440x900 screen everything down to the operations strip is above the fold.

`DashboardService.loadSnapshot()` reads one `DashboardSnapshot` (`src/domain/dashboard/dashboard.ts`) with a round of parallel per-board requests: every active board the reader can see, plus teams, the people named, and — since the portal work — the workspace's **stakeholder department registry**. `useDashboardSnapshot()` caches it under `queryKeys.dashboard(workspaceId)`; `useDashboardRealtime()` invalidates from a Supabase channel coalesced over 500 ms, with a 60-second refetch underneath.

### Facts, then contracts

`analytics.ts` builds the facts once (`tests/unit/dashboard-analytics.test.ts`); `metrics.ts` holds the reporting contracts (`tests/unit/dashboard-metrics.test.ts`). Both are pure, so a period or team change is a re-render.

- A **task** is a top-level, unarchived item on a board that is not Task Allocation. Linked copies count once, under the earliest.
- **Asset units** are `assetCount()` of a task's asset lines — the same figure the Assets recap cell shows. Intake lines are requests, not delivery.
- The **department** a task is for comes from its STAKEHOLDER cell, matched by column **type** and resolved against the registry, so a renamed department keeps one row in a year comparison. A board with no such column falls back to a TEXT column whose name looks like a department, and that value is marked `inferred`. Work with neither is **Unknown**, its own bucket, never folded into a real one.

### Reporting rules, and why

Two rules run through `metrics.ts` and explain most of it.

**A period is a range of days, not a year number.** `resolvePeriod` returns matched ranges: year-to-date compares 1 January to today against 1 January to the same day of the comparison year, 29 February clamping to the 28th in a common year. The previous implementation shifted the year number and kept anything inside it, so the default view compared this year to date against *all twelve months* of last year and reported the shortfall as a decline. A chosen full year that has not finished is labelled partial actuals.

**A missing value is not a zero.** No history at all reads "Unavailable"; a real zero baseline shows the absolute difference and "no % comparison"; a month the current period has not reached draws nothing rather than a zero bar. `(selected − comparison) / comparison × 100` only where the comparison is positive.

Also load-bearing:

- **No completion basis.** `TaskFact.completedAt` falls back to `item.updatedAt`, so a task renamed today would count as finished today. Created and due are offered; completed is not, and the page says so. On-time delivery is withheld for the same reason plus a second one: the due date is mutable, so a deadline extended after it was missed would rewrite history in the team's favour.
- **A due-date report never counts creation.** Undated work is excluded and reported separately as a coverage note. The old `taskDate` returned `dueDate ?? createdAt`.
- **Operations take no period.** `operations()` has no period argument at all, so a historical filter cannot hide today's overdue work. Its figures overlap — a task can be overdue and blocked — and the strip says so rather than offering a total.
- **Attention is ordered, not scored**: reason, then deadline, then name. Each task appears once under its most pressing reason.
- **Workload is association counts.** A task with two owners is counted under both and the panel says the column does not sum to unique tasks. Everybody is listed — not the busiest eight — with unassigned work as its own row and former members who still hold work. No capacity percentage exists, because effort, contracted hours, leave and commitments are none of them recorded; the Resourcing view names those four as what would be needed.
- **Asset types are measured in units.** One task can hold three types, so task counts by type would not be additive; the table says this in its caption.

### Preferences

Per user **and** workspace under `localStorage["streamline.dashboard.v2"]`, keyed `<userId>:<workspaceId>`, hydrated after mount. The old single `streamline.dashboard` key was shared by everyone on a machine and by every workspace. A stored team filter naming a team the reader can no longer see is dropped rather than silently emptying the page.

### Sharing

One `dashboard_shares` row per workspace (migration 0024, policy 0010), a service-role read behind `/api/dashboard/<token>` (`src/server/dashboard-share.ts`), and a public page at `/dashboard/<token>` that polls and blocks same-origin links out.

`publicDashboardSnapshot()` is an **allowlist built field by field**, not a spread with deletions — the previous version published anything added to the snapshot later by default. Nothing about a person travels: no users, no PERSON values, no asset assignees, no `createdBy`, no board owner. Column values are allowlisted by type (STATUS, PRIORITY, DATE, TIMELINE, TAGS, SIZE, NUMBER, CHECKBOX, ASSETS_RECAP, STAKEHOLDER, plus TEXT only where the column is plainly a department). Descriptions, notes, LONG_TEXT and LINK never travel. A public link also has **no Resourcing tab** and no owner-derived figures, because that view is individual workload. Asserted in `tests/unit/dashboard-analytics.test.ts`.

### What is deferred, and what it needs

Recorded in `docs/dashboard-revision-note.md` rather than faked: task lifecycle events (an append-only `task_events` table) for throughput, cycle time and WIP age; a committed deadline kept when the due date moves, for on-time delivery; effort and availability for capacity; a campaign entity for campaign readiness. Archived boards are still excluded from the snapshot, so archiving a finished campaign removes it from historical totals — a known limitation, not a fix in this pass.

## 13c. Stakeholder portal

Each stakeholder department gets one link showing every request it has made and a form for the next one. `/portal/<token>`; the token is the whole of the authorisation.

**Department identity.** Stakeholder groups live in Settings -> Lists as `{name, color}` with no stable id: saving a list deletes every row and re-inserts it (`WorkspaceListRepository.replace`). A portal cannot hang off that, so `stakeholder_departments` (migration 0030) gives a department a durable row, reconciled whenever the list is saved. Settings -> Lists stays the only editing surface, which is what stops the two drifting apart.

Identity flows through the `renames` map the Lists editor already produces, never a name match: renamed means the same department keeps its portal, link and history; a name that simply appears is a new department; a name that disappears has its department **disabled**, never deleted, so its requests keep their provenance. Re-adding the same word later creates a *new* department with no claim on the old one's history or credentials. `reconcileDepartments()` in `src/domain/portal/stakeholder-portal.ts` is pure and unit-tested (`tests/unit/department-reconciliation.test.ts`).

**What a portal shows** is the union of two sources, and they differ in kind:

- **The STAKEHOLDER label**: any top-level task whose stakeholder cell names this department. This is how a department sees the work it already had, rather than only what arrived after its portal existed, and in practice it is the larger half by far.
- **Provenance** (`portal_requests`): a booking made through this portal. It carries the brief the requester typed and the time it arrived, and it keeps an **unlabelled** booking visible to the department that took it.

**The label wins.** A task whose stakeholder cell names a department belongs to that department, whichever portal it was booked through: relabelling it makes it appear under the new department and disappear from the old, because that is plainly what changing the cell means. Provenance only decides for a task carrying no stakeholder label at all. (This replaces an earlier rule that a booking could not be moved by an edit.)

The label is matched by column **type**, never by column name — a board may call the column "Department" or "Requested by", and renaming it must not quietly empty a portal. The value is compared to the department name, trimmed and case-insensitively; a department rename carries its cells along (`WorkspaceListService.rewrite`), so the match survives it.

Three rules keep the list honest. Only top-level, unarchived tasks: a subitem belongs inside its parent, not beside it. Linked tasks collapse to one row, because allocation makes a second item and both usually carry the label — the booked one represents the run, else the earliest made, never "whichever changed last". And a labelled task has **no brief**: `items.description` is not a brief, it carries whatever contact details the booking writer appended.

**This is a deliberate trade.** A label any board editor can change decides what an external audience sees, and moves it between audiences. The safeguard is that portals are created switched off, and a department's whole board is one click from the management screen (Preview) before the link goes anywhere.

The management screen used to carry a request count per department. It was removed: producing it meant scoping every department on every load — the workspace's label index, then every candidate item and every link between them — which is the same work as opening every portal at once, and it made a page of switches take four seconds to show something that had not changed.

`public_brief` is stored on the provenance row because `items.description` is **not** publishable: `describeBooking()` appends every answer the receiving board had no column for, and `requesterName`, `requesterEmail` and `department` all take that path when the board lacks a column. The brief the requester typed is captured at booking time, before that happens.

**The gate.** `StakeholderPortalService.resolve()` is the single entry every scoped call goes through: token shape, portal enabled, department ACTIVE, credential version, then password. `credential_version` is what makes revocation reach a tab that is already open - regenerating a link or changing a password bumps it, and any grant carrying an older version is refused. A closed portal, an unknown token and another department's token all answer the same way, so the reply cannot be used to enumerate departments.

Portal passwords use **PBKDF2-SHA256** with the iteration count encoded in the hash (`pbkdf2$<iterations>$<salt>$<hash>`, `src/lib/auth/portal-password.ts`). This is deliberately *not* the `hashPassword()` used by board, item and dashboard shares, which is one round of SHA-256; rewriting that would invalidate every existing share password, so the two coexist and the older scheme can be migrated separately.

**A portal is a board.** A department's requests are assembled into a *synthetic* `PublicBoardPayload` (`src/services/portal/portal-board.ts`) and rendered by the application's own components through the read-only memory provider — the same mechanism the public board link uses (`ShareGuestProviders`). The department gets all seven views, the real toolbar with its search, filters, sort and grouping, and the real item panel. Nothing about the portal is a second implementation of a board.

Reconciling several boards into one is the work this does. Statuses become one label set ordered by meaning (pending, working, stuck, done) so a kanban reads left to right however each board words them; the board a request is being run on becomes the group it sits in; a column nothing would fill is left out. Two traps are recorded in the code because both cost a debugging session: `columnLabels()` returns `DEFAULT_PRIORITY_LABELS` for any PRIORITY column whatever the column stores, so a synthesised priority id renders as an empty cell — priority maps back onto the fixed four steps; and a DATE cell marks any past date on unfinished work as overdue, so "Requested" is a TEXT column, not a date.

**The payload** is an explicit allowlist (`src/domain/portal/portal-view.ts`), written field by field rather than subtracted from a row, so a column added to `items` later cannot join it by accident. Published: title, reference, the stored public brief, status (name, colour and semantic role), priority, dates, assignee display names, deliverable summaries, subitem titles, a linked-work count, and the **update thread** on a published task. Never published: requester contacts, `items.description`, the activity log, hidden columns, asset notes, mentions, who created a task, another department's anything, or a link whose other end is out of scope.

Updates travel by request of the team: the thread is how anyone finds out what is happening, and a portal that hid it sent people back to email. What the team writes on a published task is therefore read by that department — worth knowing before posting. The activity log is a different thing and stays internal: it is an audit trail of who changed which field.

Heterogeneous boards are read through `src/services/portal/portal-projection.ts`: status and priority come from the board's first column of that type, meaning travels as a role rather than a label id, a due date is the DATE column else the end of a TIMELINE, and people are every PERSON column pooled. A board with none of these emits nulls rather than guessing.

**Booking** resolves the department from the credential and overwrites whatever the body claimed. A spoofed STAKEHOLDER value cannot reach a column at all, because `BOOKING_FIELD_TYPES` excludes that type. Idempotency is a client-generated submission key, unique per portal in the database: a retry replays the first receipt, the same key with different content is refused, and a failed attempt releases its claim so the key can be reused. This is a durable claim with compensation, not a transaction - the repositories speak REST - and the write order is claim, book, associate, record receipt.

**Permissions.** Anonymous and signed-in-but-unqualified visitors read the projection and may book; nothing else. Commenting or editing a deliverable requires a verified session, an ACTIVE membership of the item's own workspace, and OWNER or EDITOR on the *concrete item's own board*. A valid link never confers a write. Policies (0013) keep `anon` and `authenticated` out of the portal tables entirely - members may read `stakeholder_departments` and nothing more - so a direct PostgREST call cannot walk round the gate; visitors are served by the service role behind `src/server/portal.ts`.

**Reads are batched, targeted and paged.** Four separate costs were found by measuring against live data, and one of them was not a performance problem at all:

- `getById`-per-item was the whole response time for a department with a few hundred tasks; items, links and comments are read with `listByIds`-style batches.
- A single `in(...)` filter over 265 uuids built an 18KB URL that PostgREST refused outright (`UND_ERR_HEADERS_OVERFLOW`). Batches are 80 ids, roughly 3KB of filter.
- The label scan walked every board in turn and read *every column value on each* — 7224 rows to answer a question about 1240. It now collects the workspace's STAKEHOLDER columns in parallel and makes one `listValuesByColumns` call. The projection did the same thing again: boards are read together and `listValuesByItems` fetches only the items in play.
- **PostgREST answers a plain select with at most 1000 rows and says nothing about the rest.** The workspace-wide label read asks for 1240 and was getting 1000, so about a fifth of labelled tasks were missing from their portal, chosen arbitrarily by whatever order the database returned. `unwrapAll` (`src/data/supabase/client.ts`) pages with `range` until a short page comes back; every read whose size grows with the workspace uses it. This affected `listValuesByBoard` too, and so the public board link — no board has passed 1000 values yet, so it had not yet bitten there.

Measured on the biggest department (265 requests): Departments tab 4214 ms -> 175 ms, first page 6167 ms -> 1429 ms, one task detail 5115 ms -> 1907 ms.

**Providers.** `StakeholderPortalService` takes an optional `PortalTransport`: set for Supabase (HTTP to the route handlers), absent for the local provider, where the same service runs in the browser. That is what lets `tests/e2e/stakeholder-portal.spec.ts` drive the real gate, projection and idempotency rather than a stand-in. What it cannot prove is RLS and the service-role handlers, which need a Supabase environment.

**Management** lives on the renamed destination (`/workspace/[slug]/book`, "Stakeholder Portal"). Admins get a Departments tab and the editable creative-team name, which is presentation only and never renames the workspace or changes its slug. Ordinary members see the booking form exactly as before, with no tabs. A portal is created **switched off**; adding a department publishes nothing.

Each department is one collapsed row: name, whether the link is live, Copy, Preview, and the open/close switch. The switch shows a spinner while the write is in flight — opening a portal writes a row and, the first time, creates one, which is long enough that a silent toggle read as broken. Everything else is behind the fold, which also puts a deliberate step between a passing glance and "New link".

Behind the fold are the portal's **presentation settings** (migration 0031, all defaulted to the behaviour a portal already had, so existing links are unchanged):

| Setting | What it does |
| --- | --- |
| Description | A line of the team's own words under the department's name, in place of the standing subtitle. 280 characters. |
| Opens on | Which of the seven views a bare link lands on. A `?view=` in the URL still wins, so a link somebody was sent opens where it says. |
| Columns | Which of the board's optional columns the department sees. **Presentation, not authorisation** — the values behind a hidden column were already published to that department, and nothing downstream may treat the setting as a boundary. A column with nothing in it is left out whatever the setting says. |
| Takes new requests | Off makes the link read-only. Enforced in `book()`, where every path to a booking passes, not by hiding the button. |
| Shows the figures | Whether the recap appears in the header. |
| Opens in | The theme the link paints before a visitor chooses one. |

Column settings are stored as **keys** (`requested`, `priority`, `people`, `due`, `timeline`, `assets`, `asset-types`), not ids: the ids are derived per department and the board is rebuilt on every read. `setPresentation` trims the description, drops unknown column keys and ignores an unknown view rather than storing something that renders as nothing.

The header leads with the **department**, not the team: whoever is reading works in that department and the page is about their work. How current the page is shows as a small glyph rather than a line of prose — turning while a read is in flight, a tick for a moment when one lands, a resting dot otherwise — with the time in its tooltip and in a live region for a screen reader.

The visitor's theme choice is stored under `streamline.portal-theme:<token>` and applied to a subtree, never to `<html>`, so it cannot touch the internal app's theme. That subtree states `light` or `dark` explicitly, never only `dark`: the `dark` variant is `&:is(.dark *):not(.light *)` (`src/app/globals.css`), and without the `.light` escape a portal set to light inside an app set to dark inherited the dark it was sitting in — one page holds both themes, which no other part of the app has to do.

The board polls every 4 seconds while the tab is in front and refetches on focus and reconnect; the header says when the figures were last true. A realtime channel would beat it and is still the next step (see section 22).

## 13d. The phone experience

Below 768 CSS pixels the application mounts a phone interface of its own. At 768 and above it serves the existing one unchanged: four screenshots taken at 1440x900 before and after the rebuild are byte-identical.

**One boundary, one hook.** `useIsMobile()` (`src/hooks/use-mobile.ts`) is the only place 767 appears. It reads a media query through `useSyncExternalStore` whose server snapshot is `false`, so the server renders the desktop branch, hydration matches, and the swap lands on the first commit. Width, never the user agent.

**One shell is mounted, not two.** `AppShell` branches on that hook and returns either the phone shell (`src/components/layout/mobile-shell.tsx`: a compact top bar and five destinations - Home, My Work, Browse, Inbox, More) or the existing frame. The other is absent from the tree rather than hidden with CSS, so its queries, subscriptions and focusable controls never exist. Providers, notifications, the command palette and the version watcher sit above the branch and are shared.

**Two new routes**, `browse` and `more`, carry what the sidebar used to: teams, boards, favourites, trackers, people; and Dashboard, Book, Messages, Members, Settings, Profile, theme, About, sign out. Every other destination keeps its existing URL.

**Boards.** The Main Table becomes a grouped card list carrying status, priority, owners, due date, overdue, blocked state and the booking code; the real grid stays one tap away and scrolls inside its own box. Kanban shows one lane at a time with an explicit "Move to" control instead of dragging. The five date-axis views keep their existing implementations, framed to the screen. Task details open full screen, fields stacked, and every column type edits through a bottom sheet because `PopoverCell` renders a `Sheet` below 768 - one change that gives every column type a touch editor with no second implementation.

**Presentation is new; logic is reused.** Nothing is reimplemented: the mobile board reads the same `BoardModel`, writes the same `useBoardMutations`, and drives the same `board-ui-store`. Where a rule lived inside a desktop component it was extracted rather than copied - Kanban lane building into `useKanbanLanes`, the member row's mutations into `MemberActions`.

**Touch sizing lives in the primitives.** Button, Input, Textarea, Select, Tabs and the dropdown rows carry `max-md:` variants giving every control a 44px floor and 16px text (16px specifically because iOS Safari zooms a focused input below that). These are added variants, never changed defaults, which is why desktop output is identical.

**State isolation** is the rebuild's one non-negotiable, and it has three parts. The narrow-screen sidebar fold is derived (`preferCollapsed || autoCollapsed`), never persisted - the old shell wrote `setSidebarCollapsed(true)` into the shared preference, which then followed the reader back to their desktop. Phone-only presentation choices (cards or grid, the mobile Kanban's lane) live under `streamline.mobile-view`. Explicit view switches still go through the normal `setView`, and deep-linked `?view=` and `?item=` keep working on both.

Related: `useUiStore.persist.rehydrate()` runs in a parent effect while the sidebar's team auto-expand runs in a child one, and child effects run first. Opening straight onto a board therefore used to persist the session's defaults over the reader's saved sidebar width; the auto-expand now waits for hydration.

## 14. Personal work and collaboration

### Home and My Work

Home combines workspace activity, teams, favourites, recent boards, and personal work. Board visits store recent-access information and remembered view preferences.

`MyWorkService.listAssigned()` considers non-archived boards and tasks returned by their repositories, checking every PERSON column for the requested user. It uses the first STATUS and PRIORITY columns for their summaries, the first DATE value with TIMELINE-end fallback for due dates, and semantic done-label IDs for completion.

Sections are Overdue, Today, This Week, Later, No Date, and Completed. Completion takes precedence over date grouping. Results sort by due date and then name. Linked entries present in the assignment result collapse into one representative row, with other linked boards recorded alongside it.

Asset-line assignment and task PERSON-column assignment are different records. Do not assume assigning an asset automatically gives the containing task a My Work assignment.

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

### Item Updates and rich text

Rich-text editing and rendering use shared components and Tiptap. The domain helpers in `src/lib/rich-text.ts` and `src/lib/rich-text-doc.ts` support conversion and document interpretation. Mentions have semantic user IDs used by notification behavior, not just visible `@name` text.

Comments use the service layer for posting, editing, deleting, and notification handling. Item read markers record when a person caught up on an item's Updates. The updates badge combines relevant comments/read information rather than acting as the workspace notification counter.

### Direct messages and profiles

Direct messages are one-to-one workspace threads with sender/recipient identity and read tracking. `routes.messages()` supports selecting a conversation with `?to=<userId>`. `MessageService` and the message repositories implement thread loading, creation, read marking, and deletion.

Profiles combine person information and related work. Avatar processing is provider-aware as described earlier. Historical users remain available for resolving names even when they are not eligible for new assignments or mentions.

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

The hook registers unsaved work during the debounce/write interval. Its unmount cleanup currently clears the timer; despite a nearby “flush” comment, that cleanup does not itself call `saveSheet()`. Do not promise automatic saving during every navigation path based on that comment. Wait for a successful save state before leaving work that must be retained.

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

`useBoardRealtime()` subscribes to item, value, group, column, comment, asset, link, activity, and notification changes. Board-scoped tables use board filters where possible. Some tables, such as values and comments, are item-keyed and use broader subscriptions followed by query refetching.

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
| Task data | Selected repository provider |

UI-store persistence hydrates after mount to avoid server/client markup mismatches. The sidebar width is constrained between 240 and 480 pixels.

### Unsaved-work guard

`beginUnsavedWork()` increments a shared in-flight count and returns an idempotent completion callback. While the count is positive, the beforeunload handler asks the browser to confirm leaving. Call completion in `finally` so failed operations do not leave the guard active forever.

This mechanism protects registered in-flight work. It is not durable offline queuing, a guarantee that every draft is registered, or a transaction spanning network requests. Validate navigation and failure paths when adding debounced writes.

## 17. Database operations

### Current schema heads

The latest applied SQL is `migrations/0031_portal_presentation.sql`, after `0030_stakeholder_portal.sql` with `policies/0013_stakeholder_portal_policies.sql`; the local IndexedDB schema is at `DB_VERSION = 14`. All additive: 0030 creates four tables and adds `workspaces.creative_team_name`, 0031 adds five defaulted columns to `department_portals` (description, hidden_columns, default_view, allow_booking, show_recap), and v14 adds four object stores. Nothing existing was altered, so an upgrade keeps every row — and because 0031's defaults are the behaviour the code already had, a portal created before it behaves identically after.

New SQL takes the next free number in each directory. Do not edit a file that has been applied - the runner records a checksum and will refuse it.

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

Policy files 0001–0010 cover base RLS, item links, trackers, notification preferences, invitations, system entities, booking templates, read-only workspace visibility, board shares, and dashboard shares. Later definitions may replace earlier helper functions.

Storage-related SQL is advisory in places because the connected database role may not be able to alter Storage objects. A completed migration run should be followed by verification of the required buckets and policies when testing uploads.

### Seed modes and side effects

`npm run db:seed` runs **`scripts/db-seed.mts`**, building from the TypeScript seed modules. It is not merely a wrapper that executes `supabase/seed.sql`.

The full seed creates/updates demo Auth accounts, recreates pending accounts as needed, deletes the seeded workspace and specified seed-user notifications, and writes a fresh bundle. It can replace hand-edited work inside that seed workspace. Treat it as a reset of that demonstration dataset.

`npm run db:seed:topup` runs `scripts/db-seed-topup.mts`. It adapts extras to existing content, checks relationships, and inserts with `ON CONFLICT DO NOTHING`. It is designed to add demonstration content without updating existing rows.

The seed has built-in demonstration passwords and environment overrides. Read the script for those defaults when using an isolated demo environment; do not assume they match a separately administered deployment. Pending invitation links printed by seed tooling are credentials for completing those accounts.

`scripts/add-user.mjs` is an administrative account/membership creation path with email, role, name, title, and password inputs. `scripts/refresh-demo-data.mjs` mutates demonstration wording/completion data; it is not a read-only report.

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

### Local Playwright

`playwright.config.ts` runs one worker with full parallelism disabled. It uses Desktop Chrome settings at 1440 × 900 and base URL `http://localhost:3100`. The web server starts through `npm run dev -- --port 3100`, with `NEXT_PUBLIC_DATA_PROVIDER` pinned to local unless `PW_PROVIDER` overrides it.

It reuses an existing server outside CI, retains traces on failure, and allows one retry in CI. If a server is reused, verify that server's actual provider; a configured launch environment does not reconfigure a process that is already running.

Suites exercise board lifecycle, groups/items, columns, filters/sort/drag/drop, multiple views, deep links, cross-view sync, permissions, teams/members, onboarding, messages/account behavior, notifications, bookings, assets/covers, references, trackers, mobile layout, large boards, accessibility, and version notices.

`tests/e2e/mobile-layout.spec.ts` covers the phone shell, the card list, all seven views, the contained grid, the explicit Kanban move, ID search, a full-screen item with its deep link and Back, and every destination for overflow; two of its cases assert the 767/768 boundary by resizing live, and a desktop-to-mobile-to-desktop round trip that leaves a non-default sidebar width alone. `tests/e2e/stakeholder-portal.spec.ts` drives the portal end to end on the local provider: opening a department's link, booking through it, cross-department isolation, revocation, the password gate, theme isolation, deep links, and that a signed-out visitor is offered nothing to write with.

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
| Booking lands on a team board | Direct receiving board | Inspect the team's `bookingBoardId`. |
| Booking remains on Task Allocation | No valid direct receiving board | Check selected team and receiving board archive/system/workspace state. |
| Booking error after a long wait | Multi-operation submission | Check whether task/assets were partly created before resubmitting. |
| Linked status does not transfer | Label translation | Check target label names, mapping report, and excluded fields. |
| Link creation is refused | Link-chain invariants | Check workspace, board, duplicate link, and one-item-per-board chain rules. |
| Assets differ across allocated copies | Copy semantics | Asset lists are copied at allocation, not generically linked afterward. |
| Completed-looking work remains in My Work | Status semantics | Inspect the first status column and its done-label IDs. |
| Asset owner sees no task assignment | Different assignment model | Check task PERSON values separately from asset assignees. |
| Inbox count differs from task updates badge | Different read-state models | Inspect delivery/read state and item-read markers separately. |
| No OS notification | User preference/browser permission | Check loud delivery, board mute, browserEnabled, and browser permission. |
| Another tab shows stale local data | Local broadcast/origin | Check same origin, BroadcastChannel support, and invalidation. |
| Another user shows stale Supabase data | Realtime/RLS | Check publication, subscription, readable rows, and query invalidation. |
| Local upgrade is blocked | Open IndexedDB connection | Check other tabs holding the prior database version. |
| Avatar or cover upload fails | Conversion or Storage | Check source type/size, bucket existence, and write policies. |
| Public share works but reveals more detail than expected | Payload content | Review descriptions, values, comments, activity, and actual user projection. |
| Tracker formula imports as blank | Missing cached Excel result | Inspect the workbook's saved formula result and import support. |
| Tracker edit disappears around navigation | Debounce/unmount path | Check saving state and `useSheetEditor()` cleanup. |
| Migration says a file changed after application | Checksum drift | Add a follow-up migration; do not assume the changed file reran. |
| Deployment notice appears after a rollback | Build identity comparison | Any differing build/version counts as a change. |

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

Review domain definitions, Zod validation, template normalization, template-required validation, form controls, mapping to receiving columns, description fallback, default system columns, direct destination behavior, and allocation transfer. Retain historical answers when removing or redirecting a field.

Test both public-key and active-member paths, with direct team reception and Task Allocation fallback. Do not trust actor IDs supplied by an unauthenticated browser.

### Changing the stakeholder portal

Anything a visitor can see passes through three places, and all three have to agree: `portal_requests` decides *which* tasks (never a label), `src/domain/portal/portal-view.ts` decides *which fields*, and `src/services/portal/portal-projection.ts` decides how a board's own columns become those fields. Adding a field means adding it to the view model by name - the payload is an allowlist, not a subtraction, so nothing joins it by accident.

Every scoped call must go through `StakeholderPortalService.resolve()`; that is the only place the token, the switch, the department's status, the credential version and the password are checked. A write additionally re-checks the portal scope and a seat on the concrete item's own board, and never trusts an actor id from the body.

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

Update this file when provider defaults, roles, routes, scripts, domain types, persistence versions, or supported workflows change. Distinguish implementation, intended behavior, tested behavior, and deployed behavior. Prefer explaining a rule and naming its source over copying long code blocks that will drift.

## 22. Documentation discrepancies and implementation limits

The following findings explain why some older repository prose may disagree with this knowledge base. They are observations from static inspection, not claims that every associated failure has been reproduced.

| Older wording or easy assumption | Current implementation |
| --- | --- |
| Local is the default provider | Supabase is default, with fallback to local when public credentials are missing. |
| Supabase is future work or a stub | Complete provider repositories, auth, transports, realtime, and smoke tests exist. |
| Workspace visibility gives every member editing | The current helper and policy 0008 return VIEWER for visibility-only non-guests. |
| Team membership always grants editing on any team-associated board | The TEAM visibility branch grants editing; WORKSPACE visibility has its own VIEWER branch. |
| Service role is used only for onboarding/seed | Public booking and board sharing also use it. |
| Every booking goes to Task Allocation | A valid selected team's receiving board takes direct bookings. |
| The Files column and workspace-files instructions describe current attachments | FILES is absent from the current domain union; covers and avatars use distinct storage helpers. |
| Every item reference is derived from the ID tail | Runtime generation uses a digest; legacy migration backfills have their own transformations. |
| Assets recap always displays quantity, types, and people | The current formatter displays quantity and people; type counts remain in data. |
| "Book a task" is a booking page | The destination is now Stakeholder Portal at the same URL: department links for admins, the same booking form for everyone. |
| Stakeholder groups are just words in a list | They are still edited only in Settings -> Lists, but each one now also has a durable `stakeholder_departments` row, reconciled on save. |
| A share password is a salted hash | Board, item and dashboard shares use one round of SHA-256. Only portal passwords are adaptive (PBKDF2). Migrating the older scheme is outstanding work. |
| The portal updates live | It polls every 15 seconds and shows when it last refreshed. A department-scoped realtime channel is designed (broadcast, no row data) but not yet wired. |
| The portal offers all seven board views | It offers a grouped list with search and totals. Kanban, calendar, timeline, gantt, workload and chart are outstanding. |
| A portal shows only what was booked through it | It shows the union of bookings and STAKEHOLDER-labelled tasks, and the label wins: relabelling a task moves it between portals. The label is matched by column type, so renaming the column changes nothing. |
| The portal has a list of its own | It is a board. The department's requests are assembled into a synthetic `PublicBoardPayload` and rendered by the app's own views and item panel. |
| Internal updates never reach a portal | They do. The update thread on a published task is part of the payload; the activity log is not. |
| A plain PostgREST select returns every row | It stops at 1000 and says nothing. Reads that grow with the workspace go through `unwrapAll`. |
| The dashboard shows "assets delivered" | It shows asset **units in the period**, labelled as such. The old headline counted unfinished assets under a "delivered" label. |
| The dashboard can report completion or on-time delivery | It cannot, and does not try. There is no completion event; `completedAt` falls back to the item's last edit. |
| Year comparison compares two years | It compares two matched *ranges*. Year-to-date is against the same elapsed days, not the whole prior year. |
| The public dashboard is the internal one minus a few fields | It is an allowlist built field by field, with no people in it and no Resourcing tab. |
| Portal writes are transactional | Booking is a durable claim with compensation, not a database transaction; the repositories speak REST. A crash between booking and association leaves a claimed key that is released on the next failure path only. |
| RLS for the portal is verified | Only the local provider is exercised end to end. Policy 0013 and the service-role handlers need a Supabase environment to prove. |
| Public user payload is only name/avatar | `toPublicUser()` currently clears email and retains the rest of the selected user object. |
| Tracker cleanup flushes a pending debounce | The inspected cleanup clears the timer without performing the documented flush. |
| Migration dry-run makes no database writes at all | It skips migration bodies but still ensures the migration ledger and its RLS. |
| Editing an applied migration updates the target database | The runner warns about checksum drift and does not reapply that file automatically. |
| Switching providers transfers data | It selects another persistence implementation; no transfer is triggered. |
| A successful optimistic UI edit is already durable | Durability follows repository completion; registered pending writes use a beforeunload guard. |
| All operations in one booking request are atomic | Booking is composed from multiple repository calls; no enclosing transaction is visible in that service path. |
| Tracker `.xlsx` support means full Excel compatibility | The app has a smaller typed-cell model and imports formula results rather than executing arbitrary formulas. |

Other practical boundaries include provider-specific behavior for full export/reset, browser-origin scope in local mode, public media bucket URLs, and system-board operations protected by both access rules and service constraints. These should guide maintenance and testing without being mistaken for a completed production security or reliability audit.

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
| What are effective board permissions? | `src/lib/permissions/permissions.ts`, `supabase/policies/0008_visibility_is_read_only.sql` |
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
