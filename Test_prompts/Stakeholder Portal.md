# Build the Stakeholder Portal for RMIT Streamline

Implement a complete Stakeholder Portal in the existing application. Inspect the code, write a concise implementation plan, then build and verify the feature. Do not stop at a proposal, static prototype, or frontend connected to mock production data.

## 1. Product goal and scope

External departments currently submit tasks through the public booking form, but have no central place to follow progress and outcomes. Individual public board/item links become difficult to manage as their requests grow.

Give each stakeholder department one dedicated portal link containing:

- "Our tasks": one consolidated board showing that department's requests, with search, filters, grouping, multiple views, and live updates.
- "Book a task": the existing booking experience, scoped to the department and preserving form customization and templates.
- Task details showing progress, deliverables, and appropriately exposed linked work.
- Optional staff sign-in. Qualified board members can comment and edit assets through the portal without navigating into the internal application.

Inside the application, rename the "Book a task" navigation destination to "Stakeholder Portal". Its management screen organizes portals by department while retaining the existing booking form editor, templates, preview, and internal booking capability.

Deliver this for desktop and mobile. Preserve unrelated desktop layouts and all ongoing mobile-rebuild work. Do not turn this into a redesign of the entire app.

## 2. Repository discovery and working rules

Repository: E:\WORK_OFFLINE\apps\RMIT_Streamline

Read AGENTS.md, CLAUDE.md, README.md, KNOWLEDGE_BASE.md, package.json, and relevant source before coding. Read the relevant installed Next.js guides under node_modules/next/dist/docs as AGENTS.md requires. Current executable source and migrations take precedence over older documentation.

Inspect git status first. Preserve all existing uncommitted changes, including the mobile rebuild, search improvements, and any newer features. Re-read a file before editing if it may have changed during your work. Do not reset, discard, or overwrite other work.

Inspect at least these areas, relative to the repository root:

- src/features/booking/ and src/services/booking-service.ts
- src/services/booking.ts and src/domain/booking/
- src/server/booking.ts and src/app/api/book/
- src/domain/workspace/workspace-list.ts and src/services/workspace-list-service.ts
- src/data/local/repositories/workspace-list-repository.ts
- src/data/supabase/repositories/workspace-list-repository.ts
- src/domain/item/item.ts, item-link.ts, and item-asset.ts
- src/services/item-link-service.ts and existing asset/comment services
- src/features/share/, src/server/share.ts, and src/server/dashboard-share.ts
- src/lib/permissions/permissions.ts and the applicable RLS policies
- src/data/repositories/, src/data/local/, src/data/supabase/, and src/data/memory/
- src/data/supabase/client.ts and src/features/data/data-context.tsx
- src/components/layout/, current mobile navigation, src/lib/routes.ts, and search navigation
- Existing unit, E2E, sharing, booking, and authorization tests

Implementation facts observed when this prompt was prepared; verify them against the current checkout:

- Stakeholder groups already exist as STAKEHOLDER_GROUPS in workspace lists. Reuse this vocabulary rather than hardcoding departments.
- STAKEHOLDER column values currently store a group name, not a stable department ID.
- Both workspace-list repositories currently replace lists by deleting and recreating rows. Existing option IDs therefore are not stable across saves.
- Workspace-list defaults may exist only in memory until first saved. The service's stakeholder usage/rename handling is incomplete for the newer stakeholder column.
- Booking currently accepts free-text department information and routes to a team's receiving board or Task Allocation.
- Allocation creates another item and an item link. Assets/subitems are copied; do not assume all of them remain synchronized.
- ItemLink stores an unordered pair sorted by ID. itemAId is not evidence of the origin. Linked tasks may share references and Updates.
- Current privileged repository routing uses a process-wide client override. Do not introduce request-specific users, departments, or authorization state into that global mechanism.

## 3. Explicit product decisions

Use these defaults unless the current implementation establishes a compatible, stronger approach. Document any necessary departure before implementing it.

