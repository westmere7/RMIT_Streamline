# Full operational audit, fixes, and regression verification of RMIT Streamline

Perform a thorough, evidence-based audit of the current RMIT Streamline application. Simulate how our creative and marketing teams work throughout a normal day and week, then stress the same workflows with permission changes, unusual data, concurrency, network failures, and lifecycle boundaries.

This is an audit-and-fix request. Execute the workflows, reproduce defects, implement fixes, and re-check after every fix. Produce reproducible findings, coverage records, changed code, and useful regression tests. Do not stop after writing a test plan, running the existing suite, or reporting fixable bugs. Preserve before-fix evidence and distinguish the initial baseline from the verified final behavior.

You are authorized to fix confirmed defects in the local repository and verify them in the isolated test environments as part of this task. Proceed without asking for approval for each routine fix. Prioritize security and data loss, then broken daily workflows, correctness, and usability. Record substantial new feature requests separately; a defect fix is not permission to redesign unrelated features or invent new product behavior.

## 1. Project, evidence, and scope

**Repository:** `E:\WORK_OFFLINE\apps\RMIT_Streamline`

**Production reference:** `https://rmit-streamline.vercel.app`

Start by reading the entire current `KNOWLEDGE_BASE.md`, `README.md`, `AGENTS.md`, and `CLAUDE.md`. Read the relevant installed Next.js guides under `node_modules/next/dist/docs` before adding Next.js-specific test instrumentation or code. Inspect current source, package scripts, migrations/policies, local schema, routes, providers, and test harnesses.

Read previous audit material in `Test_prompts/qa-log.md` and `Test_prompts/claude-code-qa-review-prompt.md` for historical findings. Read `Test_prompts/mobile-rebuild-claude.md` and `Test_prompts/Stakeholder Portal.md` as intended feature specifications. These documents are evidence, not proof of current implementation or authorization to manipulate live data.

Distinguish four things throughout the audit:

1. Product intent and documented guarantees.
2. Actual current implementation.
3. Behavior reproduced in this audit.
4. Behavior observed in the deployed environment, if separately inspected.

The knowledge base has accumulated updates: its original snapshot/version, older schema inventory, later schema-head section, and recent mobile/portal descriptions may disagree. Resolve discrepancies from current code and actual test-environment state. Do not inherit prior pass counts, screenshots, or claims of deployed migrations as fresh evidence.

Audit all implemented routes, actions, API handlers, data providers, and permission boundaries. Explicitly list partial implementations and intended-but-missing capabilities. A visible tab or a test with an encouraging name does not prove a working workflow.

## 2. Test environment and change boundaries

Use an isolated local browser profile/database and a disposable Supabase test environment for mutation, denial, concurrency, and destructive cases. Creating and manipulating synthetic fixtures in those isolated environments is part of this audit.

Do not infer that today's live data is disposable from an older prompt saying the app was demo-only. The production URL is a reference, not the default mutation target. Do not reset, seed, load-test, publish portal/share links, alter real users, or send communications against production without explicit authorization for that target.

Use fixture accounts and in-app communications confined to the audit dataset. Do not send real email, Slack messages, or browser notifications to real colleagues. Store credentials in environment variables or protected temporary state; do not copy passwords, session tokens, portal credentials, or sensitive payloads into reports, committed fixtures, screenshots, or traces shared with others.

Record before testing:

- Git revision, branch, dirty-file inventory, package/Node version, date, timezone, browser versions, viewport, and build identity.
- Exact app URL, active data provider, browser origin/profile, Supabase test-project identity, schema/policy head, and role fixtures.
- Which data may be destroyed and how to identify/clean up only audit-created records.
- Existing test failures and environment problems before adding new tests.

Preserve existing uncommitted work. Use a dedicated audit directory for reports, screenshots, traces, fixtures, and scripts. Make focused application fixes and add targeted regression tests while preserving unrelated behavior and desktop/mobile compatibility. If instrumentation is necessary, isolate it to the test harness and document it. Avoid unrelated dependency upgrades or UI rewrites. Never relax RLS to make a test pass, deploy, push, or modify production configuration.

Where a confirmed fix needs persistence changes, add forward migrations and matching local-provider upgrades as appropriate; do not edit already-applied migrations or reset data to conceal the problem. Apply and verify them only in the disposable test environment. Authentication/permission fixes must keep TypeScript rules, server checks, and database policies consistent without widening intended access.

Important repository traps:

- `predev` and `prebuild` can execute migrations when `SUPABASE_DB_URL` is configured. Set `SKIP_DB_MIGRATE=1` for routine development/build checks. Selecting the local provider does not disable that hook.
- A migration `--dry` run still ensures the ledger and its RLS. Do not describe it as universally write-free.
- Full Supabase seeding can delete/recreate the demonstration workspace and Auth accounts. Inspect scripts before executing them, only against the disposable target.
- The deployment test configuration defaults to the live Vercel URL, and its tests perform writes. Explicitly set and verify the intended test URL before invoking it.
- The standard Playwright suite pins the local provider, can reuse an existing server, and usually uses port 3100. Verify the provider of a reused process; launch variables do not reconfigure it.
- The Supabase runner currently selects `supabase-smoke.spec.ts`; it does not automatically run every new portal or mobile test against Supabase.

If Supabase credentials or a test project are unavailable, continue all useful local, static, and browser work. Mark backend/RLS/realtime cases BLOCKED with the exact missing prerequisite. Do not substitute local UI tests for verified backend enforcement.

## 3. Audit method and coverage ledger

