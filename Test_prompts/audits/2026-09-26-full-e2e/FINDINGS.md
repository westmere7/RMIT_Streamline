# Findings — end-to-end audit, 26 September 2026

Revision `0649d71`, package `0.49.0`. IDs continue from the 9 September audit (F-001…F-006 there).

## How to read this

**Evidence** says how each finding was established:

| Evidence | Meaning |
| --- | --- |
| **REPRO** | Reproduced by running something. The environment is named. |
| **DB** | Proven against the disposable Supabase database, E3. |
| **STATIC** | The code path was read end to end, file and line given, and nothing contradicts the reading. It has not been executed. |

**Status** says where the fix stands:

| Status | Meaning |
| --- | --- |
| OPEN | Not fixed. |
| FIXED+VERIFIED | Fixed in the working tree and checked by running it. |
| PROPOSED | A fix is written in this deliverables folder but not applied or run. |
| DOC | Only the documentation changes. |
| ACCEPTED? | Looks deliberate. Needs the product owner's word. |

Severity uses the plan's scale: P0 is data loss or broken access, P1 a core workflow broken or a security exposure, P2 wrong behaviour or significant usability, P3 minor.

## Summary

| ID | Title | Sev | Evidence | Status |
| --- | --- | --- | --- | --- |
| F-101 | Portal booking fails for any department that has no work yet, which is every department after a wipe | **P1** | STATIC | PROPOSED |
| F-102 | A public booker can rename any existing member, and can add any other account to the workspace as pending | **P1** | STATIC | PROPOSED |
| F-103 | Requester lookup matches email *patterns*: `%` and `_` pass the validation, so names can be enumerated | P2 | STATIC | PROPOSED |
| F-104 | A comment's author can move the comment onto any item, even in another workspace | P2 | STATIC | PROPOSED (SQL) |
| F-105 | Recurring automations fail every hour they are due: the receipt's `item_id` is a primary-key column | P2 | **DB** | PROPOSED (SQL) |
| F-106 | `column_cleared` never fires on Supabase for 12 column types (payload goes through `jsonb_strip_nulls`) | P2 | STATIC | PROPOSED |
| F-107 | Changing the ticket prefix on Supabase truncates numbers above 999 (`lpad(…,3)`); live counter is at 923 | P2 | STATIC | PROPOSED (SQL) |
| F-108 | The repo's SQL cannot build an empty database: migrations need policy helpers | P2 | **DB** | FIXED+VERIFIED |
| F-109 | `npm run db:seed` crashes on the current schema (`UNDEFINED_VALUE`) | P2 | **DB** | FIXED+VERIFIED |
| F-110 | Kanban person lanes drop tasks whose only PIC is pending or deactivated | P2 | STATIC | PROPOSED |
| F-111 | Phone date sheet's Today, Tomorrow and Next week use the UTC date, so they are a day early on Melbourne and Vietnam mornings | P2 | STATIC | PROPOSED |
| F-112 | Palette search is flooded by tickets: typing "c", "p", "cp" or a digit ranks every ticketed task first | P2 | STATIC | PROPOSED |
| F-113 | Booking refusals reach stakeholders as a generic 500 ("Something went wrong on the server…") on Supabase | P2 | STATIC | OPEN |
| F-114 | Automation chains that create tasks are not bounded by the depth limit, so a duplicate-on-Done rule can loop | P2 | STATIC | OPEN (verify on E3) |
| F-115 | Claimed automation events that never finish stay claimed for good; failed events are never retried | P2 | STATIC | OPEN |
| F-116 | Undo "Added X" still offered after deliverables and updates were added, and undoing hard-deletes all of it | P2 | STATIC | OPEN |
| F-117 | Public bookings can create unlimited pending accounts (no rate limit or CAPTCHA) | P2 | STATIC | OPEN |
| F-118 | Snapshot restore: empties tables missing from an older file, replays pending automation work, hides skipped tables | P2 | STATIC | OPEN / DOC |
| F-119 | Public dashboard link polls the ~4.5 MB snapshot every 60 s even in a background tab | P2 | STATIC | OPEN (known) |
| F-120 | Edit, delete and reaction controls on updates are revealed on hover only, so they can't be reached on touch | P2 | STATIC | Mobile revamp |
| F-121 | The in-app guide, knowledge base and README describe a much older app | P2 | STATIC | DOC (prepared) |
| F-122 | Four unit tests pass alone but time out under load (default 5 s) | P3 | REPRO (E1) | OPEN |
| F-123…F-199 | Minor defects and stale text (tables below) | P3 | STATIC | mostly OPEN |

