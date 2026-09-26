# Documentation drift — 26 September 2026

Claims in documents, comments and on-screen text that no longer match the code at `0649d71`. Each one was found by reading the source (STATIC).

**Status** tells you where each fix stands:

| Status | Meaning |
| --- | --- |
| **Mirror** | Rewritten in `deliverables/repo/`, not yet copied into the repository |
| **Tree** | Fixed in the working tree and verified |
| **FX-nn** | A prepared fix in `deliverables/fixes/` |
| **Open** | Not fixed. The location is given, so it can be done in one pass |
| **Leave** | Deliberately not edited (reason given) |

## The documents (F-121)

| Document | What was wrong | Status |
| --- | --- | --- |
| `KNOWLEDGE_BASE.md` | A v0.17.0 snapshot (listed below) | Mirror: full rewrite, 23 sections |
| `README.md` | Written 8 September; about 180 commits behind | Mirror: full rewrite |
| `.env.example` (F-199) | Missing `AUTOMATION_SECRET`, `AUTOMATION_TIMEZONE` and `CRON_SECRET` | Mirror |
| `supabase/README.md`, `supabase/optional/README.md` | Didn't cover sequence order, pg_cron or the empty-database path | Mirror |
| `supabase/policies/README.md` | Didn't say which file's definition is live for each table and helper | FX-16 |
| `docs/README.md` | Didn't exist; the folder's reports are historical and weren't labelled as such | Mirror (new) |
| `scripts/db-migrate.mjs` header | Said "migrations then policies, so new files only need a higher prefix" — the misconception behind F-108 | Tree |

`KNOWLEDGE_BASE.md` at `0649d71`:

- **Heads.** It said 0040 / 0016 / IndexedDB 15. The real heads are 0078 (no 0069) / 0019 / 17.
- **§10 columns.**
  - The column-type table is missing 10 types.
  - It says the due date is "the first DATE column"; the due date is now decided by roles.
  - It points to "Settings → Lists", which is now two sections: Departments and Asset types.
  - It lists several built-in templates; only Blank remains, plus saved templates.
- **§12 booking.**
  - It says the brief goes in the description; it goes in the Brief column.
  - It still says "Stakeholder Portal"; the page is "Portal and Booking".
  - It says the ticket is previewed before sending; it isn't any more.
  - Allocation now carries the brief as a value and matches special columns by type.
- **§13c portal.**
  - Departments are edited in Settings → Departments.
  - The theme key is per page, and there is a new size key.
  - The date range defaults to the link's own setting.
  - `?task` doesn't open requests outside the range.
  - Staff comments and deliverable edits have no UI.
- **Missing altogether:** automations, tickets, templates, snapshots, the Danger zone, threads, reactions, special columns, Requester, Countdown and the date/time columns.

## The in-app guide (F-198)

`src/features/workspace/documentation/guide-content.ts` — **Mirror** (full rewrite; chapter ids kept so `?guide=` links still resolve; new Automations chapter). The new `tests/unit/guide-content.test.ts` fails if any of these come back:

- "Booking form editor instructions are pending", and a booking editor "being updated".
- Three dashboard tabs.
- "Linked tasks do not synchronize asset lines". They share lines.
- A Settings directory of General / Permissions / Lists / View / Data / Documentation.
- "Open Settings → Data … Export data". Removed in v0.47.3.
- "Demand & Delivery" naming.
- A collaboration chapter with no replies or reactions.

## Code comments that say something false (F-196)

### Booking, allocation, portal

| Where | The comment says | The code does | Status |
| --- | --- | --- | --- |
| `BookingRequest.itemId` | A retry with the same id is safe | Public `/api/book` books twice (F-158; the unit test asserts it) | Open |
| `BookingReceipt.assetCount` | Lines "became subitems" | They become asset lines | Open |
| `BookingService.book()` | The requested team is "noted" | It only reaches the description | Open |
| `useAllocation` | Moves "one at a time" | `Promise.all`, in parallel (F-159) | Open (fix the code, not the comment) |
| Portal `book()` | The department "comes from the token" | It comes from the request; the unified portal has no department on its token | FX-01 rewrites this doc comment |
| `PortalRequest`, `collapseLinked`, `linkedSummaries` | "Allocation makes a second item and links" | Allocation moves the item | Open |
| `portal-view.ts` | Comments and activity are never published | Update threads are published on published tasks | Open |
| Portal route comments | "this department's provenance"; gate answers are identical | One portal for all departments; the gate answers off, revoked and unknown differently | Open |
| Portal board `omit` prop | Documented as an option | No caller passes it | Open (remove it) |
| Wizard `lookupRequester` / `Identity` notes | Earlier behaviour | Superseded by v0.48–v0.49 | Open |
| `src/server/requesters.ts` header | Renaming is intended | F-102 | Mirror (file replaced) |
| "Bookings land on" preview | Requester and Department go to the description | They go to their columns where the board has them | Open (user-visible) |

### Automations

| Where | The comment says | The code does | Status |
| --- | --- | --- | --- |
| `automation-engine.ts` `render` doc (≈L919) | Lists the placeholders | Leaves out `{group}`, which works | Open |
| `features/automations/recipes.ts` header | "half-dozen", "these eight" | There are 10 | Open |
| `/api/automations/run` route comment | The next tick picks up claimed events | Nothing releases a stale claim (F-115) | Open |
| `automation-service.ts` (≈L52-55) | Rules can arrive from a duplicated board | `duplicateBoard` copies no rules | Open |
| README and `.github/workflows/automations.yml` comments | A missed schedule runs on the next tick | A schedule fires only inside its exact hour (F-175) | README: Mirror. Workflow comment: Open |
| Repo docs | GitHub Actions is "the default" driver | Production is driven by pg_cron every minute (the heartbeat was stamped on the minute); the workflow is a fallback | Mirror (README, knowledge base) |

