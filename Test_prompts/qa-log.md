# QA log — full pre-production pass

Run started 2026-09-05. App: RMIT Streamline (Next.js 16 App Router, React 19, TanStack Query,
Zustand, dnd-kit; data through a `Repositories` interface with a local IndexedDB provider and a
Supabase/Postgres provider).

Testing is done in a real browser through Playwright (local provider against the seed, plus a
Supabase pass against the live project) and by hand in the browser pane for visual work. Every
entry below records what was tested, what happened, and — where something was wrong — the root
cause and the fix.

Severity: **CRITICAL** data loss/corruption/permission hole · **HIGH** major feature broken ·
**MEDIUM** bug with a workaround · **LOW** polish.

---

## Phase 0 — Inspection

| Area | Finding |
| --- | --- |
| Routes | `/login`, `/` (redirector), `/workspace/[slug]` + `my-work`, `inbox`, `messages`, `members`, `settings`, `people/[userId]`, `teams/[teamId]`, `trackers`, `trackers/[trackerId]`, `boards/[boardSlug]` |
| Data | `Repositories` interface; `src/data/local` (IndexedDB via idb) and `src/data/supabase` (PostgREST + RLS). Provider chosen by `NEXT_PUBLIC_DATA_PROVIDER`, default supabase |
| Services | board, item, item-link (+sync), comment, message, my-work, profile, search, tracker, workspace |
| State | TanStack Query for server state; Zustand (`ui-store`, `board-ui-store`, persisted) for view state |
| Permissions | `src/lib/permissions/permissions.ts` — workspace OWNER/ADMIN/MEMBER/GUEST, board OWNER/EDITOR/VIEWER, visibility WORKSPACE/TEAM/PRIVATE |
| Templates | blank, campaign, creative-production |
| Known placeholders | File attachments store metadata only (no object storage); member "invite" is local-only; Supabase auth needs a password, local auth signs in by email |
| Tests before this pass | 18 unit files / 100 tests, 24 local e2e, 14 Supabase e2e |
| Deployment | Vercel (`vercel.json`), auto-deploy from `main`; migrations applied by `predev`/`prebuild` and `.github/workflows/db-migrate.yml` |

---

## Findings

Legend: **BUG** = defect in the app · **OBS** = behaviour worth recording (correct, but non-obvious) ·
**TESTER** = my own test was wrong and the app was right, kept so the same trap is not re-entered.

### 1. Authentication / account — 7 checks, 0 defects

| Test | Result |
| --- | --- |
| Unknown email refused with a message, stays on /login | pass |
| Sign in by typed email | pass |
| Session survives reload and deep links | pass |
| Six protected routes redirect to /login when signed out | pass |
| Sign out clears the session; the back button does not restore the shell | pass |
| Dev user switch swaps the whole workspace view and survives a reload | pass |
| Empty email cannot be submitted | pass |

### 2. Workspace, teams, members — 6 checks, 2 defects

**BUG-1 (MEDIUM) — a form with a length limit refused to submit and said nothing.**
A team description over 200 characters left "Create Team" doing nothing: no message, no toast, the
dialog just stayed open. Root cause: `create-team-dialog.tsx` validated `description` with
`z.string().max(200)` but rendered an error only for `name`, so react-hook-form blocked the submit
invisibly. The same pattern existed for first and last name in `invite-member-dialog.tsx`.
Fix: render the field error under every validated control and give the length rules human messages.
Retest: the dialog now says "Keep the description under 200 characters" and submits once shortened.

**FIX-2 (LOW) — creating a team left you where you were.** Creating a board or a tracker opens it;
creating a team only toasted. Fix: route to the new team on create (not on edit).

| Test | Result |
| --- | --- |
| Unknown workspace slug shows "Workspace not found" and a way back | pass |
| Team create, rename, add member, remove member, archive — each surviving a reload | pass after FIX-2 |
| A long team name does not push the page into horizontal scroll | pass |
| Invalid team id shows the not-found state | pass |
| Members list, profile link, role change persisted across a reload | pass |
| Deactivating a member removes them from the person picker | pass |

### 3. Boards — 7 checks, 0 defects

| Test | Result |
| --- | --- |
| Blank / Campaign / Creative Production create the right groups, columns and column order, and are usable immediately | pass |
| Duplicate deep-copies groups, columns, items and values; editing the copy leaves the original alone | pass |
| Archive hides it from the sidebar, the URL still explains itself, restore brings it back | pass |
| Delete removes the board and its URL then says "Board not found" | pass |
| Favourite pins to the sidebar and survives a reload, both directions | pass |
| Unknown board slug shows not-found rather than a blank page | pass |
| Eight rapid board switches land on the right board | pass |