---

## P1

### F-101 — Portal booking fails for a department with no work yet

- **Where:**
  - `src/features/portal/portal-booking.tsx:111,178-179`
  - `src/features/portal/portal-page.tsx:210`
  - `src/services/stakeholder-portal-service.ts:632-663`

**What happens**

1. The wizard's Department question offers every ACTIVE department (`BookingForm.departments`).
2. On submit, the portal page turns the chosen name into an id with `stakeholders.find(name)`.
3. `stakeholders` is `context.stakeholders`. `context()` builds that list only from departments that have had a portal-visible request at some time (over the whole authorised set, not the date range): "a stakeholder with nothing to show is not a filter worth offering".
4. For any other department, submit throws "Pick which department this is for." before a request is sent.

**Consequence**

- A new department can never make its first portal booking. Neither can any department that has never had a request.
- After **Settings → Danger zone → Wipe all board data**, no department has any work, so **every portal booking fails** until someone books through another route.
- Production today: the wipe run on 25 September at 15:59:30Z was restored at 15:59:58Z, and 969 live tasks are back. So the departments with past requests can book. The next wipe, the one the Danger zone exists for when going live, breaks all of them.
- Public `/book/<slug>/<key>` and the signed-in `/book/<slug>` are not affected. They send the department's name, and the booking service checks it against the list.

**Fix (PROPOSED):** let the server resolve the department by name when the client has no id.

- The service's portal `book()` accepts `departmentId: string | null`. When it is null it looks up an ACTIVE department with that name. The id path is unchanged.
- The client sends the id when it has one, and null otherwise.
- The route schema accepts null.
- Regression test: "a department with no work yet can book from the portal".

See `FIX_LOG.md` FX-01.

### F-102 — A public booker can rename existing people

- **Where:**
  - `src/server/requesters.ts:29-53`
  - `src/services/booking-service.ts:317-333`

**What happens**

- `ensure()` looks the email up in `profiles`. If the person is a member here (any status) or is deactivated, it **renames them to whatever name the booker typed** (`rename()`).
- If the account exists but isn't a member here, it is invited into this workspace as a pending MEMBER, and then renamed too.
- The booking link is shared with every stakeholder and needs no sign-in.
- Profiles are global, so the new name shows in every workspace the person belongs to, and it changes how `@Name` mentions resolve.
- The header comment and `tests/unit/booking-requester.test.ts` treat renaming as intended. v0.48.0's changelog says "the name you book with is saved".

**Consequence:** anyone holding the public booking or portal link can rename the workspace owner or any colleague, or pull an unrelated account holder into the workspace as a pending member.

**Fix (FX-02):** an anonymous form never rewrites an existing identity.

- Nobody already in the member list is renamed: joined, pending or deactivated.
- An account that belongs to someone else's workspace is invited without being renamed.
- Only someone new takes the typed name, as a new pending member.

**Product owner, 26 September 2026:** "don't allow renaming if that user email and their name are already in member list. Only allow editing name for new ones." An earlier draft of the fix still let a pending member's name follow what was typed; the owner's rule removed that too.

---

## P2

### F-103 — Requester lookup takes email patterns

- **Where:** `src/server/requesters.ts:20` uses `.ilike("email", email)`. The only validation is `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`, which allows `%`, `_` and `*`.
- **How it can be used:** `POST /api/book/<slug>/requester {key, email:"a%@rmit.edu.vn"}` returns the display name of some member whose email starts with "a". The same works through `/api/portal/<token>/requester`.
  - The endpoints include INVITED and deactivated people.
  - There is no rate limit.
  - `_` also makes `j_smith@…` match `j.smith@…` when *booking*, which attributes the task to (and, per F-102, renames) the wrong person.
- **Fix (PROPOSED, FX-02):** match `profiles.email` exactly (`.eq`) against the trimmed, lowercased address. Auth stores emails lowercased; the seed and onboarding do too.

### F-104 — Comment authors can re-point their comments

- **Where:** `supabase/policies/0001_rls_policies.sql:698-701`

  ```sql
  create policy comments_update_author on public.comments
    for update to authenticated
    using (author_id = (select auth.uid()))
    with check (author_id = (select auth.uid()));
  ```

  No trigger freezes `item_id` or `parent_id`. Only `comments_set_updated_at` and the automation capture exist.