Create an inventory of routes, menus, dialogs, primary actions, server endpoints, persistence contracts, and scheduled/background behavior. Map each to a scenario or an explicitly recorded coverage gap.

Use these statuses: **PASS, FAIL, BLOCKED, NOT RUN, NOT APPLICABLE**. Every not-applicable result needs a reason. Keep test execution status separate from whether the feature is fully implemented.

Track finding resolution separately: **OPEN, IN PROGRESS, FIXED AND VERIFIED, FIX IMPLEMENTED — VERIFICATION BLOCKED, DEFERRED PRODUCT DECISION**. Preserve original failures; do not replace the baseline result with a later pass. Record the initial result, fix iteration, and final result for every affected scenario.

Give each scenario an ID. Before executing it, record:

| Field | Required content |
| --- | --- |
| Scenario | User goal and the business consequence if it fails |
| Context | Provider, workspace, actor, permissions, device, and initial data |
| Steps | Concrete user actions and any controlled fault/timing |
| Expected | Visible behavior, durable records, side effects, and forbidden changes |
| Verification | Reload/reopen, independent actor, persisted reads, or direct API assertions |
| Evidence | Result, timestamps, artifact links, and associated finding IDs |

Exercise core workflows through the real UI. Fixture setup may use services or database setup APIs, but do not seed the result of an operation and claim the UI performed it. Use API/DB assertions as additional evidence, especially for authorization and data integrity.

For each important mutation, verify the visible outcome, durable result after refresh/new session, and affected secondary surfaces. A success toast or optimistic row alone is insufficient. Verify failure rollback and the absence of unintended writes too.

Use independent expected-value calculations for reports and totals. Do not call the same production aggregation function from both the application and the assertion and treat agreement as independent proof.

Cover normal, minimum/maximum, invalid, empty, stale, unauthorized, interrupted, concurrent, and recovery states for each feature. Use pairwise combinations where the full Cartesian product would be excessive, and fully exercise high-risk combinations involving permissions, data loss, or public exposure. “All edge cases” means systematic documented coverage and identified residual risks, not a claim of mathematical exhaustiveness.

## 4. Personas and fixtures

Create fictional audit actors, using distinct authenticated sessions for permission tests:

| Persona | Purpose |
| --- | --- |
| Workspace owner | System entities, ownership, configuration, reporting |
| Workspace administrator / creative manager | Intake, allocation, team planning, invitations |
| Team lead | Team coordination and normal delivery work |
| Explicit board editor | Task changes, updates, asset management |
| Explicit board viewer | Read-only access, including precedence over inherited editing |
| Ordinary workspace member without board seat | Visibility-only access |
| Workspace guest | Explicitly granted access only where allowed |
| Invited and deactivated users | Onboarding, stale sessions, historical attribution |
| Member of another workspace | Tenant-boundary negative tests |
| Anonymous Event stakeholder | Department portal and public booking |
| Anonymous Comm. stakeholder | A second department that must remain isolated |
| Public board/item/dashboard reader | Distinct share-token access paths |

Include a user in multiple teams, duplicate display names with different IDs, an admin explicitly marked VIEWER on a board, and a user removed from a board while its page is open. Do not use “View as” to stand in for separate Supabase sessions.

Build a small, understandable fixture dataset first:

- Two workspaces with intentionally similar department/board/task names.
- Event and Comm. departments with separate portal credentials; one password protected.
- Task Allocation plus at least three delivery boards with WORKSPACE, TEAM, and PRIVATE visibility, differing column names/palettes, and an explicit guest-access case.
- One team configured for direct booking and one using allocation fallback.
- One multi-sheet tracker and a representative import workbook.
- Request R1, **Open Day creative pack**, booked via Event's portal: A2 posters quantity 3, social tiles quantity 5, hero video quantity 1. This is three deliverable lines and nine units.
- Request R2, **Research announcement**, booked via Comm.'s portal to a direct receiving board.
- Request R3 through the old public booking link, with an Event-like department label but no portal provenance. It must not automatically become an Event portal request.
- A staff-created urgent task, linked work across compatible/incompatible boards, nested task data supported by the current model, archived/completed work, and an unassigned task with no date.

Record generated IDs in a fixture manifest; never use the short TA reference as a unique primary key. Include colliding references deliberately in a separate edge-case fixture.

Define D0 and the reference clock/timezone explicitly. Use controlled clocks only in isolated tests, and distinguish browser time from server/database time. Do not change the operating system clock. Keep a separate real-time run for synchronization measurements.

## 5. Simulate a normal working day and week

Run this as a connected narrative using the same records. Preserve state between chapters. Supplement it with isolated edge-case tests so one failure does not hide unrelated coverage.

### OPS-01 — 08:30: morning planning

The creative manager signs in on desktop; a designer signs in on a phone; Event opens its portal anonymously; Comm. opens a separate password-protected portal.

- Review Home, My Work, Inbox, recent boards, favourites, team pages, and the dashboard.
- Search by title and by stored reference in uppercase, lowercase, with/without hyphen, and suffix-only where supported.
- Establish expected overdue/today/this-week/completed sections and separate task Updates badges from notification counts.
- Open saved board/item/tracker/message deep links and confirm correct identity, state, and permissions after reload.
- Verify portal visitors see only their department's published fields and never internal navigation or contact information.

### OPS-02 — 09:00: new briefs arrive

- Event submits R1 without selecting a direct destination; verify intake routing.
- Comm. submits R2 to its configured receiving team; verify direct routing.
- Submit R3 through the legacy booking page and a fourth request through internal member booking.
- Exercise required/custom fields, brief fallback, reference link, asset types, quantities, and templates.
- Compare receipts to durable task IDs, references, values, three R1 subitems, three structured asset lines, and appropriate admin notifications.
- R1 appears once in Event's portal and not in Comm.'s. R3 remains outside both unless explicitly associated through a supported administrative flow.
- Retry one submission as described in the failure tests; do not accidentally count an optimistic receipt as success.