### 4. Groups, items, subitems — 9 checks, 0 defects

| Test | Result |
| --- | --- |
| Group create, rename, add item, duplicate (items copied), collapse (persists), delete with items | pass |
| Group reorder by drag survives a reload | pass |
| Blank name refused; a 400-character name and a unicode/emoji/script-looking name stored as text, nothing injected, no horizontal overflow | pass |
| Ten items created in a burst all persist, in order | pass |
| Duplicate copies values; archive and delete both survive a reload | pass |
| Move to group from the row menu persists and the item leaves its old group | pass |
| Subitems persist (expansion state does not, by design); deleting the parent removes them | pass |
| Item deep link opens the panel and survives reload and re-entry | pass |
| A deleted item's deep link shows "Item not found" instead of hanging | pass |

**TESTER** — rapid creation, subitem persistence and group collapse all looked broken at first;
reading the IndexedDB rows showed the data was correct every time and my assertions were wrong.

### 5. Column types — 10 checks, 0 defects

| Test | Result |
| --- | --- |
| Text: set, overwrite, clear, Escape discards — all surviving a reload | pass |
| Number: 1234.5 formats as 1,234.5, negatives accepted, cleared to empty | pass |
| Checkbox toggles and persists | pass |
| Link: stores the href, shows display text, opens with rel=noreferrer, Remove clears it | pass |
| Tags: both a typed hash and a bare word render with exactly one hash; the tag joins the palette and a second item can pick it | pass |
| Timeline: a range persists exactly | pass |
| Dependency: link, blocked marker, self-dependency not offered, and deleting the target leaves no dangling reference | pass |
| Hide, reload, show from the toolbar keeps every value; move-left reorders and persists | pass |
| Deleting a column removes only its own values | pass |
| Column resize persists | pass |

**OBS-1 — an edit is lost if the tab reloads inside the write window.** Writes are optimistic: the
cell updates at once and the repository write lands a tick later (a network round trip on Supabase).
A reload in that instant cancels it. Inherent to optimistic UIs; see FIX-3 for the mitigation.

### 6. Cross-view consistency, updates, activity, inbox, My Work — 8 checks, 0 defects

| Test | Result |
| --- | --- |
| A status change appears in kanban, the item panel and My Work | pass |
| Removing and re-adding the owner takes the item out of My Work and back | pass |
| Due date moves the item between My Work sections; with none, the timeline end takes over; clearing both lands it in No Date | pass |
| Completed work sits behind the toggle; archiving removes it from My Work entirely | pass |
| Updates: empty refused, a 900-character update, markup and emoji stored as text, edit and delete, all surviving a reload | pass |
| A plain member sees no edit or delete controls on someone else's update | pass |
| Activity records "changed Status from Waiting to Stuck", newest first | pass |
| Inbox: open a notification, mark all read, badge clears and stays cleared | pass |

**OBS-2 — a no-op change writes no activity.** Setting a status to the value it already holds is
correctly ignored. This looked like missing activity until instrumenting `ItemService.setValue`
showed `from === to`.

### 7. Filtering, sorting, search, bulk actions, drag and drop — 8 checks, 0 defects

| Test | Result |
| --- | --- |
| Status, priority and group filters intersect; a contradictory pair shows the empty state; Clear all restores everything | pass |
| Search is case-insensitive, treats punctuation literally rather than as a regex, and clears | pass |
| Sort by name both directions, clear, and by due date with empty dates last | pass |
| Bulk select-all in a group, move, archive two, delete one — each surviving a reload; selection does not survive navigation | pass |
| Drag within a group reorders, keeps every row exactly once, and persists | pass |
| Three drags back and forth between groups keep every item exactly once | pass |
| Kanban drag between lanes persists and matches the table | pass |

**OBS-3 — filters, sort, search and selection are per-session by design** (`board-ui-store` is
explicitly not persisted), so a reload returns to the board's own order.

**OBS-4 (LOW, no fix) — Radix menus swallow a click made within about 100ms of a menu closing.**
Reopening the Sort menu immediately after choosing an option needs a beat. Standard behaviour for
Radix's dismissable layer; not worth diverging from the library.