- **Consequence:** with the anon key and their own session, an author can PATCH `item_id` to any item id, on a private board or in another workspace. The comment then shows up in that task's Updates, attributed to them, and fires nothing. `parent_id` can likewise be pointed at another item's update. This makes a thread whose count shows in badges but which no one can see (F-164).
- **Fix (PROPOSED SQL `proposed-migrations/0079_comments_stay_put.sql`):**
  - Rewrite the policy's `with check` to `author_id = auth.uid() and private.can_edit_item(item_id)`.
  - Add a `before update` trigger that refuses changes to `item_id`, `author_id`, `shared_id` or `parent_id`.
  - Test on E3 before moving it into `supabase/migrations`.

### F-105 — Recurring automations can never keep a receipt

- **Where:** `supabase/migrations/0052_automations.sql:143-156`. `automation_schedule_fires` has `primary key (rule_id, fire_key, item_id)`, and `item_id` is declared nullable.
- **Why it fails:** Postgres forces every primary-key column NOT NULL. A recurring rule writes its receipt with `item_id = null`. The partial unique index `automation_schedule_fires_ruleless_idx` was written for exactly those rows, and can never receive one.
- **Proof on E3:**
  - `pg_attribute.attnotnull` for `item_id` is `true`.
  - `insert … (rule_id, item_id, fire_key) values (…, null, '2026-09-26T09')` fails with `null value in column "item_id" … violates not-null constraint` (23502).
- **Consequence:** every recurring rule, including the "Weekly review" recipe, fails every hour it is due and records `lastError`. The local provider has no such constraint, so the unit tests pass.
- **Fix (PROPOSED SQL `proposed-migrations/0080_recurring_receipts.sql`):**
  - Drop the primary key and let `item_id` be null.
  - Keep uniqueness with two partial unique indexes, one for `item_id is not null` and the existing one for null.
  - Check how the repository writes receipts first. If it names a conflict target, the target must match one of those indexes (see NEXT_SESSION §4).

### F-106 — `column_cleared` never fires on Supabase for most types

- **Where:**
  - the capture trigger, `supabase/migrations/0056_automation_keyword_triggers.sql:104`: `jsonb_strip_nulls(jsonb_build_object('before', v_before, 'after', new.value_json))`
  - the engine, `src/services/automation-engine.ts:238-242`
  - `isEmptyValue`, `src/domain/item/item.ts:139-181`
- **Mechanism:** `jsonb_strip_nulls` is recursive. A cleared Date is stored as `{"type":"DATE","date":null}` and reaches the engine as `{"type":"DATE"}`. `isEmptyValue` then tests `value.date === null`, which is `undefined === null`, so it answers "not empty".
- **Affected types (12):** STATUS, DROPDOWN, PRIORITY, DATE, TIMELINE, NUMBER, PLAIN_DATE, TIME, DATETIME, COUNTDOWN, STAKEHOLDER, SIZE.
- **Not affected:** TEXT, PERSON and TAGS, because an empty string or array is not null.
- **Why the tests missed it:** they run on the local provider, which does not strip nulls.
- **Fix (PROPOSED, FX-03):** the engine restores the value's full shape before reading it: `{ ...emptyValueFor(v.type), ...v }` (`emptyValueFor` is already imported). No migration is needed.

### F-107 — Ticket prefix rewrite truncates four-digit numbers on Supabase

- **Where:** `supabase/migrations/0051_rewrite_ticket_prefix.sql:51` pads with `lpad(n::text, 3, '0')`. Postgres `lpad` *truncates* a longer string to the length given, so CP_1234 becomes PROD_123 and collides with PROD_123. The local provider pads correctly (`formatTicket`).
- **Consequence:** the live workspace's counter was 923 on 26 September. Once tickets pass 999, any prefix change with "Rewrite" silently renumbers tasks into duplicates.
- **Fix (PROPOSED SQL `proposed-migrations/0081_rewrite_ticket_prefix_long_numbers.sql`):** `create or replace` the function to pad with `lpad(n, greatest(3, length(n)), '0')`.

### F-108 — The repo cannot build an empty database · FIXED+VERIFIED

