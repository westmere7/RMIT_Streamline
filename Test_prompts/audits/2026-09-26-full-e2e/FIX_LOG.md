# Fix log — end-to-end audit, 26 September 2026

## Where they stand now

Everything below was written before any of it ran. Later the same day:

| Kind | Now |
| --- | --- |
| RUN-1, RUN-2 (the runner and the seed) | Committed in v0.49.1 (`b91a73b`) |
| FX-01 … FX-18 | Applied by `apply-fixes.mjs` (all 55 snippets matched), committed in v0.49.1 (`b91a73b`). The unit suite passed, and the fixes for F-101, F-102, F-103 and F-106 were checked on the disposable stack (`COVERAGE.md`) |
| The SQL | Checked on the disposable stack, then moved into `supabase/` and appended to `sequence.txt` (`5ea3de4`). The next deploy applies it to production |
| The phone revamp | v0.50.0 (`eb96121`); `MOBILE_AUDIT.md` says what was built |
| F-200 (UI preferences reset on reload) | Found by the phone suite; fixed in v0.50.0 |
| Stale e2e specs (F-193 and more) | Caught up with the app (`9abeb29`) |

## As first written

Two kinds of fix, kept apart:

| Kind | Where it is | State |
| --- | --- | --- |
| **In the working tree** | `scripts/db-migrate.mjs`, `scripts/db-seed.mts`, `supabase/sequence.txt`, `tests/unit/sql-sequence.test.ts` | Made before the permission block, each one **run and checked** |
| **Prepared** (FX-01 … FX-18; there is no FX-04) | `deliverables/fixes/` as exact find/replace snippets, applied by `deliverables/apply-fixes.mjs`. Whole-file replacements, such as `src/server/requesters.ts`, are in `deliverables/repo/` | Written against `0649d71`, **never applied or run** |
| **Proposed SQL** | First `proposed-sql/` beside this file; now `supabase/` | Checked on E3, then shipped (see above) |

Applying the prepared fixes:

- `node apply-fixes.mjs <repo> --check` confirms every snippet matches exactly the number of times the manifest says (once, unless `count` is given) and writes nothing.
- Without `--check` it writes every file, keeping each file's line endings.
- If any snippet fails to match, it writes **nothing** and names the snippet.

---

## Made and verified in the working tree

### RUN-1 — The SQL runner follows the order the database grew in (F-108)

**Root cause.** The runner applied `migrations/*.sql` in name order, then `policies/*.sql`. Thirteen migrations call `private.*` helpers that only `policies/0001` and later policy files define. Production was built file by file over weeks, so it never hit this. An empty database does.

**Files**

| File | Change |
| --- | --- |
| `supabase/sequence.txt` (new) | The 96 SQL files in the order they were first added to git (`git log --diff-filter=A --no-renames --reverse`) |
| `scripts/db-migrate.mjs` | `readSequence()` and `inSequence()`. Pending files run in sequence order. Files missing from the sequence run after the listed ones, in the old order, each with the warning `! <name> is not in supabase/sequence.txt; it runs after the listed files.` The header comment says so |
| `tests/unit/sql-sequence.test.ts` (new) | Fails when a SQL file is missing from the sequence, when one is listed twice or doesn't exist, when a directory's own order is broken, or when `policies/0001` comes after `migrations/0005` |

**Before the fix (E3, empty database):** the run stopped at `migrations/0005_direct_messages.sql` with `schema "private" does not exist`.

**After the fix (E3):**

- 96/96 applied.
- The second run printed "Up to date — 96 file(s) already applied." `--dry` printed the same.
- 44 public tables, the same list as production.
- `npx vitest run tests/unit/sql-sequence.test.ts` → 4 passed.

**Production.** Nothing changes there: its ledger already holds all 96 names, so nothing is pending.

**Rule from now on.** Every new SQL file gets a line at the end of `supabase/sequence.txt`. The unit test enforces it.