### OPS-03 — 09:30: triage and allocation

- Manager opens Task Allocation, reviews the brief, sets requested priority/date, and allocates R1 to Production.
- Verify a distinct delivery item is created, linked to the origin, with mapped values and copied subitems/assets. Verify intake placement/metadata changes where supported.
- Portal still lists one canonical R1 request, with linked-work indication and authorized details.
- Initially, R1's origin and delivery copy each have three lines/nine units. The internal delivery dashboard must not count intake plus delivery as eighteen delivered units.
- Non-admins cannot reach the system board through search, direct URLs, API calls, or fabricated ownership.
- Verify normal allocation does not unexpectedly transfer origin ownership, rewrite unrelated requests, or change department provenance.

### OPS-04 — 10:00: production starts

- Assign task-level PICs and separate asset-line PICs; verify My Work inclusion follows task PERSON fields rather than assuming asset assignment grants it.
- Designer updates status, dates, priority, tags, stakeholder group, size, description, and supported asset fields through desktop and phone controls.
- Switch through all seven board views and verify one consistent underlying task state.
- Test mobile card-to-grid mode and explicit Kanban move; test desktop drag/reorder and sorting separately.
- Verify persistence and permissions on the destination record after opening a new session.

### OPS-05 — 11:00: discussion and handoff

- Editor posts an update with a real semantic @mention, formatted text, and a valid link in the isolated dataset.
- Colleague reads it from the linked task, replies/edits/deletes only where currently permitted, and checks Inbox and item Updates badges.
- Verify no duplicate copied comments or duplicate event delivery through link chains.
- Send an in-app direct message between fixture users, open its `?to=` link, and verify read state and isolation from a third user.
- A qualified staff user signs in from the portal and performs permitted comment/asset actions. A signed-in nonmember and a viewer are denied by the backend as well as the UI.
- Internal discussions must not appear in the anonymous portal projection.

### OPS-06 — 13:30: priorities change

- Manager moves the due date, changes PIC, marks work stuck, moves a task between groups, and changes a link's exclusions.
- Another editor changes a different field concurrently; a third client remains open on My Work or Dashboard.
- Verify translated status labels, exclusion behavior, notifications, activity attribution, and secondary-surface updates.
- Modify one delivery asset after allocation. Confirm the origin's copied asset list does not falsely appear synchronized; evaluate whether the portal clearly communicates the actual source of the displayed progress.
- Change a STAKEHOLDER display value and confirm portal ownership does not change automatically.
- Rename Event using the supported list editor and verify its stable department identity, link, and history remain intact.

### OPS-07 — 15:00: review and delivery

- Use the supported status labels for review/revision, then complete the appropriate task and asset lines.
- Verify semantic completion survives renaming a done label; text that merely says “Done” must not substitute for configured completion semantics.
- Complete the R1 video line: three total lines/nine units, one completed line/one completed unit. Then complete the remaining lines: three completed lines/nine completed units.
- Check asset overdue/next-due rules, task completion, My Work grouping, board charts, Workload, and Dashboard using independently computed expectations.
- Open approved public board/item/dashboard shares and the department portal; verify each intentionally different projection and its real refresh delay.
- Reopen completed work for revisions, then complete it again. Check whether completion dates/history and dashboard figures remain consistent with documented rules.

### OPS-08 — 16:00: tracking and reporting

- Update the multi-sheet tracker, exercise dropdown/date/number/checkbox cells, totals, row types, and frozen columns.
- Export to XLSX, open/inspect the workbook with an independent reader, reimport into a separate audit tracker, and compare supported data and structure.
- Test a save immediately followed by sheet switching/navigation, and verify data after reopen.
- Manager changes dashboard date basis, team, span, unit, and visible panels. Reconcile figures against the fixture manifest, distinguishing requests, delivery tasks, and asset units.

### OPS-09 — 17:00: end-of-day continuity

- Save all work, sign out, reopen in a new session, and recheck tasks, updates, assets, tracker edits, and preferences.
- Test version-update “Later” and “Reload” with an unsaved draft in an isolated build simulation; no silent forced reload or discarded work.
- Resize desktop → mobile → desktop with a non-default sidebar width and board view; verify presentation preference isolation.
- Check that logout/account switching clears the previous user's protected content and does not reuse their query cache.

### OPS-10 — next day and weekly administration

- Advance isolated date fixtures across midnight/week boundaries; verify work moves to the correct sections without duplication or disappearance.
- Invite a fictional new colleague, complete onboarding, assign work, change team/board membership, deactivate/reactivate where supported, and verify historical attribution.
- Archive/restore a completed campaign. Test team removal with board retention versus deletion only in disposable fixtures.
- Rotate/revoke a share and a portal link while readers have them open; verify access removal and useful recovery UI.
- Remove a stakeholder group, re-add the same name, and verify the new identity cannot inherit old requests or credentials.
- Review completed-period reports and the audit ledger for any cross-feature mismatch left by the week's operations.

## 6. Detailed edge-case catalogue

Expand each family into concrete case IDs. Check validation at the service/API boundary as well as through forms. Where behavior is unspecified, document it as a product question or risk rather than inventing a rule and declaring a bug.

### AUTH — authentication, onboarding, and identity