- **Where:** `scripts/db-migrate.mjs` applied every `migrations/*.sql`, then every `policies/*.sql`. Thirteen migrations (0005, 0010, 0013, 0015, 0043, 0050–0052, 0055–0057, 0059, 0070) call `private.*` helpers that `policies/0001` and later policies define.
- **Proof (E3):** on an empty database the run stopped at `migrations/0005_direct_messages.sql` with `schema "private" does not exist`.
- **Consequence:** no new environment (staging, a second workspace, disaster recovery onto a fresh project) could be built from the repository. Production only worked because it grew file by file.
- **Fix, in the working tree:**
  - `supabase/sequence.txt` lists the 96 files in the order they were first applied, taken from `git log --diff-filter=A --no-renames`.
  - The runner applies pending files in that order. Unlisted files run after, in the old order, with a warning.
  - `tests/unit/sql-sequence.test.ts` fails if a SQL file is missing from the list, listed twice, or out of order within its directory.
- **Verified on E3:**
  - 96/96 applied on an empty database.
  - The second run printed "Up to date — 96 file(s) already applied."
  - `--dry` printed the same.
  - 44 public tables, matching production's table list exactly.
  - For production, whose ledger holds all 96 files, behaviour is unchanged.

### F-109 — `npm run db:seed` crashes · FIXED+VERIFIED

- **Where:** `scripts/db-seed.mts`
  - It inserted asset lines with `assignee_id: a.assigneeId`. The field was replaced by `assigneeIds` in migration 0017, so the value was `undefined` and postgres.js refused it (`UNDEFINED_VALUE`).
  - It also never wrote `assignee_ids`, `completed_at`, `preview_url` or `artwork_url` (assets), `hidden_in_panel`, `role` or `removed` (columns), `cover_url` (items), or `parent_id` (comments).
- **Consequence:** no disposable demo database could be seeded, and the README's first-run instructions failed.
- **Fix, in the working tree:** every field the app's own repositories write is mapped.
- **Verified on E3:** exit 0 — 22 profiles, 9 teams, 13 boards, 1,413 items, 6,820 values, 94 comments, 3 trackers, 86 notifications, 27 messages. `db:special-columns` afterwards reported "Every board already has every special column."

### F-110 — Kanban person lanes drop tasks owned by pending or deactivated people

- **Where:** `src/features/boards/components/views/kanban-lanes.ts:65,103-116` builds person lanes from active users only.
- **Consequence:** a task whose only PIC is a pending requester or a departed colleague is in no lane. It vanishes from Kanban while still on the board.
- **Fix (PROPOSED, FX-05):** also give a lane to any person who appears on the board's data. Mark pending and deactivated lanes as such, or fold them into "Someone else".

### F-111 — Phone date sheet quick picks are a day early in the morning

- **Where:** `src/features/boards/components/mobile/mobile-item-card.tsx:315-320` builds Today, Tomorrow and Next week with `new Date().toISOString().slice(0,10)`, the UTC date. The desktop picker uses local time.
- **Consequence:** in Melbourne (UTC+10/+11), "Today" means yesterday before 10–11 am. In Ho Chi Minh City (UTC+7) it does before 7 am.
- **Fix (PROPOSED, FX-06):** use the local-date helper the desktop picker uses.

### F-112 — Ticket matches flood the palette

- **Where:** `src/services/search-service.ts`. A ticket match scores 0, the same as an exact name. The raw ticket substring test means "c", "p", "cp", "_" or any digit matches **every** ticketed task.
- **Consequence:** the first keystroke of most searches fills all 12 item slots with arbitrary tasks. Every task has a ticket, so "Campaign" can't be found while it is being typed.
- **Fix (PROPOSED, FX-07):**
  - Count a ticket match only for a ticket-shaped query: it contains a digit and the whole query matches the normalised ticket from its start.
  - Rank it 0 only when the whole ticket matches, else 1.

### F-113 — Booking refusals become a generic 500 on Supabase

- **Where:** `src/server/http.ts` maps unknown `Error`s to 500 "Something went wrong on the server…". `BookingService` throws plain `Error` for:
  - "That kind of work is no longer on the form…"
  - a department not on the list
  - a missing required answer
  - a bad `departmentId`
- **Consequence:** a stakeholder whose form went stale mid-booking is told the server broke, not what to change.
- **Fix (OPEN):** a `BookingRefusal` error class, mapped to 400/409 with its message. The server's own errors keep the generic text.

### F-114 — Task-creating automation chains escape the depth limit