### RUN-2 — `db:seed` writes today's schema (F-109)

**Root cause.** The seed still wrote asset lines with `assignee_id`, a column migration 0017 replaced with `assignee_ids`. The value was `undefined`, which postgres.js refuses (`UNDEFINED_VALUE`). The seed also omitted columns added since.

**Files.** `scripts/db-seed.mts`:

| Rows | Now also written |
| --- | --- |
| Board columns | `hidden_in_panel`, `role`, `removed` |
| Items | `cover_url` |
| Asset lines | `assignee_ids` (instead of `assignee_id`), `completed_at`, `preview_url`, `artwork_url` |
| Comments | `parent_id` |

**After the fix (E3):**

- `npm run db:seed` exit 0: 22 profiles, 9 teams, 13 boards, 1,413 items, 6,820 values, 94 comments, 3 trackers, 86 notifications and 27 messages.
- `npm run db:special-columns` then reported "Every board already has every special column."

---

## Prepared, not applied

Each row names the finding, the files, and the regression test that comes with it. "Test" means a test in the fix itself; everything else is covered by the suites named in `NEXT_SESSION.md` §2.

### FX-01 — Portal booking for a department with no work (F-101, P1)

| Snippet | File | Change |
| --- | --- | --- |
| a, b | `src/features/portal/portal-booking.tsx` | The doc comment says a department with no work is sent by name. `onSubmit` refuses an empty department, then sends `stakeholderFor(request.department)?.id ?? null` |
| c, d, e | `src/services/stakeholder-portal-service.ts` | `PortalTransport.book`, `publicBook` and `book()` take `departmentId: EntityId \| null` |
| f | same | `book()` uses `requireDepartment` when there is an id. Otherwise it calls `departmentNamed` with the typed name |
| g | same | `departmentNamed(workspaceId, name)` (new): an ACTIVE department from `ensureDepartments`, matched trimmed and case-blind. If none matches it throws "Pick which department this is for." |
| h | `src/data/supabase/portal-transport.ts` | Sends `departmentId: string \| null` |
| i | `src/server/portal.ts` | Schema `departmentId: z.string().uuid().nullish()` |
| j | `src/app/api/portal/[token]/book/route.ts` | Passes `body.departmentId ?? null` |
| k | `tests/unit/portal-booking.test.ts` | **Test:** a department with no work books by name, in any case. "School of Design" (not on the list) is refused |

### FX-02 — Public bookings stop renaming people; exact email match (F-102 P1, F-103)