- Missing/invalid credentials, normalized email/case/whitespace, empty fields, expired session, failed refresh, offline login, direct protected URL, logout then Back, switching accounts/workspaces.
- Local passwordless demo behavior must not be reported as a Supabase authentication bypass; test production authentication separately.
- Invitation just before/at/after expiry; accepted, revoked, malformed, regenerated, repeated submission, stale open join form, interrupted completion, existing account versus new account, duplicate invitation, and self-reinitiation.
- Deactivated profile with active membership; inactive membership with retained board seat/ownership; one account active in one workspace and inactive in another.
- Historical users still resolve correctly but are not offered for new assignments/mentions when ineligible.
- Session change during a pending edit or upload must not attribute it to the next user or expose previous-user data.

### ACL — full access-control matrix

- Cover workspace OWNER/ADMIN/MEMBER/GUEST and ACTIVE/INVITED/DEACTIVATED states against board owner/explicit EDITOR/explicit VIEWER/no seat, team membership, WORKSPACE/TEAM/PRIVATE visibility, system versus ordinary boards, and other workspaces.
- Verify exact precedence: system-board gate first; literal owner; explicit role; admin inheritance; visibility inheritance. An explicit VIEWER can override a later editing grant. Team membership does not grant editing merely because a WORKSPACE-visible board has that team.
- Check read, create, edit, delete, manage, export/share, link, comment, asset, tracker, invitation, and configuration permissions independently.
- “View as” changes preview visibility but retains the actual actor. Test its writes/attribution separately; actual-user RLS needs genuine user sessions.
- Direct API/PostgREST calls with foreign IDs, nested foreign board/group/column/asset IDs, forged actor IDs, stale JWT, removed membership, and public tokens used at the wrong endpoint must be rejected without writes or existence leaks.
- Portal writes require the concrete item's qualifying board relationship; origin access is not linked-target access. Verify any difference between effective native role and the stricter intended portal board-seat rule.
- Do not use the service-role key as the requesting actor in denial tests. Use it only for isolated fixture setup and independent inspection.

### BOARD — lifecycle, ordering, and virtualized tables

- Empty boards/groups, board templates, rename and slug collisions, long/Unicode names, favourite/recent-state updates, move between teams, duplicate isolation, archive/restore, delete and stale deep links.
- System entities identified by markers, not names; rename must not bypass protections. Concurrent initialization must not duplicate them.
- Parent/subitem moves, archive/delete/duplicate, invalid parent cycles, cross-board parent/group mismatches, and cleanup of values/assets/links/read markers.
- Sorting versus stored order, drag while filtered/sorted, range/multi-selection, hidden selected rows, collapsed groups, bulk actions spanning groups, action on a row deleted by another client.
- Virtualization: scroll far down/up, expand subitems, keyboard focus, sticky columns, selection, filters, group totals, and a mutation outside the rendered window. No duplicated/missing rows or edits landing on the wrong recycled row.
- Rapid board switching and out-of-order responses must not show another board's records or controls.

### FIELD — every current column type

- Inventory the actual type union, including STAKEHOLDER, SIZE, ASSETS_RECAP, DEPENDENCY, and all normal text/status/person/date/timeline/number/priority/checkbox/link/tag types. FILES is historical unless current source proves otherwise.
- Null, empty, whitespace, zero, false, decimals, negative values where permitted, max length/size, one beyond limit, Unicode/diacritics, emoji, very long unbroken words, and duplicate display labels.
- Stored zero must not be mistaken for missing numeric data. Preserve the deliberately different meaning of an unchecked checkbox versus empty/null.
- Multiple PERSON columns, single/multiple assignees, removed/deactivated users, changing a column type/settings, deleting referenced labels, missing labels, and renamed status roles.
- Date-only versus timestamp parsing; invalid dates, leap day, month/year/week boundaries, today versus overdue, timeline start=end/start>end/missing endpoint, Asia/Ho_Chi_Minh versus Australia/Melbourne DST boundaries.
- URLs with supported and disallowed schemes, rich-text paste, safe script-like strings, malformed documents, and stored-content rendering across internal/public/mobile surfaces. Use benign local markers, never external exfiltration payloads.
- Derived recap fields must not become editable arbitrary values through API tampering.

### LINK — links, mapping, and shared conversations

- Reject self, duplicate/reverse, same-board, cross-workspace, missing endpoint, own-parent/subitem, and chain links containing two different tasks from one board.
- A–B–C chains, cycle attempts, unlink/relink, removed boards/columns/users, repeated rapid propagation, and simultaneous edits at opposite ends.
- Name/description/reference/Updates/column exclusions independently and in combination.
- Compatible TEXT/LONG_TEXT; normalized column-name mapping; single-column fallbacks; differently named/missing status labels; different priority orders; single-person destination receiving multiple people.
- DEPENDENCY and ASSETS_RECAP remain local. Asset lines and allocation subitems are copies, not automatically synchronized linked records.
- Shared comments remain one conversation with correct reachability, author rights, and no duplicate notifications. Private/unreadable linked records must not leak through previews, search, comments, or activity.
- Stored reference collisions must not merge distinct tasks. Portal canonical provenance and dashboard representative selection are different rules; test each explicitly.

### BOOK — booking, templates, allocation, and partial writes