- **Where:** `src/services/automation-engine.ts` marks the task in hand (`performActions`, `writingTo`). Items *created* by `create_item`, `create_subitem` or `duplicate_item` carry no mark, so their events start again at depth 0.
- **Consequence:** `column_set_to(Status = Done) → duplicate_item` copies a task that is Done. The copy's values raise `value_changed` to Done, which duplicates again, without end. Growth is bounded only by the runner's per-tick budget.
  - The write-back guard (service L339-360) covers only writes to the trigger's own column.
  - The same-board creation guard covers only creation triggers.
- **Fix (OPEN):**
  - Mark created items at `depth + 1` before their events are raised.
  - Or refuse duplicate/create actions on value-triggered rules for the same board, as creation triggers already are.
- **Verify on E3 first.**

### F-115 — Automation events can be stuck claimed forever; nothing retries

- **Where:** `drain()` claims up to 200 events and finishes each. An event claimed by a function that times out at 60 s or crashes is never released. `MAX_EVENT_ATTEMPTS` (3) is defined and unused.
- **Consequence:** those events never run. The board's "running" ring stays lit indefinitely, because the indicator reads unprocessed rows.
- **Fix (OPEN):** at the start of each tick, release claims older than a few minutes whose `attempts < MAX_EVENT_ATTEMPTS`. Mark the rest failed.

### F-116 — Undo can delete more than the user expects

- **Where:** `src/stores/undo-store.ts`, `use-board-mutations.ts:291-296`.
  - "Added X" is undone by hard-deleting the task.
  - Deliverable, update, link and allocation actions don't clear the offer. It survives path-preserving navigation such as opening other tasks.
- **Consequence:** someone adds a task, gives it deliverables and an update, then presses Undo expecting to undo the last small thing. The task and everything in it are deleted, with no confirmation.
- **Fix (OPEN):**
  - Clear the offer on any write to that task.
  - Or make "Added X" archive rather than delete.

### F-117 — Public bookings create unlimited accounts

- **Where:** `src/server/requesters.ts` → `inviteMember`.
- **Consequence:** every new email typed into a public booking creates a confirmed Supabase Auth user (no password), an INVITED membership and a 30-day invitation. No CAPTCHA and no rate limit guard it. The member list and the Auth user table can be flooded by anyone holding the link.
- **Fix (OPEN):**
  - Rate-limit by IP and workspace.
  - Or keep new requesters as a name and email on the task until an admin chooses to invite them.

### F-118 — Restore semantics that are not visible to the person restoring

- **Where:** `src/server/snapshots.ts:323-420`.
- **What a restore actually does:**
  - It truncates **every** current table and refills from the file. A table absent from an older file (for example `board_templates` from before 0077) comes back empty.
  - A NOT NULL column with no default that is missing from an older file fails the whole restore.
  - `skippedTables` is returned but never shown.
  - Pending `automation_events` and `automation_schedule_fires` come back as they were, so scheduled rules and webhooks may fire again.
  - The whole database is restored, every workspace included.
  - Snapshot files contain live share, portal and invitation tokens and the booking key.
- **Fix (OPEN):**
  - Show skipped and emptied tables in the restore dialog.
  - Exclude or clear the automation queue on restore.
  - Document the file's sensitivity (done in the knowledge base draft).

### F-119 — Public dashboard link polls in the background

- **Where:** `src/features/dashboard/public-dashboard-page.tsx`: `REFRESH_MS = 60_000` with `refetchIntervalInBackground: true`.
- **Consequence:** a link left open in a background tab downloads about 4.5 MB a minute, roughly 6.5 GB a day. The Supabase free plan allows 5 GB of egress a month.
- **Fix (OPEN):** stop background polling, or slow it right down, and refresh on focus. A wall screen keeps its tab in the foreground.

### F-120 — Touch cannot reach hover-only controls

- **Where:** `src/features/items/item-updates.tsx`: edit and delete on an update, the add-reaction button on replies, and row actions in the table are revealed on hover.
- **Consequence:** on a phone they can't be reached at all. They stay invisible even after a tap.
- **Fix:** part of the mobile revamp (`MOBILE_AUDIT.md` M-04).

### F-121 — Documentation describes an older app

- **What's out of date:**
  - `KNOWLEDGE_BASE.md` (snapshot v0.17.0): heads 0040/0016/IndexedDB 15. Nothing on automations, tickets, templates, snapshots, the danger zone, threads, reactions, special columns, Requester, Countdown or the date/time columns.
  - `README.md` (8 September).
  - The in-app guide:
    - says the booking editor is "being updated"
    - describes three dashboard tabs
    - says linked tasks don't share assets
    - lists a Settings layout that no longer exists
    - points local users to an Export that was removed