| Snippet | File | Change |
| --- | --- | --- |
| a, b | `src/services/booking-service.ts` | Doc comments: the typed name is used only for someone new |
| c | same | The local-provider directory renames nobody it finds in the member list. (As drafted it still renamed pending members; amended to the owner's rule on 26 September) |
| d | `tests/unit/booking-requester.test.ts` | **Test (changed):** booking with an active member's email (Emily) leaves `emily.displayName` as it was |
| — | `src/server/requesters.ts` | Replaced whole (mirror file). `.eq("email", email)` in place of `.ilike`. Renames nobody: anyone in the member list keeps their name, and an existing account from elsewhere is invited without being renamed |
| — | `tests/unit/booking-requester.test.ts` | **Test (changed):** a second booking from a pending member under a different name keeps the first name |

**Product owner, 26 September 2026:** nobody already in the member list is renamed, pending members included; only someone new takes the typed name. This replaces v0.48.0's "the name you book with is saved".

### FX-03 — `column_cleared` reads whole values (F-106)

| Snippet | File | Change |
| --- | --- | --- |
| a | `src/services/automation-engine.ts` | The `column_cleared` check reads `wholeValue(before)` and `wholeValue(after)` |
| b | same | `export function wholeValue(v)`: `{ ...emptyValueFor(v.type), ...v }`, or null |
| — | `tests/unit/automation-stripped-payloads.test.ts` (new) | **Test:** feeds the engine the stripped payload Postgres sends (`{before:{type:"DATE",date:"2026-09-01"}, after:{type:"DATE"}}`). It expects the rule to run and post "The due date was cleared.", and pins `wholeValue` on each affected type |

### FX-05 — Kanban lanes for everyone a task can name (F-110)

`src/features/boards/components/views/kanban-lanes.ts` (a–c): lanes come from `people ?? users` (the board context's full directory, pending and deactivated included), and the memo depends on it.

### FX-06 — Phone date sheet uses the local day (F-111, M-05)

`src/features/boards/components/mobile/mobile-item-card.tsx` (a, b): imports `toISODate` and uses it for Today, Tomorrow and Next week, as the desktop picker does.

### FX-07 — Search: tickets need a digit (F-112)

| Snippet | File | Change |
| --- | --- | --- |
| a | `src/services/search-service.ts` | Imports `parseTicket` and `ticketSearchKey` |
| b | same | `ticketScore(ticket, query)`: null unless the query has a digit. 0 when the normalised ticket equals the query, or the bare number equals the ticket's number. 3 for a substring. Null otherwise |
| c | same | Items score `best(searchScore(name), ticketScore(ticket, query))` |
| d | `tests/unit/search-service.test.ts` | **Test:** "c" finds the two names with a c in them, and "cp" finds nothing, instead of every ticket. "14" and "cp-14" still find CP_014. "79" and "CP26_079" find CP26_079 (a prefix with digits in it, like the live CP26) |

### FX-08 — Countdown takes "in 45m" (F-132)

`src/domain/board/countdown.ts`: the parser trims, lowercases and drops a leading "in ". **Test:** `tests/unit/audit-2026-09-26.test.ts`.

### FX-09 — Editing a rule cuts its name like creating one (F-168)

`src/services/automation-service.ts`: `update()` names the rule with `describeRule(...)` cut to 200 characters, as `create()` does.

### FX-10 — The tick reports its total (F-171)

`src/server/automations.ts`: the follow-up passes loop on `lastRan` and add to `report.ran` instead of overwriting it.

### FX-11 — Template tasks don't wake the template's rules (F-135)

`src/services/board-template-service.ts` (a, b): `createBoard` writes the tasks before it creates the automations. **Test:** `tests/unit/audit-2026-09-26.test.ts` checks that a board made from a template with a creation rule queues no events for its own seeded tasks.

### FX-12 — Restored drafts keep asset types (F-157)

`src/features/booking/wizard/booking-wizard.tsx` (`count: 2`): both places that rebuild rows from a saved line keep `assetType: line.assetType ?? null`.

### FX-13 — Link cells open only web and mail addresses (F-142)

`src/features/boards/components/cells/cell-renderer.tsx` (a–c): `normalizeLinkHref` from `@/lib/rich-text` (the same rule the rich-text editor uses), and the anchor is drawn only when there is a safe address.

### FX-14 — Settings → Roles says what each role can do today (F-187)

`src/features/workspace/settings-page.tsx`: "Reset demo data" is replaced by "Automations on a board", "Allocate requests, run the portal" and "Snapshots and the Danger zone".

### FX-15 — Version 0.49.1 and its changelog entry

`package.json` → `0.49.1`; `src/lib/changelog.ts` gets the entry "Portal booking for every department" (26 September 2026), with 12 bullets. `tests/unit/changelog.test.ts` requires the top entry to match `package.json`.

If the mobile revamp ships in the same push, make it **0.50.0** and fold these bullets into that entry (see `NEXT_SESSION.md` §8).

### FX-16 — Policies README says which file defines what today

`supabase/policies/README.md`: a "Current state (26 September 2026)" table naming, for each table and helper, the policy file whose definition is live.

### FX-17 — Dialogs scroll inside the screen (M-01)

`src/components/ui/dialog.tsx`: `DialogContent` gets `max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain`, with a comment.

### FX-18 — Hover-only controls show on touch (M-04, F-120)

`pointer-coarse:opacity-100` on 15 controls (`pointer-coarse:max-w-24` too on the row actions, which also animate their width):

| Snippet | File | Control |
| --- | --- | --- |
| a | `src/features/items/item-updates.tsx` | Add reaction |
| b | same | Edit and delete an update |
| c | `src/features/items/item-detail-panel.tsx` | The panel's column menus |
| d | `src/features/items/item-cover.tsx` | Change and remove cover |
| e | `src/features/boards/archive/archive-table.tsx` | Restore and delete |
| f | `src/features/messages/messages-page.tsx` | Delete a message |
| g | `src/features/workspace/lists-section.tsx` | Remove a list entry |
| h | `src/features/items/sync-field-list.tsx` | Unpair |
| i | `src/features/teams/team-page.tsx` | Team row action |
| j, k | `src/features/boards/components/table/item-row.tsx` | Row actions; add subitem |
| l | `src/features/boards/components/table/group-section.tsx` | Group menu |
| m | `src/features/boards/components/table/column-header-row.tsx` | Column menu |
| n, o | `src/features/trackers/tracker-grid.tsx` | Column menu; remove a chip |

Desktop-only hover controls are left alone: sidebar row menus, sort arrows, resize handles and the panel's drag grip.

---

## Proposed SQL (not run)

| File | Finding | What it does | Test on E3 before moving it |
| --- | --- | --- | --- |
| `supabase/migrations/0079_comments_stay_put.sql` | F-104, F-164 | A `before update` trigger refuses changes to `item_id`, `author_id`, `shared_id` and `parent_id`. A `before insert` trigger refuses a reply whose parent belongs to another task | As a member, PATCH your own comment's `item_id` through PostgREST → refused. Edit its body → allowed. Reply to an update on another task → refused. Linked-task update copies still post |
| `supabase/policies/0020_comments_update_needs_edit_rights.sql` | F-104 | `comments_update_author` also needs `private.can_edit_item(item_id)` | A viewer who wrote a comment before losing edit rights can't edit it. An editor can |
| `supabase/migrations/0080_recurring_receipts.sql` | F-105 | Drops the primary key on `automation_schedule_fires`, lets `item_id` be null, and keeps uniqueness with two partial unique indexes | The insert with `item_id = null` that failed (23502) succeeds. A second identical insert is refused. **First read how the Supabase repository writes receipts:** an `onConflict` target has to match one of the new indexes |
| `supabase/migrations/0081_rewrite_ticket_prefix_long_numbers.sql` | F-107 | `create or replace` of the prefix rewrite, padding to `greatest(3, length(n))` | CP_1234 → PROD_1234. CP_014 → PROD_014 |

Moving one into `supabase/`:

- Give it the next free number.
- Append it to `supabase/sequence.txt`.
- Remember that **Vercel's `prebuild` applies it to production on the next deploy**.

---

## Not fixed (open), in priority order

| Finding | Why not now |
| --- | --- |
| F-113 booking refusals as 500 | Needs a `BookingRefusal` error class threaded through `http.ts`. Small, but touches every booking route. Do it with a route test |
| F-114 automation loops through created tasks | Needs a depth mark on created items. Reproduce on E3 first |
| F-115 stuck claims, no retries | Needs a claim timeout in the drain. Test on E3 with a killed tick |
| F-116 undo deletes more than expected | A product decision: archive instead of delete, or clear the offer on any write |
| F-117 (held back until fixed) | A product decision |
| F-118 restore semantics | UI plus server work. Document first (done in the knowledge base draft) |
| F-119 public dashboard polling in the background | One line (`refetchIntervalInBackground: false`), but it changes how a wall screen behaves. Confirm with the owner |
| F-122/F-194 load-sensitive unit tests | Raise those four tests' timeouts, or split the xlsx round trip |
| F-123 … F-199 | Minor. Listed in `FINDINGS.md` |