### 8. Permissions — 6 checks + a database-level check, 1 defect

**FIX-4 (MEDIUM, accessibility) — a read-only cell had no accessible name.**
On a board a viewer can only read, `PopoverCell` rendered its disabled branch without the
`aria-label` or the test id it gives every editable cell, so a screen reader heard the bare value
with no column or item attached to it. Fix: pass both through to the read-only shell.

| Test | Result |
| --- | --- |
| A viewer sees the board, has no row menu, no add-item, no add-group, no add-column, a disabled select-all, and a cell that is a plain gridcell rather than a button | pass after FIX-4 |
| The value is unchanged after a viewer clicks a cell | pass |
| A private board is absent from a non-member's sidebar and its URL says "This board is private"; a workspace admin can still open it | pass |
| A guest gets no "Add new" affordance and no "New tracker" | pass |
| A guest cannot open a workspace-visible board they are not a member of | pass |
| A viewer gets no Delete or Archive in the board menu; the owner gets both | pass |
| An editor can post an update but gets no edit/delete controls on someone else's | pass |
| **Row-level security refuses a guest at the database**, not only in the UI: a guest's token cannot read the board or its items through PostgREST, a direct PATCH updates no rows, and the value is untouched afterwards | pass |

**OBS-5 (policy, for the team to confirm) — a guest who is in a team can edit that team's boards.**
`boardRoleFor` grants EDITOR through team membership without excluding guests, while
workspace-visible boards exclude them explicitly. Client and database agree (`private.board_role`
mirrors it), so this is deliberate-looking rather than a hole, but it is worth a decision: the seed
puts two guests (an agency partner and a copywriter) inside teams.

### 9. Data integrity and stress — 8 checks, 0 defects

| Test | Result |
| --- | --- |
| Ten status changes in a row leave the last one stored, and no item/column pair ends up with two value rows | pass |
| Create then immediately delete leaves the board exactly as it was | pass |
| Switching boards straight after an edit keeps the edit | pass |
| Archived items disappear from the board, the board search, kanban, My Work and the command palette | pass |
| Deleting a group removes exactly its own items and nothing else, and nothing points at them afterwards | pass |
| A second tab sees the first tab's change (local realtime) | pass |
| A half-wiped IndexedDB store still renders the board, and the developer reset restores the demo data | pass |
| Rubbish in localStorage does not stop the app from starting | pass |

**FIX-3 (MEDIUM) — a write in flight could be lost by closing or reloading the tab.**
Every write is optimistic, and the tracker editor waits 600ms after typing stops before it saves, so
there was a window — up to about a second, plus the round trip on Supabase — where the screen said
"saved" and the database had nothing. Fix: `src/lib/unsaved-work.ts` counts writes in flight and asks
before unload while any is outstanding; `useBoardMutations.run` and the tracker autosave both hold it.
Covered by four unit tests (dispatching `beforeunload` and checking it is cancelled).

### 10. Views, routing and error states — 8 checks, 0 defects

| Test | Result |
| --- | --- |
| All five views open, switch repeatedly and leave no console errors | pass |
| Timeline plots dated items, ignores an undated one, and picks it up when a date is set | pass |
| Calendar shows dated items, navigates months, opens an item | pass |
| Nine routes survive a direct load and a refresh with no console errors and no 404 | pass |
| Browser back and forward keep the app coherent | pass |
| Invalid board, team, person and tracker ids each show a state rather than a blank screen | pass |
| Command palette: no-result state, navigation from a result, board-scoped reopen, Escape | pass |
| A My Work row and an inbox notification both land on the right item | pass |

### 11. Performance — measured on a board with 300 items, 8 groups and 12 columns

Dev build, so the absolute numbers are pessimistic; what matters is the direction.

| Action | Before | After |
| --- | --- | --- |
| Open the item panel | 4,870ms | 2,500ms |
| Rows re-rendered when the panel opens (16-row board) | 34 | 2 |
| Rows re-rendered when one row is selected | 32 | 2 |
| Type into a cell | ~300ms | ~300ms |
| Filter the board | ~300ms | ~300ms |
| Switch to kanban | ~1,300ms | ~1,250ms |
| First row painted | ~2,850ms | ~2,880ms |