- **Fix:** full rewrites are prepared in `deliverables/repo` (DOC).

---

## P3 and minor (STATIC unless stated)

### Tickets and search

| ID | Finding | Where |
| --- | --- | --- |
| F-123 | One-ticket-per-task is only checked when someone types a ticket. Booking, "Add a ticket" and link sync never check, and `reconcileCounter` is unused, so a typed ticket above the series is later issued again | `src/services/ticket-service.ts:124-178` |
| F-124 | Unlinking, or excluding "ticket" on an existing link, leaves both tasks sharing one ticket | `item-link-service.ts` |
| F-125 | `tickets:dedupe` groups by ticket across **all** workspaces, and `process.exit` inside `try` skips `sql.end()` | `scripts/tickets-dedupe.mjs` |
| F-126 | "Add a ticket" stays disabled with a spinner after one use or a failure (`issuing` never reset), so double-click-to-type on a ticketless task can't be reached | `item-detail-panel.tsx:651-825` |
| F-127 | A GUEST can call `next_ticket_numbers` directly and burn numbers; it needs only an active membership | migration 0050 |
| F-128 | "Rewrite N" counts tasks, not codes; the toast says "1 tickets" | `ticket-settings.tsx` |
| F-129 | The board's own search doesn't fold accents the way the palette does. Archive search is a plain substring, so "cp14" doesn't find CP_014 there | `board-filtering.ts:48-54`, `item-archive.ts:154` |
| F-130 | The ticket slot is a fixed 92 px, so CREATIVE_1000 overflows | `board-model.ts:175` |

### Boards, columns and views

| ID | Finding | Where |
| --- | --- | --- |
| F-131 | Toolbar sort by Priority/Status descending puts empty cells first; header sorts put them last | `board-filtering.ts:208-219` |
| F-132 | Countdown refuses "in 45m", the form its own placeholder suggests | `countdown.ts:152-154` |
| F-133 | Board settings → Columns deletes a plain column with one click, with no confirmation | `board-settings-dialog.tsx:289` |
| F-134 | A Booking time column reaches ordinary boards through Duplicate or a template saved from Task Allocation (bypasses the `addColumn` guard) | `board-service.ts:108-124,266-278` |
| F-135 | Template automations are created before template tasks, so creation and keyword rules fire once per seeded task. Rules arrive enabled and unvalidated | `board-template-service.ts` |
| F-136 | Moving a TEAM-visibility board to "No team" leaves it TEAM with no team, visible only to its owner, members and admins | `board-service.ts updateBoard` |
| F-137 | Board settings → General lets you pick a team or visibility for Task Allocation; the service then throws | `board-settings-dialog.tsx:118,136` |
| F-138 | "Used as → Nothing in particular" can't clear a role the column's type implies; the guess selects it again | `column-role.ts` |
| F-139 | Duplicate copies the cached Assets recap but no asset lines, so the copy shows stale counts. Subitems of archived parents become top-level | `board-service.ts:236-320` |
| F-140 | Removing the Status or Priority column while its filter is active hides every task | board filters |
| F-141 | "Save over it" on someone else's template fails under RLS, but the UI offers it. The save dialog lists boards the saver can't open (local provider) | `board-templates.tsx` |
| F-142 | Link cells open `href={v.url}` with no scheme check (React 19 blocks `javascript:`; other schemes pass) | `cell-renderer.tsx:881,905` |
| F-143 | The phone "Ticket" toggle does nothing on the phone grid but changes (and syncs) the desktop setting | `mobile-board-tools.tsx` |
| F-144 | Re-adding a removed special column jumps: the optimistic update appends it, the server keeps its old place | `use-board-mutations.ts:512-533` |
| F-145 | No database uniqueness per special type (only per role), so two tabs adding the same type at once can duplicate it | migration 0048 |
| F-146 | The 12 wrong empty-state strings: "People column" where PIC is meant, "Timeline or Date column" where Due date is meant | `workload-view.tsx:73`, `kanban-view.tsx:182`, `timeline-view.tsx:56` |
| F-147 | The Number column has unit and decimals settings with no UI; `decimals` is never read | `column.ts` |

### Task panel, journey, undo and links