1. "Department" means the workspace stakeholder group, not the creative delivery team and not a user's free-text profile department.
2. A department portal shows the department's requests collectively. It is not a personal requester inbox. Anyone holding its valid link and optional password can see its published task projection.
3. "Single board" means one virtual, aggregated portal board. Do not physically move requests, create duplicate business tasks, or merge internal boards to implement it.
4. Keep existing receiving-board and Task Allocation routing intact.
5. Portal booking determines the department on the server. A caller cannot select another portal's department by editing JSON, URLs, extra fields, or form answers.
6. Portal membership is an explicit, stable association. A mutable display label or matching requester email must not authorize access.
7. New department-portal bookings join that department automatically. Existing tasks can be associated through an authorized administrative import/assignment flow. Do not silently publish historical tasks merely because a free-text label happens to match.
8. Ordinary edits to a STAKEHOLDER label do not silently move a published request between departments. If reassignment is supported, provide an explicit authorized action that updates portal ownership and display values together, records the change, and removes access from the former department.
9. Each request retains a canonical origin. Linked copies appear inside details, not as duplicate top-level requests. Explicitly associated, unlinked legacy tasks can be canonical requests too.
10. Anonymous visitors can book and read the portal-safe projection. They cannot comment, edit assets, modify task fields, or administer portals.
11. Signing in does not widen the portal's department scope or bypass its password/revocation gate.
12. Changing a department name must not break its link, lose its requests, or create another department.

## 4. Department identity and portal data model

Design the smallest durable model that supports the feature. Write down the entities, constraints, and ownership rules before implementing migrations.

Requirements:

- A stable workspace-scoped department identity integrated with stakeholder groups.
- One portal configuration per department, enforced by a database uniqueness constraint.
- Portal configuration for enabled/disabled state, dedicated link credentials, optional password, default theme, and credential version/revocation.
- An editable workspace-level creative-team display name, with the existing workspace name as fallback. This is presentation metadata; it must not rename the workspace or change its slug.
- Explicit request provenance: workspace, department, canonical origin item, booking time/source, and a durable relationship to allocated/linked work where needed.
- An idempotency identity for portal submissions, separate from the short human task reference.
- Foreign keys and workspace consistency constraints wherever practical; request validation alone is insufficient.
- Indexes for scoped request listing, task lookup, origin relationships, and stable pagination.

Resolve list identity first: either preserve stakeholder option IDs through saves, with a compatible repository contract, or use a durable department registry integrated with that list. Do not reference replace-on-save IDs and assume they remain stable. Avoid creating two independently editable lists that drift apart.

Handle defaults materialization, adding departments, rename, ordering, empty lists, disable, deletion, and explicit merge/replacement. Prefer disabling departments with history. Removing a list option must not cascade-delete tasks or transfer their visibility to another department accidentally. A later department with the same name must not inherit the previous department's history or credentials automatically.

Use additive migrations with the next available numbers; do not assume a particular migration number is still free. Do not edit deployed migration files. Implement matching local IndexedDB upgrades and repository behavior. Existing data must survive upgrades.

Provide an idempotent legacy association/backfill mechanism with a dry-run report: exact mapping rules, proposed associations, conflicts, unmatched labels, and ambiguous origins. Never infer canonical origins from lexicographic UUID order, duplicate titles, short references, or timestamps alone. Leave ambiguous cases unexposed for administrator review.

## 5. Portal management inside the application

The renamed Stakeholder Portal destination must remain reachable from desktop sidebar, mobile navigation, search, and existing internal links.

Use department cards or rows showing:

- Department name and enabled state
- Copy/open/preview portal link
- Password protection state, without exposing the password
- Default theme: light, dark, or system
- Enable/disable and regenerate/revoke link actions
- Relevant task count based on canonical requests

Provide the creative-team name setting and retain all existing form-editing and template actions. Keep a clear path to book internally. Ordinary members must not lose internal booking just because the management screen has admin-only controls.