- Legacy key, member-only booking, valid key with stale session, invalid supplied key with valid member session, disabled/replaced key, malformed body, unknown/foreign team or column IDs.
- No team, valid receiving board, archived/deleted/system/foreign receiving board, team removed after form load, no receiving groups, and changed template between load and submit.
- Asset lines at 0/1/50/51 and quantities at valid minimum/9999/10000, fractional/negative/null according to current schema. Ensure errors identify the right field and preserve the draft.
- Custom required questions, column versus brief destinations, missing compatible column, multiple asset types, template save/reset/case-insensitive name replacement, removed questions preserving old answers.
- Proposed item ID already occupied, stored legacy reference, double-click, response lost after server commit, and failed intermediate subitem/asset/notification writes.
- Allocation twice/concurrently, source moved/deleted, target permissions/configuration changed mid-operation, partial linked-copy creation, and failure after link creation but before assets/group placement.
- Inspect durable rows after every failed stage before retrying. Measure duplicates/orphans and recovery; do not assume one HTTP call or Promise.all is a transaction.

### PORTAL — department isolation and operational promises

- Default portals closed; ordinary members retain internal booking without admin controls; desktop/mobile/search navigation labels agree.
- Durable department identity across list save, rename map, reorder, missing/default list, removal, re-add with same name, conflicting rename, and failures during reconciliation.
- Only explicit provenance publishes a request. STAKEHOLDER text, requester email, UUID ordering, or a matching reference cannot grant inclusion or determine origin.
- One canonical row, correct linked-work count/details, bounded traversal, restricted links, deleted origin, and never silently substituting an unrelated linked task.
- Password/no-password gates, malformed/unknown/disabled token, credential-version tampering, changed password, regeneration, an already-open tab, logout, rate-limit behavior, cache mixing, and safe error responses.
- Check exact payload allowlist at all endpoints: no requester contacts, raw internal description, internal comments/activity, hidden columns, asset notes/URLs, foreign department metadata, or broad member profiles.
- Tamper portal/workspace/department/task/asset/actor IDs and submission fields. Check foreign department search suggestions, totals, group labels, and linked previews too.
- Idempotency: same key/same body, same key/different body, concurrent claim, response loss, failure after each of claim/book/associate/receipt, and a real process interruption in the isolated environment. Verify recovery of stranded claims and absence of duplicate or invisible tasks.
- Authorized staff comment/asset mutation versus outsider/viewer/inactive member; permission removed during edit; linked target on another board; no expanded arbitrary task-edit surface.
- Search and grouping across more than one page; totals across the full authorized set; heterogeneous source columns; no hidden dropped results.
- Compare requested seven-view and realtime functionality to implementation. If only a grouped list and 15-second polling remain, record explicit feature gaps. Rendering a list is not a passing Kanban/Calendar/Gantt test; polling is not realtime.
- Measure actual update/revocation delays on an open portal and verify whether selected task details refresh along with the list. Theme override must not mutate the internal app's theme.

### SHARE — public board, item, dashboard, and media

- Distinct token types, unknown/malformed/disabled/regenerated tokens, password failures, expiry boundary semantics, direct item links, reload, and revoked links in already-open tabs.
- Board-share date expiry may remain valid on the selected date; invitation timestamp expiry is different. Test exact implemented/required semantics rather than assuming one common rule.
- Inspect actual public JSON, not just hidden controls. Board shares and portal/dashboard projections intentionally differ; assess unintended exposure of profile fields, contacts embedded in descriptions/comments/activity, and linked data.
- Attempt mutations through the memory adapter, normal APIs, and direct PostgREST as anonymous/read-only users. Shared credentials do not create workspace membership.
- Dashboard public filters/charts must not allow escape to internal routes or unredacted payloads. Portal credentials and old booking keys must not unlock shares or vice versa.
- Inspect actual password hashing and migration compatibility. Record weak legacy share hashing as a security finding with realistic impact, not a claim of a demonstrated exploit.
- Public Storage URLs do not inherit private-board RLS. Test cover/avatar object access and write ownership independently; document intended versus actual public exposure.

### COLLAB — notifications, updates, messages, and profiles

- Notification/quiet-update/OFF preferences, board mute, self-actions, multiple recipients, deactivated recipients, linked-event deduplication, and read/unread count transitions in two sessions.
- Item Updates read markers versus Inbox read state; opening Overview must not accidentally mark an unread thread caught up unless intended.
- Browser notification permission denied/unavailable/granted in an isolated browser, tab hidden/visible, and cleanup after logout. No duplicate prompts or unsolicited system notifications.
- Comment author edit, author/admin delete, foreign author denial, linked Updates exclusions, missing mentioned user, duplicate names, draft preservation, and rich-text round-trip.
- Direct-message thread isolation, wrong recipient ID, stale/deactivated recipient, self-thread if supported, send retry, deletion, unread count, and phone Back navigation.
- Profile validation, long/missing data, historical attribution, avatar fallback/cache refresh, and account changes while a profile editor is open.

### ASSET — deliverables and uploads

- Quantity null means one; test zero/invalid quantities against actual validation, distinct types, duplicate/missing assignees, no dates, overdue/today/future, completion/uncompletion, reorder, delete, and bulk edits if supported.
- Independently verify line count, total quantity, completed quantity, unique PIC count, unassigned count, next due, and overdue count. Completed lines leave outstanding-date calculations.
- Asset reassignment versus task assignment and copied allocations; cached recap, board cells, item detail, My Work, dashboard, and portal agree where their semantics require it.
- Concurrent asset edit/delete, forged item/board linkage, newly revoked permission, failed save, stale response, and parent deletion.
- Covers/avatars: source-size limit minus one/exact/plus one byte, corrupt images, MIME/extension mismatch, unsupported format, replacement, orientation, processing failure, upload success followed by metadata failure, stale cache, and unauthorized object overwrite.

### TRACKER — sheets, saves, and Excel interoperability