| ID | Finding | Where |
| --- | --- | --- |
| F-148 | Pop-up body isn't wrapped in `PanelSizeProvider`, so fields keep a 260 px width instead of filling the pane | `item-detail-panel.tsx:363-383` |
| F-149 | "Archive task" in the panel skips the archive dialog's link question (cascade/break) | `item-detail-panel.tsx` |
| F-150 | Hidden-in-panel "restore" items are shown to viewers; Supabase refuses them, the local provider applies them | `item-detail-panel.tsx:1085-1110` |
| F-151 | Journey reads a task's activity unpaged, newest first. A task with more rows than PostgREST's maximum loses its oldest events, including the booking | `activities.listByItem` |
| F-152 | On linked tasks the journey's "arrived with" count includes the partner's lines | `journey.ts` |
| F-153 | The portal journey includes `requesterName`, `department` and `actorId` for every visible request | `stakeholder-portal-service.ts:204-206` |
| F-154 | Undoing an archive made with the "break" policy doesn't restore the links | undo |
| F-155 | Linked edit where the editor can edit A but only view B: A saves, B fails RLS, and the UI rolls back as if A had failed | link propagation |
| F-156 | Unlink is immediate, with no confirmation. The `updates` exclusion has no UI, and the update copy ignores it anyway | `sync-field-list.tsx`, `comment-service.ts` |

### Booking, allocation and portal

| ID | Finding | Where |
| --- | --- | --- |
| F-157 | Restoring a booking draft or repeating a past booking drops each deliverable's asset type | `booking-remember.ts:151,401` |
| F-158 | Public `/api/book` has no idempotency: a retry with the same proposed `itemId` books twice (the test asserts it) | `tests/unit/booking.test.ts:1013-1025` |
| F-159 | Bulk allocation runs in parallel (`Promise.all`, despite "one at a time"): moves share a position, and one failure hides the success toast | `useAllocation` |
| F-160 | Allocation targets are filtered by *can view*, not *can edit* | allocation menus |
| F-161 | Trigger 0074 can refuse a department after the move has happened, leaving a half-allocated task | allocation + 0074 |
| F-162 | The same portal submission key with a *different department* replays the first receipt: department isn't in `hashSubmission` | `stakeholder-portal-service.ts:914` |
| F-163 | Portal `?task=` for a request outside the date range shows "Item not found", flickering to a skeleton on every 4 s poll | portal page |
| F-164 | A reply whose `parent_id` points at another item's update is accepted by RLS: invisible, but counted in badges | policy `comments_insert` |
| F-165 | Portal passwords are verified on every call (every 4 s poll), with no attempt limit | `stakeholder-portal-service.ts:616` |
| F-166 | Portal `description` (≤280) is stored and has no UI and no display | `department_portals` |
| F-167 | Departments: removing every entry makes the defaults reappear with new ids. A person's own department isn't rewritten when it's renamed or removed. The local provider has no equivalent of trigger 0074 | lists / 0074 |

### Automations

| ID | Finding | Where |
| --- | --- | --- |
| F-168 | Editing a rule doesn't cut its name to 200 characters; the database CHECK does, so a long auto-generated name fails on save (create does cut it) | `automation-service.ts:139` |
| F-169 | `is`/`is_not` conditions on PLAIN_DATE, TIME, DATETIME, COUNTDOWN or REQUESTER compare `null` with `null`, so `is` is always true | `automation-engine.ts:1014-1089` |
| F-170 | Rules on archived boards keep running | engine |
| F-171 | `runAutomations` overwrites `report.ran` with the last pass's count | `src/server/automations.ts:144` |
| F-172 | The quick-run Run button is shown to viewers, who then get a 403. A switched-off quick run returns a generic 500. The expired-session message says "…to manage members." | `automations-dialog.tsx`, `api-call.ts:20` |
| F-173 | Removing a rule deletes it at once, with no confirmation, and cascades away its run history | `automations-page.tsx` |
| F-174 | `is_overdue` compares against the UTC date. An invalid `AUTOMATION_TIMEZONE` throws before per-rule handling, so the tick returns 500 and writes no heartbeat. Snapshots default the zone to Asia/Ho_Chi_Minh; automations use Australia/Melbourne | engine L1047; `snapshots.ts` |
| F-175 | A schedule fires only inside its exact hour; with no tick in that hour it is skipped, not delayed | engine L308-361 |
| F-176 | Values written by the runner carry a null actor; item events fall back to `created_by`. This affects `actor` conditions and `{actor}` | capture triggers |
| F-177 | `column_unchanged_for` keys on `updated_at`, which a no-op upsert refreshes; receipts are swept after 30 days, so the same quiet stretch can fire again | engine |
| F-178 | "Nobody to tell", "Already in X" and "No subitems" count as *ran*, which moves `runCount` and triggers re-drains | engine |
| F-179 | If both `AUTOMATION_SECRET` and `CRON_SECRET` are set, `CRON_SECRET` is ignored | `authoriseTick` |
| F-180 | Any valid Auth session can nudge a drain (≤50 events), with no membership check and no rate limit | `authoriseTick` |
| F-181 | The local provider never drains its automation queue, so event and schedule rules never fire in local mode, and the page says the runner has never run | `src/data/local` |
| F-182 | Archive and restore fire once per subitem. Supabase raises one event per item update where local raises two (rename + move). Supabase truncates comment bodies to 2000 characters | triggers |