Only authorized workspace administrators/owners can manage portal configuration, departments, publication/legacy associations, and link/password settings. Enforce this on the server and in RLS as applicable, not just by hiding buttons.

Use the workspace's existing booking form/template as the shared default. Do not create an unrelated form engine or add per-department form forks without a demonstrated requirement.

Regenerating a link invalidates the old link and existing access grants. Disabling a portal blocks both browsing and booking. Password changes invalidate prior password grants. Preserve ordinary task history.

## 6. External portal experience

Provide a branded header with the editable creative-team name, visible department identity, a prominent search field, theme control, and staff sign-in/account action.

Use clear "Our tasks" and "Book a task" navigation. Landing on the department link should make task tracking immediately discoverable. Deep links must support a selected task and relevant view/filter state. Browser Back and refresh must work without losing context.

Search must operate only on the department's authorized portal data, including task title, reference, and approved public text. Do not call the workspace-wide command palette or return inaccessible autocomplete suggestions, counts, people, or boards.

Task presentation should expose title, reference, public status, PIC/assignees, due date/timeline, priority where available, deliverable progress, and linked-work indication. Support grouping by status, PIC, and source team/board where that label is approved for publication, with filters and sorting.

Retain the existing board view choices where their meaning can be supported: table/list, Kanban, Calendar, Timeline, Gantt, Workload, and Chart. All summaries must derive solely from this portal's authorized canonical requests. No fake charts, placeholder tabs, or links requiring anonymous visitors to enter internal boards.

Adapt heterogeneous source columns into a typed portal view model. Do not join status/PIC/date fields by display name alone or reuse another board's label IDs. Reuse semantic status-role and date/assignment helpers where appropriate. Define deterministic handling for custom statuses, multiple assignees, missing dates, unassigned work, and absent numeric fields. Grouping by multiple PICs may show a request in several groups, but unique task totals must remain deduplicated.

Define calculations across the full authorized result set: do not label statistics from one loaded page as department totals. Use bounded server-side queries/aggregations and stable pagination or cursors. If a view requires a limit, expose that limitation clearly instead of silently omitting requests.

On mobile, use readable task cards, reachable filters, full-screen details, touch-sized controls, and contained scrolling for genuinely wide views. Reuse current mobile primitives. Preserve keyboard access, focus restoration, contrast, zoom, and reduced motion.

A visitor's theme override is local and portal-scoped. It takes precedence over the configured default without changing the internal app's theme preference. Avoid hydration flashes.

Include deliberate states for empty departments, no search results, loading, password entry/error, disabled/revoked links, unavailable items, expired staff sessions, failed requests, and stale/offline data. Show a timestamp or connection state when updates are stale.

## 7. Canonical tasks and linked details

List each associated canonical origin exactly once. Allocation must not create a second top-level portal row. Preserve origin identity through moves, reallocation, unlinking, and additional links.

The origin row's fields come from its defined canonical source and existing synchronization rules. Do not pick whichever linked task most recently changed or silently merge unrelated status labels. If excluded link fields cause differences, expose approved linked-task summaries separately rather than inventing a combined status.

Details should include:

- Canonical task identity and approved brief/fields
- Deliverables/assets and their current state
- Subitems where approved for public display
- A linked-work indicator and linked-task summaries/details
- Appropriate sign-in and permitted comment/asset actions

Resolve linked-work traversal with cycle protection and explicit bounds. Sharing an origin does not publish every recursively reachable internal task. Return only relationships approved as part of that request's portal projection, and never cross a department/workspace boundary. Show a neutral restricted/unavailable indicator when appropriate; do not expose hidden task names through it.

Do not change existing link exclusion or shared-Updates semantics to make the portal easier. Verify which assets are copies versus synchronized records. Show and edit the asset belonging to the selected concrete item; do not imply that all linked copies share one asset state.

Completed requests remain browsable/filterable. Archived requests can appear through an explicit archived filter if still authorized; deleted or unpublished requests become unavailable. Never silently substitute a linked copy when the canonical item disappears. Any origin replacement must be an explicit administrative operation.