- Sheet/row/column create, copy, rename, delete, reorder; last sheet and empty sheet behavior; section/subsection rows; frozen columns; display preferences; list options and colors.
- All cell types, null versus zero/false, formatting, summary formulas, paste ranges, Unicode/newlines, long text, selection, keyboard navigation, phone row editor, and intentional grid scrolling.
- Edit then navigate/unmount within the 600ms debounce window, switch sheet, close tab, sign out, go offline, encounter quota/permission failure, and recover. Reopen from persistence to detect lost drafts.
- Undo/redo before/after save and failure, history capacity boundaries, new edit after undo, remote update while dirty, and two users editing the same versus different cells. Document document-level last-write behavior rather than claiming collaborative cell merging.
- XLSX round-trip with multiple sheets, data types, widths, frozen panes, colors, validation, summaries, blanks, dates, percent/currency, duplicate headers, unusual sheet names, hidden rows/sheets, formula cached result present/absent, and range-based dropdowns.
- Corrupt/empty/oversized workbooks, unsupported workbook features/macros/external links, and filenames suggesting executable content. Never execute macros or follow external workbook links. Record supported-model limitations and silent-loss risks separately.
- Verify export/import using an independent workbook reader and saved fixture comparisons. No need to invent a full Excel formula engine requirement.

### REPORT — My Work, Dashboard, and all board views

- Task versus request versus asset-unit counts; intake excluded from delivery where specified; subitems and archived boards/items; deduplicated links; permissions filtered before aggregation.
- Asset-only PIC versus task PIC; multiple PERSON/STATUS/DATE columns; first-column/fallback behavior; done roles before date grouping; missing date/priority/person.
- Date basis due/created/completed, total versus selected span, selected year, current-year truncation, date boundary/timezone, reopened work, team reassignment, and deleted records.
- All seven board views: no data, one item, many items, missing required axes, custom settings, filters, selection, edits, persisted view, and deep links.
- Calendar/timeline/Gantt date changes and dependencies; Workload multi-assignee counting; Chart count/sum/asset metrics; ensure labels/units make each aggregation's meaning clear.
- Dashboard filters and saved preferences must not mix users/workspaces unexpectedly, leak unauthorized team names, or count only visible/paginated rows as totals.

### SYNC — concurrency, network failures, and recovery

- Two same-origin local tabs share IndexedDB and invalidations; two distinct browser origins/profiles do not automatically share it. Separate account contexts for Supabase use a real shared backend.
- Two clients edit different fields, the same field, linked endpoints, a tracker sheet, or an asset; include one stale/offline client reconnecting after newer edits.
- Optimistic write A fails after write B succeeds: A's rollback must not silently erase B. Test delayed/out-of-order refetches, canceled navigation queries, stale IDs, and duplicate events.
- Controlled 401/403/404/409/429/5xx, timeout, connection loss before request, lost response after commit, and dependency failure. Record the fault location and clear it before recovery checks.
- Realtime publication/RLS, subscription filters, coalescing, focus/reconnect, background tabs, and channel cleanup. Measure event-to-visible-update and event-to-durable-read times; distinguish polling intervals from realtime latency.
- Cross-user/department requests in parallel must not bleed global service-role routing, request context, authorization, payloads, or caches.
- App reload/update with pending writes, offline unsaved state, duplicate submit after retry, and sustained navigate/open/close cycles to find leaked listeners/subscriptions.

### UX — desktop, mobile, accessibility, and state isolation

- Viewports: 320×568, 360×800, 390×844, 430×932, 767/768 boundaries, 1023/1024, 1280×800, 1440×900, and representative wide desktop. Check portrait/landscape and short viewport/keyboard conditions.
- Test Chromium and WebKit where available, plus keyboard-only operation, reduced motion, zoom/text scaling, and light/dark themes. Distinguish browser emulation from physical-device testing.
- Readable titles/labels, controls on screen, touch target size, no hover/drag-only actions, modal focus trap/restoration, accessible names, validation/error announcements, disabled/loading states, and empty-state recovery.
- Sheets, nested dialogs, date/person pickers, upload controls, command palette, comments/message composers, sticky headers, safe areas, toasts, and bottom navigation must not cover the active control.
- Detect page-level horizontal overflow without masking legitimate contained grids/date axes. An overflow test alone does not establish usability.
- Preserve sidebar width/collapse, desktop view, tracker appearance, and per-user settings across refresh and desktop → phone → desktop transitions. Check first-load hydration does not overwrite saved values.
- Capture current desktop baselines before any audit instrumentation and compare representative routes/states; do not claim the older four byte-identical screenshots cover every current screen.

### SCALE — bounded performance and resilience

- Run a representative dataset and a controlled larger fixture: at least the existing 300-item/12-column/8-group case, then a 1,000-item board and >200 linked IDs if practical on the isolated machine.
- Include multiple boards, a long notification/activity list, and portal requests beyond a page/server row limit. Increase tracker sizes within its documented moderate-workbook scope rather than assuming hundreds of thousands of rows are supported.
- Measure initial load, board switch, search/filter, panel open, edit-to-save, scroll responsiveness, API count, payload size, and memory/subscription growth using a recorded browser/machine/network profile.
- Look for PostgREST URL/header limits, default row caps, unbounded workspace scans, N+1 queries, stale virtualization, missing pagination, and repeated subscriptions.
- Use measured baselines and relative regressions; if proposing a target, label it proposed rather than an existing SLA. Do not generate sustained remote load or spend unbounded backend quota.

### DATA — upgrades, export/import, cleanup, and configuration