**FIX-5 (MEDIUM) — the whole table re-rendered whenever the URL changed.**
Opening the detail panel puts the item in the query string. `replaceParams` closed over
`searchParams`, so it was a new function on every navigation; it went into the board context, so the
context object changed, so every row and every cell re-rendered. Three changes, each verified by
counting renders:
1. `replaceParams` reads the query at call time, so the callback (and the context) stays stable.
2. `BoardTable` is memoised — the board page re-renders on navigation, and without this the table
   re-rendered every row through dnd-kit's context, which `React.memo` on the row cannot prevent.
3. Rows and the table subscribe to booleans (`is this row selected / expanded / open?`) instead of to
   the whole per-board UI slice.

What remains is browser layout of a very wide grid (3,600 cells), not React work. Worth revisiting
with virtualisation only if boards routinely pass a few hundred rows.

### 12. UI / UX and responsive — 4 defects

**FIX-6 (MEDIUM) — the board search field covered the Person and Filter buttons.**
Between roughly 1000px and 1200px the search `Input` kept its fixed width while its wrapper shrank,
so it overflowed and painted on top of the two filter buttons, which could then not be clicked at
all. Fix: the wrapper carries the width and the input fills it. The four tools also drop their words
below `xl` and keep their icons, so nothing overflows at 1024 either (measured: the toolbar's scroll
width now equals its client width at 1440, 1200, 1024, 900 and 768).

**FIX-7 (MEDIUM) — the timeline opened on empty space.** The chart's range starts at the earliest
dated item, so a board with older work opened weeks away from today with the bars off to the right.
It now opens centred on today, once per board, and leaves the reader's scrolling alone after that.

**FIX-8 (LOW) — day cells bled past the frozen label column in the timeline.** The gutter was
padding on the scrollport, which scrolls with the content; it is now a margin on the chart, so the
frozen column covers everything to its left.

**FIX-9 (LOW, phones) — My Work rows on the home page collapsed to one letter, and the board title
disappeared.** Below `sm` the home rows now show the task and its date only, and the board header
drops its tile, member avatars and Invite button so the name has room.

Checked and found sound: light and dark themes across home, board, My Work; the item panel; all five
views; dialogs, menus, the palette and popovers near the viewport edges; sticky headers and the
frozen first column while scrolled; empty states; long names; 1440/1280/1024/768/390 widths.

### 13. Accessibility — 6 checks, 0 further defects

| Test | Result |
| --- | --- |
| Every visible button, link and input on five main routes has an accessible name; no unlabelled inputs; no image without alt; no duplicate ids | pass after FIX-4 |
| 25 tab stops on a board all land on a visible, focusable element | pass |
| A status cell opens with Enter, closes with Escape, and focus returns to the cell | pass |
| A dialog takes focus, closes on Escape and returns focus to what opened it | pass |
| The command palette opens focused and closes on Escape | pass |
| Every page has a level-1 heading that names it | pass |

### 14. Automated quality