### Collaboration, settings and version

| ID | Finding | Where |
| --- | --- | --- |
| F-183 | Policy 0070 lets viewers react ("viewers included") and accepts any 1–16-character string; the UI hides reactions from non-editors. Admins can't remove others' reactions | `0070`, `item-updates.tsx` |
| F-184 | Mentions: `@Linh Tran` also matches inside `@Linh Tran Nguyen`, and matching runs over every user, not just active ones | `extractMentions` |
| F-185 | The COMMENT notification preference reads "Comments on my items / Someone posts an update on an item you own"; only replies emit COMMENT | `notification.ts:94,105` |
| F-186 | Any reaction anywhere refetches every open board's comment list: the realtime binding is unfiltered on the `["comments"]` prefix | `use-board-realtime.ts` |
| F-187 | Settings → Roles still lists "Reset demo data" | `settings-page.tsx` |
| F-188 | Removing Settings → Storage (v0.47.3) also removed local mode's Export/Import data; only Reset demo data remains, in the user menu | `settings-page.tsx`, `user-menu.tsx:170` |
| F-189 | Settings → Teams offers New team without the UI's `canCreateTeam` gate (RLS decides). The Overview Teams tile and the Teams list count different sets | `settings-page.tsx` |
| F-190 | `VersionWatcher` is mounted only in the app shell, so portal, share, booking and public dashboard pages never learn of a new build. A rollback is announced as "vOLD is ready" | `app-shell.tsx:86`, `version.ts` |
| F-191 | Profile activity is drawn from the workspace's latest 300 events, so a quiet person may show none. "Assets overdue" uses the UTC date | `profile-service.ts:45-48` |
| F-192 | `HeroCard`/`Delta` in dashboard `panels.tsx:58-93` is dead code that ignores the under-5 rule | dashboard |

### Tests

| ID | Finding | Where |
| --- | --- | --- |
| F-193 | Stale Playwright specs:<br>• `boards-lifecycle.spec.ts:21-51` expects the old "Campaign"/"Creative Production" templates and radios<br>• `column-types.spec.ts:128-147` names a Link column "Brief", which collides with the special Brief cell<br>• `booking.spec.ts:92-93,152` expects "Priya Nair" where the Requester cell shows a first name | `tests/e2e` |
| F-194 | Four unit tests exceed Vitest's 5 s default under load: `booking-wizard` ×2, `tracker-export`, `trackers` xlsx round-trip. They pass alone in 0.4–1.3 s | baseline log |
| F-195 | **No automated test** covers:<br>• automations in the browser<br>• replies, collapse, the delete badge, reaction UI<br>• snapshots, restore and wipe (API or UI)<br>• saved templates in the UI<br>• special-column removal/restore in the UI<br>• Format menu, Countdown and date/time cells<br>• Requester cells, Word download, "Used as"<br>• item-column resize, sidebar resize, Admin panel<br>• the loading screen<br>• the public dashboard cadence<br>• any `src/server/*` route<br>• any SQL trigger or policy added since 0040 | — |

### Stale text

These are code comments and docs that now say something false. They are listed in full in `DOCUMENTATION_DRIFT.md`: F-196 (code comments), F-197 (migration headers), F-198 (the in-app guide), F-199 (`.env.example`, which is missing `AUTOMATION_SECRET`, `AUTOMATION_TIMEZONE` and `CRON_SECRET`).

---

## Items raised earlier that stay closed

- OWNER and ADMIN have the same powers inside a workspace. This is deliberate until multi-workspace; do not re-report it.
- F-001 from 9 September (deactivation) was fixed then. It is re-tested as AUTH-04, and was not executed this session.