- Verify current schema version rather than relying on the knowledge base's older v11 versus later v14 statements. Test upgrade of a copied previous-version IndexedDB dataset and blocked upgrade with another tab open.
- Local full JSON export/import round-trip, schema/version validation, malformed/truncated input, import failure atomicity, new portal/list/profile stores, and reset behavior in a disposable profile.
- Local export can include credentials/onboarding data; keep artifacts private/redacted. Supabase whole-database export/reset is intentionally unsupported through the local admin interface.
- Referential integrity after move/duplicate/delete/archive: no orphaned item values, invalid board/group/parent links, stale asset ownership, dangling permission grants, or mismatched portal workspace/department provenance.
- Migration order, all later policy replacements, checksum drift behavior, ledger idempotency/locking, required buckets/policies/publication, missing service-role configuration, and provider fallback. Run invasive migration failure tests only on a disposable database.
- Missing/partial public Supabase config must not be mistaken for a healthy production connection if the app falls back to local data.
- Review version checks, checked-in deployment workflows, and Supabase keep-alive workflow if present as configuration evidence. Do not alter schedules, deploy, or call external automation during the audit; distinguish configured from actually running.

## 7. Known-risk register to verify explicitly

These are investigation leads from the knowledge base, not pre-proven findings:

1. Portal list polling instead of scoped realtime, and missing advanced portal views.
2. Portal booking durable claim/compensation gaps around process interruption and stranded claims.
3. Portal RLS/privileged endpoints covered locally but not established by a real Supabase run.
4. Legacy share password hashing weaker than portal hashing.
5. Public board user projection and arbitrary task/comment content exposing more than users expect.
6. Public cover/avatar objects outside private-board row visibility.
7. Tracker debounce/unmount and concurrent whole-document save behavior.
8. Ordinary-board ownership/explicit seats surviving inactive workspace membership checks in some paths.
9. Global repository-client override and concurrent privileged requests.
10. Dashboard deduplication/date/completion rules differing from portal canonical provenance and asset copy semantics.
11. Mobile responsive/hydration state overwriting desktop preferences or losing drafts.
12. Historical schema inventory, search behavior, migration-drift wording, and prior pass claims diverging from current source.

For each, report **confirmed defect**, **confirmed capability gap**, **documented limitation with measured impact**, **resolved in current code**, or **unverified**. Include evidence. Do not quietly treat an admitted missing feature as a pass, or an intentional supported-model limitation as corruption.

## 8. Execution order and test quality

1. Read/inventory, establish environment and fixture manifest, and create the coverage ledger.
2. Run baseline lint, typecheck, unit/component tests, relevant build, and existing E2E suites after inspecting their targets and side effects.
3. Execute the connected daily/weekly scenarios through the real UI, with multi-session observations.
4. Execute edge-case families, prioritizing access isolation, data loss, booking recovery, trackers, links, public surfaces, and mobile regressions.
5. Run targeted backend/RLS and fault-injection cases in the disposable Supabase environment.
6. Apply the fix-and-recheck loop below whenever a confirmed defect is found; do not defer every repair to the end. Reconcile persisted data and independently calculated metrics after affected fixes.
7. After all fixes, rerun the connected operational story and the final regression checks, then produce reports, changed-code summaries, tests, artifacts, cleanup manifest, and residual coverage gaps.

Run commands appropriate to the current repository, typically `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build` with migration skipping. Use `npm run test:e2e:supabase` and deployment tests only after confirming the dedicated target and actual selected cases. Add explicit portal/backend cases if the wrapper does not include them.

Do not replace meaningful tests with snapshots of implementation internals. Do not increase timeouts, loosen expected values, hide changed regions, remove failing tests, or reset the dataset until a defect disappears. A passing retry after a failed first attempt is flaky evidence and must be recorded.

When finding a bug, first minimize it, capture the records and visible symptom, and establish the responsible code path before editing. Root-cause hypotheses must be labeled until confirmed. Then fix it using the mandatory loop below. Preserve the regression test or reproducible script and its before-fix failure evidence.

### Mandatory fix-and-recheck loop

For each confirmed defect:

1. **Reproduce and record.** Capture exact steps, actor/provider/device, expected versus actual behavior, persisted state, and the failure evidence. Identify the root cause rather than changing code until the symptom disappears.
2. **Pin the regression.** Add or extend a meaningful automated test that fails for the observed reason on the baseline where practical. For a visual/device issue unsuitable for automation, record a repeatable manual procedure and before screenshot instead. Do not add tests that merely restate implementation details.
3. **Implement the smallest complete fix.** Correct the responsible layers and all affected providers/surfaces. Preserve unrelated work, data, permission boundaries, and existing desktop behavior. Document any required migration or compatibility handling.
4. **Re-run the original reproduction immediately.** Use the same conditions that failed, including the role, provider, viewport, fault timing, or concurrent actors. Confirm the symptom is gone and the durable result is correct. A unit pass alone does not close a browser, RLS, or integration defect.
5. **Re-check neighboring behavior.** Run the focused regression test plus the directly affected workflows, negative/permission cases, boundary values, and cross-feature side effects. For shared UI changes, check phone and desktop. For shared services, check relevant provider behavior. For data changes, check relationships, counts, retries, and recovery. For security changes, verify denied actions remain denied and authorized work still succeeds.
6. **Respond to failures.** If the defect persists or the fix causes a regression, keep it open, refine the fix, and repeat this loop. Do not move on treating an unverified patch as resolved. Independent audit work may continue while an external verification prerequisite is blocked.
7. **Record closure evidence.** Update the finding with files changed, fix rationale, tests/commands, results, remaining risks, and before/after artifacts. Use FIXED AND VERIFIED only when the original failure and relevant regressions have actually been checked in the required environment.

