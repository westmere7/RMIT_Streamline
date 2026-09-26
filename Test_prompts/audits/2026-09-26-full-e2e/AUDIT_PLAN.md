# Streamline end-to-end audit plan — v0.49.0

Written 26 September 2026 against `main` at `0649d71` (package `0.49.0`), after a
read of the whole source tree by five parallel inventories and a first execution
pass. It is the plan for testing everything the app offers: every route, every
flow a person can take through it, and the edge cases that break those flows.

Results live beside it: `COVERAGE.md` (what ran and what it showed), `FINDINGS.md`
(defects), `FIX_LOG.md` (what was changed), `MOBILE_AUDIT.md` (the phone), and
`NEXT_SESSION.md` (the runbook for what this session could not execute).

## 0. What is under test

| Dimension | Size at `0649d71` |
| --- | --- |
| Page routes | 27 (`src/app/**/page.tsx`): 10 public, 17 under `/workspace/[slug]` |
| HTTP route files | 29 (`src/app/api/**/route.ts`) |
| Column types | 25 (`COLUMN_TYPES`); 11 system types; 10 "special" columns on every board |
| Board views | 7 (Main Table, Kanban, Timeline, Calendar, Gantt, Workload, Chart) + the archive route |
| Automations | 21 trigger kinds (17 event, 3 schedule, 1 manual), 4 condition kinds × 11 ops, 23 actions, 10 recipes |
| Persistence | 77 migrations (0001–0078, no 0069), 19 policies, 44 public tables; IndexedDB `DB_VERSION` 17; 25 repositories |
| Tests at start | 102 Vitest files / 954 tests; 32 Playwright specs (~250 tests) |

## 1. Environments and safety rules