## 8. Access, public payloads, and authenticated actions

Document and implement a permission matrix:

| Visitor | Browse department | Submit booking | Comment / edit assets | Manage portal |
| --- | --- | --- | --- | --- |
| Anonymous with valid portal access | Portal-safe projection | Yes | No | No |
| Signed in without qualifying board membership | Same portal projection | Yes | No | No |
| Qualifying member with read-only board role | Same portal projection | Yes | No | No |
| Qualifying board editor/owner | Same portal projection | Yes | Allowed actions on that concrete item | Only if separately a workspace admin/owner |
| Workspace admin/owner | Via valid portal access, or authenticated admin preview | Yes | Only if the item action meets its board policy | Yes |

For this feature, "part of the board" means actual board ownership or explicit board membership, plus an active membership in the correct workspace and the existing action permission. Do not grant portal writes from a matching email domain, department label, unrelated workspace membership, or broad workspace visibility alone. Keep native internal authorization unchanged.

Every mutation must verify the real session server-side, the active workspace membership, qualifying membership/ownership of the concrete item's board, action permission, current portal gate, and the item's inclusion in the current portal. For asset IDs, verify their owning item and board as well. Ignore client-supplied actor IDs and roles.

Re-check permission for linked-task actions against that linked task's own board. Permission on the origin does not confer editing on every linked copy. Reuse existing comment/asset services, validation, attribution, activity, and notification behavior. Scope portal mutations to comments and assets; do not accidentally expose general board editing through a reused component.

Public data must be assembled as an explicit server-side allowlist. Never download all workspace boards/items and filter in the browser, and never serialize a service-role repository response wholesale.

Default public fields: request title/reference, sanitized requester-supplied brief, approved status/priority/date/PIC display values, and approved deliverable summaries. Audit actual storage: booking descriptions may embed requester contact information and internal metadata, so raw description is not automatically a public brief.

Do not expose requester emails, arbitrary member profiles, internal comments/activity, hidden columns, internal allocation notes, credentials, unapproved asset notes/URLs, or unrelated linked content. Use structured provenance/public fields rather than fragile string stripping. If external outcomes need URLs, publish only fields intended for that purpose, with existing URL validation.

Existing internal Updates can contain sensitive discussions across linked boards. Anonymous visitors do not receive these threads by default. Signed-in eligible users may access authorized threads through separately verified endpoints; no internal thread may enter the anonymous response/cache. Do not introduce an entirely separate messaging system. Clearly distinguish staff-only comments from anything externally visible.

All list, search, counts, details, linked details, and event endpoints must apply identical scope checks. Return controlled errors that do not reveal whether another department's task exists.

Dedicated links use cryptographically random, unguessable credentials. Department slugs and short TA references are labels, never authorization. Do not enumerate other departments or links on the public page.

Verify optional passwords server-side with a salted, adaptive password hash. Never store plaintext passwords or grant access based on localStorage flags. Use bounded, portal-scoped access grants with credential-version checks and expiry. For cookie-based grants, use appropriate Secure/HttpOnly/SameSite settings and CSRF protection on unsafe operations. Keep passwords out of URLs. Document token storage and how authorized admins can copy or regenerate links.

Use private/no-store responses for scoped or authenticated data and prevent CDN/cache mixing. Scope client query keys by portal and authorization context; clear sensitive cached data on logout, portal change, or gate failure. Use a restrictive referrer policy on portal pages and redact credentials from application logs/analytics. Protect public unlock/submission endpoints with bounded request validation and server-side rate limiting that works across deployed instances.

RLS must prevent anonymous direct reads of portal configuration/provenance and internal task tables. Privileged server reads are acceptable only behind explicit scope validation and projection. Never put service-role credentials in browser code. Keep per-request clients/context isolated; do not set a global override to a user-specific client.

## 9. Booking integration and reliability

Reuse the existing form rendering, validation, templates, extra-field mapping, routing, assets/subitems, reference generation, and notifications.