Do this after each fix. Do not accumulate unrelated patches and rely on a single final test run. Closely related symptoms may share one root-cause fix, but re-check every linked reproduction. A backend fix without a usable Supabase test environment remains FIX IMPLEMENTED — VERIFICATION BLOCKED, not verified by a local-provider substitute.

Keep checks proportional: run focused checks after each fix; run the broader suites when shared behavior changes and once at the final gate. Do not repeatedly run unaffected suites without a reason, and do not omit checks justified by the actual change.

### Final regression gate

After the last fix, run lint, typecheck, unit/component tests, the relevant full E2E coverage, and a production build with migration skipping. Repeat the connected daily/weekly operational scenarios on the final code, not only the isolated bug reproductions. Re-run affected Supabase/RLS, public-payload, recovery, synchronization, and desktop/mobile checks against the appropriate test environments.

Compare final data reconciliation and desktop/mobile evidence to the recorded baseline. Keep baseline failures, newly found failures, fixed-and-verified issues, and verification blockers distinct. Correct documentation that changed as a result of verified fixes, while retaining the historical audit record.

If an existing test harness is wrong, document and fix the harness in isolation, then rerun. Do not relabel an application failure as a harness problem without evidence. If a blocker stops one family, continue independent coverage and keep its cases BLOCKED.

## 9. Audit deliverables

Create a new run directory, for example `Test_prompts/audits/<timestamp>-full-operations/`, without overwriting previous audits.

Deliver:

- `README.md`: environment/build/provider summary, fixture manifest location, run instructions, and artifact index.
- `AUDIT_REPORT.md`: initial versus final readiness, daily-operations results, fixed-and-verified findings, unresolved issues, feature gaps, and next actions.
- `COVERAGE.md`: every scenario ID, feature/route/role/provider/device, initial/final status, fix iteration, evidence, and blocked/not-run reason.
- `FINDINGS.md`: detailed reproducible issues with stable IDs and explicit resolution status.
- `FIX_LOG.md`: each root-cause fix, affected files, before-fix failure, immediate recheck, neighboring regression results, and any verification blocker.
- `DATA_RECONCILIATION.md`: expected versus actual fixture counts, relationships, copies, notifications, aggregates, and recovery results.
- `PERFORMANCE.md`: dataset sizes, measurement method, samples, and observed bottlenecks.
- `DOCUMENTATION_DRIFT.md`: claims that need correction, with current source/runtime evidence.
- Implemented fixes, any forward migrations, reusable regression tests/scripts, and private/redacted before/after screenshots, traces, network samples, and logs as appropriate.
- `CLEANUP.md`: exactly which audit-created records/files were removed or retained for reproduction; no broad deletion by a name prefix without checking ownership against the fixture manifest.

For each finding, include:

1. ID, concise title, classification, severity, and confidence.
2. Business consequence: whose daily work fails and how.
3. Environment/provider, role, route, fixture IDs, and preconditions.
4. Minimal exact reproduction steps, including timing/fault injection if needed.
5. Expected versus actual visible behavior and durable data.
6. Evidence links, response status/body excerpts with credentials redacted, and relevant source path/line references.
7. Reproduction frequency, scope, and any safe workaround.
8. Confirmed root cause or explicitly labeled hypothesis.
9. Implemented fix, changed files, and rationale; or the exact reason a fix remains blocked/deferred.
10. Original reproduction recheck and relevant regression results after the fix, with commands/artifacts and resolution status. Preserve failed iterations rather than presenting only the last green run.

Use classifications **BUG**, **FEATURE GAP**, **DOCUMENTATION DRIFT**, **HARNESS/ENVIRONMENT**, and **UNVERIFIED RISK**.

Use severity consistently:

- **P0 Critical:** demonstrated cross-tenant/private-data exposure, severe authorization bypass, or unrecoverable broad data corruption/loss.
- **P1 High:** a core daily workflow fails, silently loses work, duplicates a request, or materially misreports delivery/access, with no reasonable workaround.
- **P2 Medium:** incorrect/inconsistent behavior with a practical workaround or a bounded impact.
- **P3 Low:** polish, minor usability/accessibility friction, or documentation issues without immediate material impact. Escalate accessibility issues that block a core workflow appropriately.

Do not inflate a theoretical risk into a demonstrated exploit. Do not downgrade a real security/data-loss defect because the fixture data was disposable. Group duplicate symptoms under one root issue while retaining all affected scenarios.

## 10. Completion criteria

Continue beyond the initial plan and initial findings. The audit-and-fix pass is complete only when every inventoried area and required scenario family has an execution status, confirmed defects that can be resolved within scope have been fixed and rechecked individually, daily operations have been exercised on the final code, high-risk failure paths have evidence or explicit blockers, and persisted data has been reconciled. Do not stop merely because the original bug list has been written or the patches compile.

The final summary must state:

- Whether the app is ready for routine team use, and which environments that conclusion covers.
- P0/P1 blockers and the most consequential gaps.
- Defects fixed and verified, defects still open, fixes awaiting verification, and the reason for each unresolved item.
- Passed/failed/blocked/not-run counts and exact test scope; no implied Supabase certification from local passes.
- The status of portal realtime/views, booking recovery, mobile preservation, permission enforcement, and tracker save safety.
- Residual risks and what could not be reproduced or tested.
- Links to the report, coverage ledger, fix log, changed code, and regression tests.

Do not give an unconditional “all clear” while important flows are untested, fixes remain unverified, backend isolation is blocked, or known missing capabilities remain hidden. Deliver an honest final readiness assessment supported by before-and-after evidence.