| Env | What it is | Used for | Never used for |
| --- | --- | --- | --- |
| **E1** Unit | Vitest 4 + happy-dom + fake-indexeddb | Pure logic, services on the local provider, components | RLS, SQL triggers, the network |
| **E2** Local browser | `next dev` with `NEXT_PUBLIC_DATA_PROVIDER=local` and `SKIP_DB_MIGRATE=1`. Playwright on `:3100` (fresh IndexedDB per test via `resetLocalData`); manual preview on `:3200` (`dev-preview`, its own `.next-preview`) | Every UI flow; phone widths; dark mode; a11y | Server-route auth, RLS, realtime, automation draining |
| **E3** Disposable Supabase | Supabase CLI stack in Docker (`E:\WORK_OFFLINE\apps\_streamline_sbstack`); schema built from the repo with the fixed runner; full `db:seed`. The app runs from a **separate git worktree** (`E:\WORK_OFFLINE\apps\_streamline_sb`) whose `.env.local` names only `127.0.0.1` services, on `:3300` | RLS as each persona, every service-role route, triggers, realtime, the automation runner, snapshots/restore/wipe, migrations from empty | — |
| **E4** Production | `rmit-streamline.vercel.app` + Supabase `lfkvrhycyrjgeqkyaiou` | Reference only: static configuration review | Writes, reads of member data, load, seeding (the session's permission classifier also refused production reads) |

Rules for every step:

1. Set `SKIP_DB_MIGRATE=1` on every `dev`/`build` in the main checkout. `predev`/`prebuild` otherwise migrate whatever `SUPABASE_DB_URL` names, and in `.env.local` that is production.
2. Run E3 from the worktree only. Its `.env.local` holds only local-stack values, so no script can fill a missing variable from production (the scripts fill every unset variable from `.env.local`).
3. Run `npm run db:seed` against E3 only. Against production it deletes the seed workspace.
4. Clean up after tests: E2 resets its store; E3 runs `supabase db reset`, then migrate and seed.
5. Run destructive flows (restore, wipe, delete board, deactivate) in E3 or E2 only.

## 2. Personas and fixtures

The local seed (`src/data/seed`) and E3 have the same accounts. Password `Password123!`; `admin@rmit.local` / `admin123`.

| Persona | Account | Workspace role | Why |
| --- | --- | --- | --- |
| Owner | Danh Nguyen `danh@rmit.local`, Admin Account `admin@rmit.local` | OWNER | Full control; snapshots; wipe |
| Admin | Emily Carter, Joanne Walsh, Sarah Mitchell | ADMIN | Allocation, portal, members, settings |
| Member | Jun, Duc, Tuyet, Hil, Grace, Minh, Linh, Tom, Priya, Chloe, Ravi, Thao | MEMBER | Everyday work, team boards, viewer-only boards |
| Guest | Jane Morrison, Ben Walker | GUEST | Explicit board seats only |
| Pending | Anh Pham, Lucas Reid, Mai Tran (tokens `demo-invite-<key>-2026` locally) | INVITED | Onboarding; sign-in refused |
| Deactivated | Any member, deactivated during the test | DEACTIVATED | Loss of access |
| Stakeholder | Anonymous; booking key `bookrmitcreative2026demo`; a portal link created in the test | none | Public booking, portal |
| Share reader | Anonymous, or a signed-in member with a board, task or dashboard link | none | Share gates and payloads |
| Runner | The environment's `AUTOMATION_SECRET` | — | Automation ticks |

Where the actor is excluded from the effect you need two people: notify actions, mention and reply notifications, realtime.

## 3. Scales

**Severity**

| Level | Meaning |
| --- | --- |
| P0 | Data loss or a breach of access |
| P1 | A core workflow broken, or a security exposure |
| P2 | Wrong behaviour, or a significant usability failure |
| P3 | Minor |

**Status**

| Status | Meaning |
| --- | --- |
| PASS | Ran and behaved as expected |
| FAIL | Ran and did not |
| BLOCKED | Could not run; the reason is recorded |
| NOT RUN | Not attempted |
| STATIC | Verified by reading the code path end to end, without running it |

## 4. Test inventory

Each row gives an ID, the flow or case, what must be true, and the method.

- **Methods:** U = unit, L = local browser, S = disposable Supabase, M = manual/exploratory, Q = SQL/HTTP probe.
- **Coverage:** existing automated coverage is named where it exists; everything else is new.

### 4.1 Sign-in, session and onboarding (AUTH)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| AUTH-01 | Local sign-in from the account tiles; reload; sign out | Session is in `streamline.local-session`. Reload keeps it. Sign-out returns every open tab to `/login` | L (`auth-and-navigation`) |
| AUTH-02 | Supabase password sign-in; wrong password; unknown email | Normalised messages (`auth-messages.ts`); no difference that reveals which emails exist | S |
| AUTH-03 | A pending member signs in | Refused with the onboarding message, locally and on Supabase | L, S |
| AUTH-04 | A deactivated member signs in; an already-open session of theirs | Sign-in refused; RLS (0014/0015) removes board access from the open session | S (F-001 regression) |
| AUTH-05 | Open the app while signed in | Loading screen, then the workspace; never the sign-in frame (v0.45.2) | L |
| AUTH-06 | `/login?next=` with an absolute or protocol-relative URL | Only same-site paths are followed | L, Q |
| AUTH-07 | Join link: preview → password (under 8 characters refused) → profile → photo | Membership becomes ACTIVE and the link single-use. EXPIRED after 30 days; REVOKED after cancel; the old link is dead after a renew | L (`onboarding`), S |
| AUTH-08 | `/api/invitations*` as anonymous / member / admin; self-reinitiate | 401 / 403 / 200; self refused | S, Q |
| AUTH-09 | Session expires mid-task | Calls say the session expired; nothing is lost silently | S |
| AUTH-10 | Two tabs; sign out in one | The other tab follows (storage event) | L |

### 4.2 Shell, navigation and search (NAV)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| NAV-01 | Sidebar: Favourites selection; team tree expands once after hydration; Admin panel tinted from the team; drag width 240–480; click toggles collapse; double-click resets | Width persisted in `streamline.ui`; a board opened from Favourites is selected only there | L |
| NAV-02 | Home: recent boards, my work, favourites, teams, activity; an empty workspace | Every block has an empty state | L |
| NAV-03 | Palette (Ctrl/⌘ K or F) | Matches `search-service.test.ts` and the UI (checks below) | U, L |
| NAV-04 | Deep links: `?view=`, `?item=`, archive `?item=`, settings `?section=&guide=`, messages `?to=`; unknown values | Fall back without errors | L (`views-and-routing`) |
| NAV-05 | Tab title | `(<n>) Streamline · <workspace>`; loud count only, capped at `99+` | L |
| NAV-06 | Undo bar | One standing offer, for rename / add / move / archive / duplicate only. Cell edits and deletes offer none. A path change clears it | U (`components/undo`), L |
| NAV-07 | Hover a face or a single-person cell | Compact profile card with a pending/deactivated badge; keyboard focus opens it too | U (`components/person-card`), L |

NAV-03 palette checks:

- Kinds: All / Items / Boards / Teams / People.
- Ranking: exact 0, ticket 0, prefix 1, word-prefix 2, contains 3, board description 4; person by email or title +3; archived +0.5. Every typed word is required.
- Vietnamese diacritics and đ fold.
- Ticket forms `CP_014`, `cp14`, `cp-14`, `014` all find the task.
- A one- or two-character query that is a substring of every ticket must not flood out name matches.
- Archived tasks are marked and open in the archive. People open `/people/<id>`. Pending requesters are shown as "Pending onboarding".
- "Search in" a board narrows items only.

### 4.3 Boards (BRD)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| BRD-01 | Create board (Blank): name 1–80; visibility Workspace/Team/Private (Team needs a team); slug uniqueness | Item column plus Status, PIC, Requester, Due date, Timeline, Priority, Department, Size, Assets recap, Brief; the creator is OWNER | L, S |
| BRD-02 | Create from a saved template with each combination of parts (groups, column settings, layout, automations, tasks, look) | Parts honoured; automations require groups + column settings; rule ids remapped; tasks created without values or tickets; special columns ensured; template tasks do not wake the template's own creation rules | U (`board-templates`), L |
| BRD-03 | Save as template from the board menu and from Create board: same name; delete by the creator, by an admin, by someone else | Same name (case-insensitive) saves over. Delete: creator or admin only (RLS 0019). The picker lists only boards the saver can open. "Save over it" is not offered when RLS would refuse | L, S |
| BRD-04 | Rename (slug and URL change), colour & icon, description, move to team, visibility | System boards refuse team/visibility changes with the built-in message; the settings dialog disables those controls; a TEAM board moved to "No team" stays reachable | L |
| BRD-05 | Duplicate | Groups, columns, live items and values are copied; rules, assets, roles, `hiddenInPanel` and tickets are not; recap cells are not stale; no Booking time column outside Task Allocation | U (`board-service`), L |
| BRD-06 | Archive (undo toast) / restore; delete (type the name) | System boards cannot be archived or deleted | L (`boards-lifecycle`) |
| BRD-07 | Board members: add OWNER/EDITOR/VIEWER, change, remove | An explicit VIEWER beats inherited editing | L (`permissions`), S |
| BRD-08 | Board menu order and gating | View archived items sits with Open; Archive/Delete last; managers only | L |
| BRD-09 | Board activity; mute/resume notifications | Activity is newest first; muting stops inbox rows only | L |
| BRD-10 | Task Allocation | Admins only; columns per `taskAllocationColumns`; top-up restores only special types | L, S |

### 4.4 Groups, items and tickets (ITEM)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| ITEM-01 | Add (Enter), rename inline, delete, duplicate, archive/restore | Rename field spans the cell; dragging across it selects text; done tasks muted, not struck through | L (`groups-and-items`) |
| ITEM-02 | Subitems: add, expand, parent progress, move with the parent | They use the board's columns | L |
| ITEM-03 | Groups: add, rename, colour, reorder, delete with items, collapse | A folded group is one summary row. An editor's fold is shared; a reader's is local | L |
| ITEM-04 | Drag and drop within and across groups; a sorted view | Stored positions persist; sorting does not reorder storage | L (`filters-sort-and-dnd`) |
| ITEM-05 | Bulk: select, move, duplicate, archive, delete, allocate | The bar counts; a single failure is reported, not hidden | L |
| ITEM-06 | Tickets | Format `PREFIX_NNN`; the counter never goes back except by an admin's wipe/restore; unique except across a ticket-carrying link (checks below) | U (`ticket.test.ts`), L (`ticket.spec`), S |
| ITEM-07 | Item name cell | Whole cell at rest; fades rather than "…"; tooltip; badges never clipped | L |
| ITEM-08 | Item column width | Drag 320–800; double-click resets; per browser and board | L |

ITEM-06 ticket cases:

- A new task gets "Add a ticket", and it works a second time in the same panel session.
- Booking tickets.
- Typing a ticket: `cp-14` works; `cp14` is refused; a code already held is refused.
- Prefix change with rewrite or keep. A number above 999 (CP_1234) must survive a Supabase rewrite. A foreign prefix (QA_014) collides.
- Parallel bookings.
- Linked tasks share a ticket; unlinking should renumber one side.
- `tickets:dedupe` works per workspace.
- A wipe with "start again".

### 4.5 Columns (COL)

Each type goes through create → edit → clear → sort → filter → board share → portal → dashboard → link sync → automation set.

| ID | Type | Cases that matter | Method |
| --- | --- | --- | --- |
| COL-01 | Text / Long text | Enter/blur/Esc; live links in long text | L (`column-types`) |
| COL-02 | Rich text | H1/H2, bold/italic/underline, lists, links (`safeHref`), `---`, 3 indent levels, escaping of typed markup, Copy, Download as Word (`"{item} - {column}.docx"`, forbidden characters replaced) | U (`rich-text*`), L |
| COL-03 | Status | Labels; roles done/stuck/progress survive renames; default label; progress tint from deliverables | U, L |
| COL-04 | Dropdown | Labels with no meaning; Kanban lanes and chart dimensions | U, L |
| COL-05 | PIC (PERSON) | Several people; ASSIGNED notification; My Work; workload | L |
| COL-06 | Requester | One person, filled by bookings; pending people shown with a hover card; a removed pending requester cannot be re-picked (recorded) | U (`booking-requester`), L |
| COL-07 | People | Never feeds workload, My Work or the person filter | U |
| COL-08 | Due date / Timeline | Overdue only when not done; calendar/timeline/gantt placement | L |
| COL-09 | Number | Unit display; zero is a value; no decimals UI (recorded) | U |
| COL-10 | Date, Time, Date + Time | Four date formats, 24h/12h; viewer's time zone; default 09:00 | U (`date-time-columns`), L |
| COL-11 | Countdown | Input and format checks below | U (`countdown-column`), L |
| COL-12 | Priority | Four fixed steps on every board | U |
| COL-13 | Checkbox, Size, Tags | Tag rename remaps values; size order XS→XL | U, L |
| COL-14 | Link | Only http(s)/mailto open; `javascript:` and `data:` do not | L |
| COL-15 | Department (STAKEHOLDER) | Only listed ACTIVE departments; trigger 0074 on Supabase; removal moves or clears | U, S |
| COL-16 | Assets recap | Read-only; live lines beat the cache; click opens Assets | L |
| COL-17 | Brief | Compact under 160 px; filled from `items.booking_brief` when added; removed/restored | U (`special-columns`), L |
| COL-18 | Booking time | Task Allocation only; never editable; the guard also holds through duplicate and templates | U |
| COL-19 | Dependency | Same board, top-level; blocked badge; never synced | L |
| COL-20 | Special columns | Picker "Already added" (click moves it) and "Removed from this board" (click restores values); special delete only removes from view; plain delete confirms (also in Board settings → Columns) and deletes | U, L |
| COL-21 | Column roles ("Used as") | One holder per role per board; "Nothing in particular" on an implied role | U (`column-roles`), L |
| COL-22 | Hide on board / in panel; restore | Viewers are not offered restore | L (`column-layout`) |
| COL-23 | Rename (linked boards follow), reorder, width 80–600 | — | L |

COL-11 Countdown checks:

- Accepts `45m`, `3d 4h`, `2mo`, commas and "and".
- Refuses anything under a minute and stray words.
- The placeholder's "in 45m" is accepted.
- Quick picks.
- Format: style, units, ending, amber.
- Months are calendar months.

### 4.6 Views, filters and the archive (VIEW, FLT, ARC)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| VIEW-01 | Main Table with over 25 rows per group | Virtualised; dragging renders the whole group | L (`large-board`) |
| VIEW-02 | Kanban lanes by Status/Priority/PIC/Group/Dropdown; drag between lanes; density; lane counts | A task owned only by a pending or deactivated person still has a lane | L |
| VIEW-03 | Timeline, Calendar, Gantt | Role-based due date and timeline; undated work handled; today marker | L (`board-views`) |
| VIEW-04 | Workload, Chart | PIC only; chart dimensions include dropdowns; measures are items, number sums, asset units | U (`view-aggregates`), L |
| VIEW-05 | View memory | URL > `streamline.board-view` > board visit; per-view settings synced after 600 ms | L |
| FLT-01 | Person, tags, status, priority, group, date buckets; search on name and ticket | Filters AND together; "this week" includes today; the board search folds accents like the palette | U (`board-filtering`), L |
| FLT-02 | Sort every type ascending and descending | Empty cells last in both directions, from the toolbar and the header | U, L |
| FLT-03 | Remove the Status column while a status filter is on | The filter is dropped; tasks are not all hidden | L |
| ARC-01 | Archive route: pages 10/25/50, filters over the whole archive, search, restore, permanent delete, `?item=` outside the page | Exact counts; restore returns to the original group and position; ticket search works as on the board | U (`board-archive`), L |

### 4.7 The task panel (PANEL)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| PANEL-01 | Open by click, by `?item=`, close, Esc | Answered on the click, revealed once; an archived task redirects to the archive | L |
| PANEL-02 | Pop-up mode | Menu says where the task is shown; the pop-up body lays fields out for its width; below 1024 px it becomes the full-screen panel | L |
| PANEL-03 | Name first; icon row (journey, share, menu, close); widths 300/520/880 (drag, snap, keys); two panes in the wide view; columns as draggable rows with menus | Hidden-in-panel restore offered to editors only | L |
| PANEL-04 | Journey | Booking → allocation → moves → statuses → deliverables (runs merged, counted against the booking's lines) → archive; time in each status as one labelled bar; long histories not truncated | U (`task-journey`), L |
| PANEL-05 | Cover image | ≤3 MiB; WebP ≤1600 px | L (`item-cover`) |
| PANEL-06 | Archive from the panel menu on a linked task | Same link question as the row dialog | L |

### 4.8 Updates, replies and reactions (UPD)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| UPD-01 | Post: the resting line opens the editor; Ctrl/⌘+Enter; @mention an active user; "Post to linked task" | MENTION notification; linked copies share the update | L (`updates-composer`) |
| UPD-02 | Reply; reply to a reply; latest 3 plus "Show N earlier" | Filed under the root. The root author is told, unless they are the replier or were mentioned. Replies stay on this task | U, L |
| UPD-03 | Collapse one, collapse all, click the header | Collapsed card: author + time, tally, reply count, two lines of text | L |
| UPD-04 | Delete: bin → "Delete?" → click; Esc/blur/4 s stands it down | Replies and shared copies go too | L |
| UPD-05 | Edit | Author only; "(edited)"; no new notifications | L |
| UPD-06 | Reactions: 16 emoji, toggle, tooltip names, realtime to a second session | One per person per emoji | U (`comment-reactions`), S |
| UPD-07 | Updates badge vs Inbox | Separate read models | L (`updates-badge`) |
| UPD-08 | RLS: a viewer posts; an author moves a comment to another item; a reply points at another item's update | All refused | S, Q |
| UPD-09 | Touch: edit, delete and reply-reaction controls without hover | Reachable on a phone | L |

### 4.9 Deliverables and links (AST, LNK)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| AST-01 | Add, edit, reorder, complete, reopen, delete lines (qty 1–9999, several people, due date, notes, preview and final links) | Activity for each change; recap recalculated | U (`item-assets`), L |
| AST-02 | Linked tasks share lines | Board rows, panel and chart agree; realtime from the far board | L |
| LNK-01 | Link; refused cases: self, same board, other workspace, duplicate, a chain holding two items from one board, Task Allocation | Clear refusal messages | U (`item-links`) |
| LNK-02 | Sync: labels by name, first person for single-person targets, text conversions, special types by type, hand-made pairs, exclusions | Editor of A viewing B: A's change saved and reported as saved | U (`item-link-sync`, `label-sync`) |
| LNK-03 | Unlink a pair sharing a ticket | One side is re-ticketed | U |

### 4.10 Booking (BOOK)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| BOOK-01 | Ways in and refusals (list below) | Wizard / wizard / wizard / redirect; then 403 / 401 / 404 | L (`booking`), S, Q |
| BOOK-02 | Step 1 requirements; department list only (and none configured); a past due date through the API | Refusals name the field; the server refuses a past date | U (`booking-wizard`), Q |
| BOOK-03 | Identity: account card, "Booking for someone else?", typing over the account, remembered browser identity | — | U, L |
| BOOK-04 | Email check (350 ms debounce, spinner, "Used before…", name filled only if untouched) | — | U |
| BOOK-05 | Step 2: only the chosen service's questions; follow-ups one level deep, numbered 4a; chips vs dropdown | Only visible blocks are validated | U |
| BOOK-06 | Step 3: rows, quantity clamp, type chips, skip, reference link; a 51st line | Refused over 50 | U, L |
| BOOK-07 | Step 4 and receipt: Change buttons; ticket; Book another; Open on board | — | L |
| BOOK-08 | Browser memory: restoring a draft, history, Start blank | Restored rows keep their asset type | U |
| BOOK-09 | Requester: signed-in self; public known email; public new email; directory failure | Self is not renamed. A public booking must not rename an active member. A new email becomes a pending member with a join link. A failure never refuses the booking | U (`booking-requester`), S |
| BOOK-10 | Destination: the service team's receiving board, else Task Allocation (first group); TASK_BOOKED to admins; the counter | — | U (`booking`) |
| BOOK-11 | Brief goes in the Brief column only; the description stays empty unless something found no column | — | U |
| BOOK-12 | Portal booking page: scale 80–150, visitor size, theme, headline/lead/sign-in; dropdowns at scale | — | L |
| BOOK-13 | Refusals over HTTP: department not listed, removed service, missing answer | 4xx with the reason, not a generic 500 | S, Q |
| BOOK-14 | Idempotency: portal submission key replays or 409s; public `/api/book` retry | The portal replays. A public retry creates a duplicate (recorded) | U (`portal-booking`), S |
| BOOK-15 | Requester lookup endpoints | Exact email only (no `%`/`_` patterns); behind the same gate as booking | S, Q |

BOOK-01 ways in, in order: `/book/<slug>/<key>`; `/book/<slug>` signed in; `/portal/<t>/book`; `/workspace/<slug>/book` as a non-admin. Refusals: a wrong key; no key and no session; an unknown slug.

### 4.11 Allocation and the form editor (ALLOC, FORM)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| ALLOC-01 | Allocate from the panel, the row menu (team → boards), in bulk | "Moving…" sweep until gone; toasts; bulk moves keep distinct positions; target boards need edit rights | L |
| ALLOC-02 | What travels | Id, ticket, assets, subitems; special columns by type; labels by name; brief as a value (in the description only if there is no Brief column) | U (`booking`) |
| ALLOC-03 | The target has no such department listed | No half-moved task | S |
| FORM-01 | Draft vs publish; default publish name; counter reset; built-in form stored as null | The editor never writes the live form | U |
| FORM-02 | Templates: save, load, update loaded, load published, reset; saved blocks insert with fresh ids | — | U, L |
| FORM-03 | Services: add/remove, team routing, sub-services; preview sends nothing | — | L |

### 4.12 The portal (PORT)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| PORT-01 | Admin card: open/close; password add/change/remove; New link; settings dialogs (draft → Save/Discard, confirm on close) | The old link says "replaced"; per-link settings persist | L (`stakeholder-portal`) |
| PORT-02 | Gate: unknown/off/revoked/password; stale credential version | 404 / 404 / 404 / 401 | U, S |
| PORT-03 | Board (details below) | `?task` outside the range opens the task | U (`portal-*`), L |
| PORT-04 | Theme: the link beats the app; a visitor's choice lapses when the team changes the setting; the app theme returns on leaving | — | L |
| PORT-05 | Book from the portal for a department with work, and for one with none (e.g. after a wipe) | **Both book** | U, L |
| PORT-06 | Projection | Allowlisted fields only; description null; updates published without mention metadata | U (`portal-scope`, `portal-board`) |
| PORT-07 | Polling | Every 4 s, visible only | L |

PORT-03 board details:

- Department picker: departments with work, plus All.
- Default range comes from the link; search widens it.
- Group by board / status / department; status order.
- All 7 views; `?task`.

### 4.13 Sharing and the dashboard (SHR, DASH)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| SHR-01 | Board link: PUBLIC/PRIVATE, password, expiry (inclusive), disable, regenerate, remove | No removed columns in the payload; users sanitised | U (`board-share`), L, S |
| SHR-02 | Task link | An archived task is unavailable; subitems included; no links | U (`item-share`) |
| SHR-03 | Dashboard link | Admin only. Trimmed payload: descriptions, notes, links and most text removed. Named workload present | U (`dashboard-share`) |
| DASH-01 | Figures in tasks / asset units / effort; periods; comparisons; thin data; no % from a base under 5; whole-number scales | An independent recount of a small fixture matches | U (`dashboard-*`), L |
| DASH-02 | Panels hidden from settings; team filter; basis; department narrowing; names open profiles and teams | — | L |
| DASH-03 | Motion after load; reduced motion | — | U (`dashboard-motion`) |
| DASH-04 | Freshness: every 60 s, visible only, in the app; the public link | The public link should not poll 4.5 MB in a background tab | L |

### 4.14 Automations (AUTO)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| AUTO-01 | Workspace page: runner strip (live/stale/never), tabs, 10 recipes for managers, search, board filter, toggle, remove | Remove asks first | L |
| AUTO-02 | Board dialog: Rules / Quick runs / Activity; runner pill; stale banner | — | L |
| AUTO-03 | Builder: every trigger, condition and action; placeholders `{item} {board} {group} {ticket} {actor} {today} {column:Name}`; validation messages; loop guards | — | U (`automations*`) |
| AUTO-04 | `/api/automations/run`: no secret configured / wrong secret / right secret / member session | 503 / 401 / full tick / drain only (≤50; no schedules; no heartbeat) | U (`automation-runner`), S, Q |
| AUTO-05 | Event triggers fired by the real SQL triggers | Each kind reaches the queue and fires once | S |
| AUTO-06 | `column_cleared` on Status, Date, Number… on Supabase | Fires, even though payloads pass through `jsonb_strip_nulls` | S |
| AUTO-07 | Schedules: `date_arrives` offsets, `column_unchanged_for`, **`recurring`** daily/weekly/monthly; DST | Each fires once in its hour and leaves a receipt | U, S |
| AUTO-08 | Quick runs: ≤50 tasks; a viewer; a switched-off run | A viewer is not offered Run; a switched-off run gives a clear refusal | U (`quick-runs`), S |
| AUTO-09 | Notify audiences; the actor excluded; preferences | "Nobody to tell" when only the actor qualifies | U |
| AUTO-10 | Webhooks: https only; private hosts; 8 s; redirects | Refused, or fails cleanly | U |
| AUTO-11 | Running indicator: ring ≥1.5 s; sidebar orbit; phone surfaces; claimed events that never finish | The ring clears | U (`automation-activity`), S |
| AUTO-12 | Edge cases (list below) | No firing on archived boards; a long rule name can be edited and saved; `is` compares real values; template tasks do not wake creation rules | U, S |

AUTO-12 edge cases: a rule on an archived board; editing a long auto-generated name; `is` on a Date/Time/Countdown/Requester column; template rules vs template tasks.

### 4.15 Inbox, messages, My Work, people, members, teams (NOTIF, MYW, PPL, MEM)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| NOTIF-01 | Inbox tabs, unread only, mark all read, clear with confirm | Clear deletes only the tab's rows | L (`notifications`) |
| NOTIF-02 | Preferences Notify/Update/Off per event; board mute; browser notifications and the test | Preference copy matches what emits each type | L |
| NOTIF-03 | Producers: mention, assigned, reply, board invite, booked, status/due changed, linked, automation notify | Right delivery class; the realtime bell within ~1 s (S) | U, S |
| NOTIF-04 | Messages: thread, `?to=`, read state, active people only | — | L (`account`) |
| MYW-01 | Sections Overdue/Today/This week/Later/No date/Completed; linked copies collapse; filters | — | U (`my-work-filters`), L |
| PPL-01 | Profile page: figures, splits, tabs, message, own details, avatar ≤10 MiB | — | L (`account`) |
| PPL-02 | Team page | — | L |
| MEM-01 | Add member → pending → copy/renew/cancel; roles; deactivate/reactivate; View as | View as writes as the real user | L (`teams-and-members`, `onboarding`) |
| MEM-02 | Remove or demote the last owner | Refused (0043) | S |
| MEM-03 | Teams: create/edit/archive/restore; receiving board; who may create | — | L |

### 4.16 Settings, snapshots, trackers, version (SET, SNAP, TRK, VER)

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| SET-01 | Sections and aliases (`lists` and `rates` → Asset types; unknown → Overview) | — | L |
| SET-02 | Overview tiles and their links; workspace name | — | L |
| SET-03 | Tickets prefix (valid/invalid; rewrite vs keep) | — | U, L |
| SET-04 | Departments: add/rename/colour/remove (move or clear), 60 entries, 40 characters | Durable ids through renames | U (`department-reconciliation`, `list-draft`) |
| SET-05 | Asset types and output rates | Rated count | L |
| SET-06 | Appearance: light/dim/dark/system; team counts | — | L |
| SET-07 | Guide: search, chapters, copy link, download | Chapters describe the current app | U (new `guide-content` test), L |
| SET-08 | About: facts; What's new | — | L |
| SET-09 | Roles table | Rows match what each role can do today | L |
| SNAP-01 | Take / list / download / delete | Gzipped JSON; kinds badged | S |
| SNAP-02 | Upload (≤4 MiB, gz or json, damaged, newer version) | Clear refusals | U (`snapshot-file`), S |
| SNAP-03 | Restore: type RESTORE; blocking screen; safety snapshot; lock | Every table back; skipped tables reported; pending automation work not replayed | S |
| SNAP-04 | Wipe: password; safety snapshot; restart tickets; counts | Task Allocation keeps its structure; trackers go; team receiving boards and portal requests go (recorded) | S |
| SNAP-05 | Access: member / anonymous / admin; local provider | 403 / 401 / 200; hidden in local mode | S, L |
| SNAP-06 | `npm run db:snapshot:rehearse` | Fingerprints match | S |
| TRK-01 | Create/import; sheets; column types; sections; summaries; frozen columns | — | U (`trackers`), L (`trackers`) |
| TRK-02 | Autosave 600 ms; flush on leave; undo/redo | — | U (`tracker-flush`) |
| TRK-03 | `.xlsx` round trip; CSV | — | U (`tracker-export`) |
| VER-01 | New build detected; the card; What's new since the running version; Later; Refresh; a rollback | A rollback is not announced as "ready" | U (`changelog`, `version`), L (`version-check`) |

### 4.17 The phone (MOB)

Audit the phone route by route: 360, 390 and 414 px, portrait and landscape, light and dark. Two passes:

- the automated sweep in `MOBILE_AUDIT.md`, which reports horizontal overflow, elements past the edge, and tap targets under 40 px;
- a manual pass of every flow above that a person can do on a phone.

| ID | Flow / case | Expected | Method |
| --- | --- | --- | --- |
| MOB-01 | Shell: top bar, five tabs, badges, safe areas, dynamic viewport height | No content hidden under the bars | L (`mobile-layout`) |
| MOB-02 | Every route at phone width | No horizontal scroll; targets ≥44 px; dialogs as sheets | L (sweep) |
| MOB-03 | Board: cards/grid; status/priority/date sheets ("Today" is the local date); FAB; select + bulk bar; Kanban one lane + Move to; the other views | — | L |
| MOB-04 | Task full screen: tabs; updates with the on-screen keyboard; reactions; replies; edit/delete without hover; assets; journey | Nothing reachable only by hover | L |
| MOB-05 | Dashboard, inbox, messages, profile, members, settings, automations, trackers, portal and booking on a phone | Complete, not merely visible | L |
| MOB-06 | Landscape, long names, 320 px, large boards | — | L |

### 4.18 Cross-cutting: permissions, security, data, sync, performance, resilience, operations

**Permission matrix (PERM).** Test every combination of:

- **Persona:** each one in §2.
- **Board relation:** owner, explicit editor, explicit viewer, team member of a TEAM board, none.
- **Visibility:** WORKSPACE, TEAM, PRIVATE, system.

For each combination check these actions: view board, edit a task, manage the board, delete it, comment, react, manage automations, run a quick run, create boards/teams, edit trackers, save/delete templates, snapshots and wipe, invitations, portal admin, dashboard share, allocate.

Check each action three ways:

1. The UI offers it.
2. The service or route accepts it.
3. RLS accepts it. Test on S with that persona's JWT through PostgREST.

| ID | Area | Case | Method |
| --- | --- | --- | --- |
| SEC-01 | Credentials | Booking key 24, share 22, portal 32 characters; none logged or placed in URLs where it does not belong | STATIC |
| SEC-02 | Passwords | Share: salted SHA-256. Portal: PBKDF2-SHA256 210k. Attempt limits | STATIC |
| SEC-03 | Service-role routes | Each of the 29 route files refuses the wrong caller | S, Q |
| SEC-04 | RLS | Guest, member and other-workspace JWTs against boards, items, values, comments (including updating `item_id`), reactions, templates, automation tables, `workspace_snapshots`, `schema_migrations` | S, Q |
| SEC-05 | Enumeration | Requester lookup, slug existence, portal gate replies | S, Q |
| SEC-06 | Injection | Rich text escaping; Link `href` schemes; mention text; Word export | U, L |
| SEC-07 | SSRF | Webhook host checks; names that resolve to private addresses are not caught | STATIC |
| SEC-08 | Public booking abuse | Pending-member creation; renaming existing members | STATIC, S |
| SEC-09 | Snapshot files | Contain live share/portal/invitation tokens and the booking key | STATIC |
| DATA-01 | Invariants (SQL on S after every flow) | One special column per type per board; values on their own board; departments listed; ticket format; an owner per workspace; recap equals lines | Q |
| DATA-02 | Migrations | An empty database builds from the repo; a rerun is a no-op; drift is reported | S |
| SYNC-01 | Local cross-tab | BroadcastChannel refreshes the other tab | L (`cross-view-sync`) |
| SYNC-02 | Supabase realtime | Two sessions: edits, comments, reactions, notifications, the automation ring; a reconnect re-reads | S |
| PERF-01 | Boards | 300+ tasks open and scroll smoothly | L (`large-board`) |
| PERF-02 | Egress | Dashboard snapshot ~4.5 MB; the polling rate of each surface | STATIC |
| RES-01 | Offline / errors | Failed writes are restored and toasted; the unsaved-work guard fires on leave | L |
| OPS-01 | Build | `next build` with `SKIP_DB_MIGRATE=1` and the local provider | L |
| OPS-02 | Scripts | On S: `db:migrate` (fresh, rerun, `--dry`), `db:seed`, `db:special-columns`, `db:snapshot:rehearse`, `tickets:dedupe` | S |

## 5. Order of execution

1. **Baseline.** Run `npm run check` (lint, typecheck, unit). Record the failures and whether each reproduces when run alone.
2. **E3 from empty.** Migrate, seed, then add special columns. Record every failure; the first attempt found two defects.
3. **Local Playwright suite** in full on `:3100` with one worker. Then run the phone sweep on `:3200`.
4. **E3 suites.** Run `supabase-smoke.spec.ts` against `:3300`, the SQL/HTTP probes of §4.18, and the automation, snapshot and wipe scenarios.
5. **Exploratory pass.** Work through every section with the personas, desktop first, then phone.
6. **Fix, then re-run.** Re-run the failing case and its neighbours. Every fix gets a regression test.

## 6. Exit criteria

- No open P0/P1. Every P2 is fixed or explicitly accepted by the product owner.
- These are green:
  - `npm run check`;
  - the local Playwright suite, with known-stale specs updated rather than skipped;
  - the E3 suite.
- Every row above has a status in `COVERAGE.md`. Nothing counts as PASS on the strength of a test's name.
- Documentation (knowledge base, README, in-app guide) describes the build that ships.
