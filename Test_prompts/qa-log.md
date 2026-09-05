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
| `npx playwright test` (local provider) | 106 passed, 15 Supabase tests skipped |
| `npm run test:e2e:supabase` | 15 passed against the live project |
| `npm run build` | succeeds, 14 routes |