| Check | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` (unit + component, 19 files) | 104 passed |
| `npx playwright test` (local provider) | 108 passed, twice in a row, 15 Supabase tests skipped |
| `npm run test:e2e:supabase` | 15 passed against the live project |
| `npm run test:e2e:deployment` | 5 passed against rmit-streamline.vercel.app |
| `npm run build` | succeeds, 14 routes |

### 15. Regression pass

After every fix landed, the whole list from the brief was retested by the suite above: login,
workspace load, team and board navigation, creating a board and an item, editing an item, status,
owner, priority and date changes, dragging within and between groups, filters, sorting, search, the
item panel, comments, My Work, notifications, kanban, refresh persistence, destructive operations,
permissions, and the board at four widths. Two consecutive full local runs were clean, so nothing
here depends on ordering or timing.

### 16. Deployment

Pushing to `main` builds on Vercel. Commits `9e76d0c`, `9a9b682`, `af58c61`, `b24cb0f` went up, the
build succeeded, and the new code was confirmed live by finding a string it introduced
("Filter by person") in the served bundle. `npm run test:e2e:deployment` then drove the deployed app
end to end — sign in, board, every view, create an item with a status, owner, date and update, drag
it between groups, reload, delete it, walk every page, follow a deep link, and check an unknown board
says so — with no console errors and no failed requests. The only production-specific finding was in
the test rather than the app: Next prefetches the sidebar's routes and aborts them on navigation, so
cancelled RSC prefetches are ignored.


---

# Daily-operation audit — 2026-09-07

A second pass, this time following one person's working day through the app in **supabase** mode
against the live demo workspace (RMIT VN MKT), plus the production smoke suite against
rmit-streamline.vercel.app. Persona: Danh (workspace owner). Every write below was undone or
removed afterwards, except the extra demo data described at the end, which was the point.

## The day that was walked

Sign in → Home → My Work → Inbox (open a notification) → board (status, owner, due date, new item,
subitem, update with @mention, Activity tab, Kanban/Timeline/Calendar) → public booking form
(stakeholder POST with the link key, wrong key refused) → Task Allocation → allocate the booking to a
team board (linked item + asset subitems) → Messages (send) → Tracker (edit a cell, autosave) →
sign out → wrong password → sign in → phone width (390) on Home and a board.

## Findings

**BUG-10 (HIGH, production) — a status picked straight after creating an item could be undone.**
Seen in the deployed smoke run: the activity log said "Not Started → Working On It" but the stored
value was `not_started`. `ItemService.createItem` wrote the board's default status with an upsert
*after* inserting the item; the row is on screen optimistically, so a status chosen in that window
was overwritten when the default landed a round trip later (Singapore ↔ Vercel makes the window
real). Fix: `ItemRepository.setValuesIfAbsent` (insert-or-ignore in both providers) and
`createItem` uses it for defaults. Unit test: `tests/unit/board-service.test.ts` "keeps a status set
while the item was still being created".

**BUG-11 (MEDIUM) — allocating a booking left its asset subitems in "Incoming".**
`BookingService.allocate` moved the request to "Allocated" but not its subitems, which stayed in
the Incoming group (deleting that group would have taken them with it). Fix: the subitems follow
the parent. Covered in `tests/unit/booking.test.ts`.

**FIX-12 (LOW) — the browser tab always said "RMIT Creative Team".** The root metadata title is
static; the workspace was renamed to RMIT VN MKT. `AppShell` now keeps `document.title` at
"Streamline · <workspace name>" (a MutationObserver, because the router writes the static title
back on every navigation, search-param changes included). The public booking page's footnote uses
the workspace name too.

**FIX-13 (test hygiene) — failed deployment smoke runs leave "deploy-… smoke item" rows on the live
RMITinerary board.** Three were found. The test body is now wrapped in `try/finally` with a
best-effort `removeIfLeft`; the leftovers were deleted.

**OBS-6 — production is slow enough to fail the smoke suite on time.** The retry of the
item-lifecycle test hit the 90 s budget at the drag step; each cell edit is several sequential
round trips to Supabase. Booking a task through the API took 4.6 s locally; allocation ~10 s.
Worth a look at batching the writes in `allocate` and `book` before real use.

**OBS-7 — Inbox notification rows have no accessible name** (`button` with only visual content),
and tracker grid cells are unnamed `gridcell`s. Screen-reader users hear nothing useful. LOW.

**OBS-8 — the "Team board" list in the allocation panel is unsorted** and does not say which team
owns each board. LOW.

**OBS-9 — sign-in errors show Supabase's raw text** ("Invalid login credentials"). LOW.

**OBS-10 — README still describes the app as local-first with Supabase "not yet connected".**

Checked and sound: every daily surface loads without console errors; status/owner/due-date changes
write activity and notify the owner (owner excluded when actor); mentions notify; inbox click-through
opens the item panel; deep links with `?item=` reopen the panel; public booking rejects a wrong key
(403), accepts a valid one (201), stores requester columns, asset subitems and the description; the
TASK_BOOKED notification reaches every active owner/admin; allocation creates the mirror item, the
link, copies subitems and writes "Allocated to"; messages persist and the thread rises with an unread
badge; tracker edits autosave (600 ms) and clear; sign-out clears the session; wrong password is
refused; 390 px layouts have no horizontal scroll.

## Demo data

The live workspace has been hand-edited (renamed teams, extra people, a Tester team) so
`npm run db:seed` — which wipes the seed workspace — was not used. Instead:

- `src/data/seed/seed-extras.ts` adds, to both providers: the Admin team and Task Allocation board
  with 8 realistic bookings (5 incoming, 2 allocated with linked mirrors, 1 closed) and 18 asset
  subitems; 27 direct messages in 6 threads (unread for Danh and the admin account); two more
  trackers (Vietnam Production Log, Open Day 2026 Run Sheet); 11 more updates with mentions;
  12 fresh items so My Work has Today / This Week content; 54 notifications including TASK_BOOKED.
- `npm run db:seed:topup` (new) adds only those extras to a live database, `on conflict do nothing`,
  remapping onto the existing Admin team / Task Allocation board, translating each base board's
  group and column ids by name (the live layout no longer matches the seed's id counters — a first
  attempt was rejected by the `enforce_value_same_board` trigger), renaming teams to their current
  names, and fanning TASK_BOOKED out to whoever is an admin now. Running it twice inserts nothing.
  Pure logic in `src/data/seed/seed-topup.ts` with tests in `tests/unit/seed-topup.test.ts` and
  `tests/unit/seed-integrity.test.ts`.

Applied to the live project on 2026-09-07: 44 items, 186 values, 2 links, 2 trackers, 3 sheets,
11 comments, 39 activities, 70 notifications, 27 messages.

## Automated quality

`npm run check` clean (lint, typecheck, 215 unit tests across 33 files). Local Playwright suite
(production build, local provider): 158 passed, 6 failed on expectations that had the old seed's
numbers baked in (16 items on RMITinerary, "3" unread for Danh, a reset test that navigated away
before the reseed finished); those now read their numbers from the seed and pass. Deployment smoke suite:
before the deploy 2 passed, 1 failed (BUG-10 and OBS-6), 2 skipped. After deploying 307dd02 the
status race is gone in production (both smoke items stored `working`); the remaining failures were
the suite's own — a stale "Drag <name>" locator (the handle is now `item-drag-area`), a 90 s budget
too short for ~20 sequential round trips (now 240 s), and cleanup in a `finally` a timeout had already
cancelled (now `afterEach`). Final run: 5 passed, the cross-group drag needing one retry. Version 0.3.1.

---

# Asset lines and the "Assets recap" column — 2026-09-07

Danh asked for a per-task asset listing (type, person in charge, quantity, due date) with live totals,
and a compact "Assets recap" column, because most tasks are too small for a tracker sheet.

**Built:** `item_assets` table (migration 0015, RLS follows the item: view = `can_view_item`, write =
`can_edit_item`, a trigger keeps `board_id` equal to the item's board, realtime published) with IndexedDB
store v8; `ItemAssetRepository` for both providers; `ItemAssetService` (add / addMany / update / remove /
copyTo) that rewrites the cached `ASSETS_RECAP` value on every change; new column type `ASSETS_RECAP`
(read-only cell, derives from live lines when the board has them loaded, click opens the panel on the
Assets tab, sorts by quantity, excluded from link sync, backfilled when the column is added or topped up);
the Assets tab on the item panel (summary strip, per-type breakdown, next due / overdue, one compact card
per line with chips for type, person, a quantity stepper and due date — designed for the 520 px panel and
a phone); bookings write their asset lines and allocation copies them; the Task Allocation board gains
the column through its top-up; seed extras carry 34 lines and their recap values.

**Found and fixed on the way:**
- Escape inside a picker in the item panel closed the whole panel (pre-existing; every popover cell had
  it). The panel now ignores Escape while a popover, menu or dialog is open.
- The Task Allocation column top-up only ran when the system entities were missing, so an existing board
  never received new columns. Admins now run the top-up once per page load.
- The booking form spent 1.6–2.5 s in ~15 sequential reads (system-entity maintenance on every load).
  A read-only fast path and parallel column reads bring it to 0.4–0.7 s; booking 3 s → 2.1 s.
- Inserting `pushValue` calls mid-sequence in the seed extras shifts the `extraValue` ids after them; the
  additive top-up tolerates it (`on conflict do nothing`) but it is worth appending new values last.

**Tested:** unit — recap maths, column type contract, service CRUD + recap cache, backfill, cascade on
item delete, booking → lines → allocation copy (`tests/unit/item-assets.test.ts`); e2e —
`tests/e2e/item-assets.spec.ts` (add, stepper, type, person, due, live cell, reload, remove, viewer
read-only); by hand on the live workspace at 1440 and 390 px. Version 0.4.0.

**FIX-14 (production latency) — the Vercel functions ran in Washington (`iad1`) while the database is in
Singapore.** Every server-side read in the booking and onboarding route handlers crossed the Pacific:
the booking form took 2.4–3.4 s on rmit-streamline.vercel.app even after the code fast path. `vercel.json`
now pins `regions: ["sin1"]`; the same endpoint answers in 0.35–0.6 s warm (1.1 s cold) and the deployment
smoke suite passes 5/5 in one run. Browser-to-Supabase calls were never affected (they go direct).

---

# Seven views, a still front gate and months of history — 2026-09-07

**Views.** "Coming later" is gone: Gantt, Workload and Chart are real, Form is dropped, and the four
existing views show more without getting busier.
- *Kanban* — lanes by status (default), priority, person or group; dropping a card writes that value.
  Cards carry status (when it is not the lane), priority, tags, T-shirt size, due date or span, subitem
  progress, asset count, dependency and link markers, updates and owners. Lanes collapse to a strip and
  show their overdue count.
- *Timeline* — bars coloured by status (hatched when stuck, faded when done) with the owner's avatar,
  labels beside short bars, milestones for date-only items, a group span bar, three zoom levels, a
  Today button and a list of undated items instead of silently dropping them.
- *Calendar* — month or week; each entry shows status colour, overdue mark and owner; "+N more" opens in
  place; the week gives every item a card with status, priority and owners.
- *Gantt* — groups, items and subitems (expand on demand) with owner, status and dates; bars, milestones,
  subitem progress inside the bar, and dependency arrows from the Dependency column, red when the
  upstream item is not done and the dependent one has started. Read-only by design.
- *Workload* — people against weeks or days, counting items due or active in the period, with load tints
  (0 / 1–2 / 3–4 / 5+), a status bar per person, overdue counts and a popover listing each cell's items.
- *Chart* — items, a Number column's sum or asset units, by status, priority, group, person, tags, size or
  due week, as bars or a donut; bars and legend entries open their items.
All seven read the same filtered board model, so search, filters and sort apply everywhere. Shared
building blocks: `views/view-shell.tsx` (view bar, pill groups, stats, empty state) and
`views/date-scale.tsx` (one date axis for Timeline and Gantt). Aggregation logic is pure
(`views/view-aggregates.ts`, 21 unit tests). Every view has an e2e in `tests/e2e/board-views.spec.ts`.

**Front gate.** Danh asked for a revamp, then for no motion on the panel and a single loading bar. The
brand panel is now a still: navy, red glow, grid and a small board illustration (three lanes, one card
in progress). The only things that move on these screens are the one bar under the brand mark while a
session or workspace is fetched and the one bar on the sign-in card that fills a third per step (sign in
→ find workspace → open). Both hold still under reduced motion.

**History.** `src/data/seed/seed-history.ts` generates ~370 top-level items and ~340 subitems across
every board from 150 days ago to 75 days ahead with a seeded PRNG (mulberry32 per board): business-day
timelines, statuses that follow time (past mostly done, present working, future not started), weighted
owners so Workload shows hot weeks, dependency chains for the Gantt, asset lines, status-change
activity and comments. Own id namespaces (f1–f6), positions from 100 so nothing existing moves, and it
rides the existing `db:seed:topup`. Applied to the live workspace on 2026-09-07: 708 items, 2,884
values, 248 asset lines, 65 comments, 840 activities, 17 notifications (34 values dropped because the
live Website Redesign board has no "Story points" column; 6 items skipped whose parent was not there).

**Found on the way.** `ItemService.createItem` placed a new item at position = sibling count, which
with sparse positions landed it mid-list; it now goes after the highest position. Version 0.5.0.

**Follow-ups the same afternoon.**
- The sign-in panel is a still (Danh: no motion, then no illustration either); the loader and the sign-in card
  each show one bar. Nothing else on those screens moves.
- Activity lines on Home, in the board activity dialog and on the item panel link to the item they describe;
  the item panel's breadcrumb links to its board. The generic board icon is now a kanban glyph
  (`square-kanban`) wherever a board is meant.
- The view a person last used is remembered per person and per board, in the browser and on their board visit
  (migration 0016: `board_visits.view`, `board_visits.view_settings`), so it follows them between devices.
  Each view keeps its own settings the same way (`views/view-settings.ts`): Kanban lanes, tint and collapsed
  lanes; Timeline and Gantt zoom; Calendar month/week; Workload period, mode and measure; Chart measure,
  dimension and type.
- Kanban: dragging uses dnd-kit sortable so the other cards make way and a dashed ghost sits where the card
  will land; when the lanes are groups that order is saved. Cards open on click anywhere; the item panel floats
  over the lanes instead of squeezing them; a "Tint lanes" setting washes each lane in its colour.
- History items that would have been "created" a moment ago (their work starts weeks ahead) are now created
  on a past date; the 200 live rows affected were re-dated in place.
- `ItemService.createItem` appends after the highest position rather than at position = count.