### Boards, columns, views

| Where | The comment says | The code does | Status |
| --- | --- | --- | --- |
| `scripts/ensure-special-columns.mts` header | 9 special types | 10, with Requester | Open |
| `column-type-picker.tsx:12`, `item-link-sync.ts:64` | A Files column | There is none | Open |
| `column-role.ts:181-197` `ambiguousRoles` | Documented helper | Unused | Open (remove) |
| `date-time-format.ts:105` `parseTimeOfDay` | "9:5" is accepted | Returns null | Open |
| Dropdown cell comment | An empty cell "opens the label editor" | It shows "Edit labels" | Open |
| Stakeholder comment and group summary | "Settings → Lists"; "groups" | Settings → Departments; departments | Open |
| `kanban-view.tsx:385-387` | The detailed card shows the brief | It shows the description | Open |
| `column.ts:184-192` `removed` doc | Removed columns are hidden everywhere | The portal, My Work and booking still read them | Open |
| `BoardService.updateColumn` type | No `hiddenInPanel` | It works at runtime | Open (type) |
| `refreshTeamPalette` | Refreshes the "Requested team" palette | That column was dropped in v0.47.4; `_teamNames` is unused | Open |

### Settings, snapshots, version, dashboard

| Where | The comment says | The code does | Status |
| --- | --- | --- | --- |
| `SupabaseAdminRepository` (≈L280-282) | "Settings → Data panel" | Removed in v0.47.3 | Open |
| `version-store.ts` | A manual check on the settings page | None exists; the watcher handles it | Open |
| `update-card.tsx` | "brand's navy" | `bg-popover` | Open |
| `ChangelogEntryItem compact` | "for the corner card" | Unused | Open (remove) |
| `FullPageLoader` vs About | "carries no version badge" vs "the way the loading screen wears it" | The two comments contradict each other | Open |
| `features/dashboard/hooks.ts` | A "fifteen-second loop" | 60 s | Open |
| `dashboard/panels.tsx:58-93` `HeroCard`/`Delta` | — | Dead code that ignores the under-5 rule (F-192) | Open (remove) |
| `src/server/snapshots.ts` lock comment | One session | Sessions are per serverless instance. The lock is database-wide, so it still works | Open (wording) |

## Migration headers (F-197)

**Leave.** A migration's checksum is recorded in `schema_migrations`. Editing an applied file only makes `db:migrate` report drift for it, so these are corrected in the knowledge base instead:

| File | The header says | True today |
| --- | --- | --- |
| `0071_workspace_snapshots.sql` | "a restore also checks their password" | `RESTORE_NEEDS_PASSWORD = false`. Only the wipe asks. v0.40.0's changelog line says the same wrong thing |
| `0075_column_removed.sql` | Nine special types | Ten since 0078 (Requester) |
| `0052_automations.sql` | The partial unique index takes receipts with no task | It can't: the primary key makes `item_id` NOT NULL (F-105, proven on E3) |
| `0070_comment_reactions.sql` | "viewers included" | True of the policy. The UI offers reactions to editors only (F-183) |

## On-screen text that is wrong

| Where | Shows | Should say | Status |
| --- | --- | --- | --- |
| Settings → Roles | "Reset demo data" row | Automations, allocation and portal, snapshots and the Danger zone | FX-14 |
| Notification preference COMMENT (`notification.ts:94,105`) | "Comments on my items / Someone posts an update on an item you own" | Replies to your updates (F-185) | Open |
| Expired session (`api-call.ts:20`) | "…Sign in again to manage members." everywhere | "Sign in again." (F-172) | Open |
| Ticket rewrite toast | "1 tickets" (F-128) | Singular or plural | Open |
| Workload, Kanban and phone Kanban empty states (`workload-view.tsx:73`, `kanban-view.tsx:182`, `mobile-kanban-view.tsx:61`) | "People column" | PIC (F-146) | Open |
| Timeline empty state (`timeline-view.tsx:56`) | "Timeline or Date column" | Timeline or Due date (F-146) | Open |
| Create board, Blank template summary | "1 group · 4 columns" | 1 group · 10 columns | Open |
| Save as template, column settings hint | Mentions "number formats" | There is no number-format UI (F-147) | Open |
| v0.43.0 changelog | "No other word can be saved as a department" | True on Supabase only. The local provider has no equivalent of trigger 0074 (F-167) | Leave (history). Knowledge base says so |

## Not drift, but undocumented until now

These are now in the knowledge base draft:

- Snapshot files hold live share, portal and invitation tokens, the booking key and webhook URLs.
- A restore replaces the **whole database** (every workspace), empties tables missing from the file, and brings back pending automation work.
- The wipe clears team receiving boards and portal requests. It keeps Task Allocation's columns, groups and rules.
- The local provider never drains its automation queue (F-181). Event and schedule rules only fire on Supabase.
- Upgrading: the Task Allocation top-up can add a REQUESTER "Requester" beside an old plain-text "Requester" column. Migration 0078 converts nothing; only the seed does.