The external department form displays its department as fixed context. Resolve the actual department from the validated portal credential on submission. Neither free-text department nor STAKEHOLDER extra values can override it. Validate team/board/column references against the resolved workspace and configured form.

Persist task creation and its portal association as one consistent operation. Handle subitems/assets and notifications so a partial failure cannot leave an invisible request or create duplicate bookings on retry.

Use a client-generated submission key scoped to the portal and enforced by a database uniqueness constraint. Retrying the same request returns the original receipt. Reusing the key with a different payload is rejected. Concurrent double submissions must not create duplicate items/assets. A reference or proposed item ID is not sufficient idempotency by itself.

Prefer a database transaction/RPC for the necessary atomic writes or a justified durable operation record with recovery. Do not claim a JavaScript Promise.all makes separate REST writes transactional. Preserve business validation and audit behavior when introducing an atomic path. Send notifications after durable commit with deduplication/recovery as needed.

After submission, show the existing receipt/reference plus "View request" and "Back to our tasks" links. The request must be visible immediately in the correct portal, including while waiting on Task Allocation. Do not report successful submission until the durable request/association is complete.

## 10. Live updates and consistency

Live updates are part of the feature, not a manual refresh button.

Cover canonical task changes, relevant linked summaries, assets, approved updates, association/reassignment, archival/deletion, and portal revocation/configuration changes.

Use a secure, deployable real-time mechanism supported by the installed stack. Do not weaken internal-table RLS to subscribe anonymously. A private, authorized invalidation channel followed by a scoped refetch is preferable to broadcasting raw internal rows. If a server stream is chosen, account for the deployment's connection/runtime limits.

Events must be department-scoped and carry no unauthorized details. Revalidate access when fetching and after credential changes. Link/password revocation must terminate or invalidate previous grants/subscriptions and clear the open portal's protected content within a documented, tested interval.

Target visible updates within five seconds on a healthy connection. Measure this in integration tests. Use bounded polling as an explicit fallback, not as an unreported replacement for realtime. Reconcile on reconnect/focus, back off on errors, cancel stale requests, clean up subscriptions, and avoid background request storms.

Apply invalidations to lists, search, details, counts, and charts while preserving filters, scroll, and unsaved edits. Handle stale mutation responses and conflicts without silently replacing newer work. Define a version/updatedAt conflict strategy for asset edits if existing services lack one.

## 11. Compatibility and delivery architecture

Preserve existing /book links as booking-only access unless intentionally mapped to a department through an administrative migration. An old workspace-wide booking key must never gain access to all department task lists. Preserve existing board/item/dashboard share links and their independent gates.

Keep the existing internal booking route working or provide a compatible redirect preserving valid state. Update navigation labels and search entries consistently without duplicating destinations. Staff sign-in returns to the same portal/task using a validated same-origin return path; reject open redirects.

Build through the existing domain → repository → service → feature pattern. Define explicit portal DTOs and transport validation. Reuse safe rendering and pure mapping/filter/aggregation helpers, not internal page components that independently fetch unrestricted workspace data.

Support Supabase production and equivalent local-provider feature behavior for deterministic tests. Extend the public memory adapter only where useful; it must remain unable to perform unauthorized writes. Local tests do not prove Supabase authorization. Exercise RLS and privileged endpoints separately.

Avoid N+1 loads for every task and unbounded all-workspace scans. Filter/index by authorized workspace/department first, then load bounded related data. Document pagination and aggregate semantics. Use the current supported dependencies before introducing new ones.

## 12. Verification and acceptance criteria

Create deterministic fixtures with two departments in one workspace, another workspace, direct bookings, allocated requests, linked chains/cycles, duplicate short references, custom labels, differing source schemas, and an ambiguous legacy request. Include owner/editor/viewer, inactive member, unrelated workspace member, and anonymous sessions.

Required tests:

1. Department creation, rename, reordering, disable, password changes, and link regeneration preserve correct identity and history. Re-saving workspace lists does not orphan portals.
2. A portal sees only its associated requests. Tampered department/workspace/item/asset IDs are denied for list, search, counts, details, linked details, comments, assets, and events.
3. Optional-password protection is enforced on every protected endpoint, not only the landing page. Old links/grants fail after revocation, including in an already-open tab.
4. Direct anonymous Supabase requests cannot bypass the portal projection. Authenticated responses never leak into anonymous caches.
5. Department-scoped booking ignores/rejects spoofed department context, preserves routing/templates/validation, and produces a trackable receipt.
6. Double taps, parallel retries, changed-payload idempotency reuse, and injected write failures cannot create duplicate or unassociated requests.
7. Canonical origins appear once; allocation/linking does not duplicate rows or totals. Missing origins and cycles are handled deterministically. Restricted linked data is not exposed.
8. Status/PIC/date mappings and every supported view work across heterogeneous boards. Search, grouping, pagination, and totals are correct beyond one page.
9. Public payload assertions prove exclusion of contacts, internal discussions/notes, hidden fields, credentials, and foreign department metadata—including nested objects and search suggestions.
10. Anonymous/nonmember/viewer writes fail. Qualified board members can comment/edit assets with correct authorship; the linked target's own membership is checked. Revoked membership takes effect on the next operation.
11. Live task/asset changes appear without manual reload within the measured target; reconnect, fallback, deletion, reassignment, and credential revocation reconcile correctly.
12. Existing public booking, internal booking, allocation, templates, board shares, item shares, dashboard shares, and mobile navigation still work.
13. Theme defaults/overrides are isolated; login/back/deep links preserve context; untrusted return URLs are rejected.
14. Test desktop and phone layouts in light/dark mode, keyboard navigation, focus management, long content, loading/errors, and empty departments. Check representative 360px, 390px, 768px, and 1440px widths.
15. Migration upgrades preserve existing data; legacy backfill dry-run reports ambiguities without publishing them; re-running migration/backfill paths is safe as designed.
16. Concurrent requests for different departments/users do not bleed service clients, authorization, caches, or event data across requests.

Run lint, typecheck, unit tests, relevant Playwright tests, a production build, and targeted Supabase/RLS integration tests in a disposable test environment. Record pre-existing failures separately. Do not claim a live-security or realtime test passed based only on mocks.

The repository's predev/prebuild scripts can run migrations when SUPABASE_DB_URL is configured. Set SKIP_DB_MIGRATE=1 during ordinary development/build checks. Run required migrations explicitly against the intended local/test database. Do not run seed/reset or destructive tests against production.

## 13. Execution and final handoff

Proceed in stages:

1. Audit current code and prepare the data model, permission matrix, public field allowlist, migration plan, and route/view inventory.
2. Implement stable department identity, provenance, portal configuration, and repository/provider support.
3. Implement authorization gates, scoped reads, reliable booking, and permitted staff mutations with negative tests.
4. Implement management UI, public portal, task views/details, mobile adaptation, and live updates.
5. Complete integration, compatibility, performance, accessibility, and security verification.

Make routine implementation decisions autonomously within these requirements. If a product assumption conflicts with actual data or existing behavior, explain the conflict and choose a conservative, documented approach that preserves data and access boundaries. Continue independent work while any essential clarification is pending.

Do not deploy, push, enable public portals for real departments, or publish historical tasks in production as part of this task. Produce the implementation and a concrete deployment/backfill guide ready for review.

Deliver:

- Completed code and additive migrations
- A concise architecture/data-flow explanation and explicit product decisions
- Final permission matrix and exact anonymous/public payload fields
- Route/feature checklist and representative desktop/mobile screenshots
- Tests run, results, measured live-update behavior, and any unverified requirements
- Configuration and migration instructions, legacy mapping dry-run usage, and activation/revocation steps
- Known limitations and rollback/recovery notes that preserve new data

Do not call the feature complete while cross-department isolation is unverified, provenance is guessed, important views/actions are placeholders, existing booking is broken, or realtime/authorization limitations are hidden.


