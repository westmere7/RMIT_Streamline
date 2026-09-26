# Coverage ledger — end-to-end audit, 26 September 2026

Every row of `AUDIT_PLAN.md` §4 has a status here. Nothing counts as PASS on the strength of a test's name.

## Statuses

| Status | Meaning |
| --- | --- |
| **E3 PASS / E3 FAIL** | Executed on the disposable Supabase database |
| **UNIT** | The named Vitest suites ran green in the baseline (below). They cover the row's logic on the local provider only. The row's browser and Supabase parts did not run, so it is **not** a PASS |
| **STATIC FAIL** | The code path, read end to end, contradicts what the row expects. The finding is named. Not executed |
| **STATIC** | The code path, read end to end, matches. Not executed |
| **BLOCKED** | Needs the browser (E2) or a flow on E3, and the session's tool block stopped all execution (see README) |

## What actually ran

| Run | Result |
| --- | --- |
| **Baseline `npm run check`** (E1, before any change) | Lint clean (6 warnings). Typecheck clean. Vitest 950/954 in 102 files. The 4 failures were 5 s timeouts under load (`booking-wizard` ×2, `tracker-export`, the `trackers` xlsx round trip); all four pass when run alone, in 0.4–1.3 s (F-122/F-194) |
| **`tests/unit/sql-sequence.test.ts`** (new) | 4/4 |
| **E3 schema from empty** | FAIL at `migrations/0005` → runner fixed (F-108) → 96/96; rerun "Up to date"; `--dry` the same; 44 public tables, matching production |
| **E3 `db:seed`** | FAIL (`UNDEFINED_VALUE`) → seed fixed (F-109) → exit 0, 1,413 items |
| **E3 `db:special-columns`** | "Every board already has every special column." |
| **E3 probes** | `automation_schedule_fires.item_id` is NOT NULL (primary key); an insert with a null `item_id` fails with 23502 (F-105). `item_assets` still carries the old nullable `assignee_id` beside `assignee_ids` |
| **E4 (production)** | Two read-only queries: counts, members, snapshots, recent activity, heartbeat. A third was refused by the permission classifier and not pursued |
| **Local Playwright suite** (32 specs) | **Not run.** The block came first |
| **Phone sweep** (`mobile-sweep.cjs`) | **Not run.** Written; the block came first |
| **E3 app on :3300** | Started. Blocked before the first request |

The prepared fixes (FX-01 … FX-18), the rewritten documentation and the three new test files have **never been run**. `NEXT_SESSION.md` §1–§2 runs them.

## Summary

| Status | Rows |
| --- | --- |
| E3 PASS | 2 (DATA-02, OPS-02 in part) |
| E3 FAIL | 1 (AUTO-07) |
| STATIC FAIL | 75 |
| STATIC | 4 |
| UNIT | 43 |
| BLOCKED | 62 |
| **Total** | **187**, plus the permission matrix (BLOCKED) |

---

## 4.1 Sign-in, session and onboarding

| ID | Status | Evidence / reason |
| --- | --- | --- |
| AUTH-01 | BLOCKED | `auth-and-navigation` e2e not run |
| AUTH-02 | UNIT | `auth-messages`. Supabase sign-in not run |
| AUTH-03 | BLOCKED | Needs L and S |
| AUTH-04 | UNIT | `audit-regressions` (a deactivated member loses every board role, 9 Sep). RLS 0014/0015 on S not run |
| AUTH-05 | BLOCKED | Needs L |
| AUTH-06 | BLOCKED | Needs L and an HTTP probe |
| AUTH-07 | UNIT | `onboarding`. The browser flow and Supabase not run |
| AUTH-08 | BLOCKED | Needs S |
| AUTH-09 | STATIC FAIL | F-172: the expired-session message says "…to manage members." wherever it appears |
| AUTH-10 | BLOCKED | Needs L |

## 4.2 Shell, navigation and search

| ID | Status | Evidence / reason |
| --- | --- | --- |
| NAV-01 | BLOCKED | Needs L |
| NAV-02 | BLOCKED | Needs L |
| NAV-03 | STATIC FAIL | F-112: one or two letters match every ticket and flood the palette. `search-service` is green, but no test types a short query over ticketed tasks. FX-07 adds one |
| NAV-04 | BLOCKED | `views-and-routing` e2e not run |
| NAV-05 | BLOCKED | Needs L |
| NAV-06 | STATIC FAIL | F-116: the "Added X" offer survives deliverable, update and link writes, and undoing hard-deletes the task. `components/undo` is green |
| NAV-07 | UNIT | `components/person-card`. Touch has no hover, so the phone needs a tap target (MOBILE_AUDIT) |

## 4.3 Boards

| ID | Status | Evidence / reason |
| --- | --- | --- |
| BRD-01 | BLOCKED | Needs L and S |
| BRD-02 | STATIC FAIL | F-135: template rules are created before template tasks, so creation rules fire once per task. `board-templates` is green. FX-11 adds a test |
| BRD-03 | STATIC FAIL | F-141: "Save over it" is offered where RLS refuses; the picker lists boards the saver can't open (local) |
| BRD-04 | STATIC FAIL | F-136 (TEAM board moved to No team); F-137 (Task Allocation's team and visibility controls aren't disabled) |
| BRD-05 | STATIC FAIL | F-134 (Booking time column through Duplicate); F-139 (stale recap; subitems of archived parents). `board-service` is green |
| BRD-06 | BLOCKED | `boards-lifecycle` not run, and stale (F-193) |
| BRD-07 | UNIT | `permissions`. RLS not run |
| BRD-08 | BLOCKED | Needs L |
| BRD-09 | BLOCKED | Needs L |
| BRD-10 | UNIT | `seed-topup`, `special-columns`. L and S not run |

## 4.4 Groups, items and tickets

| ID | Status | Evidence / reason |
| --- | --- | --- |
| ITEM-01 | BLOCKED | `groups-and-items` not run |
| ITEM-02 | BLOCKED | Needs L |
| ITEM-03 | BLOCKED | Needs L |
| ITEM-04 | BLOCKED | `filters-sort-and-dnd` not run (two drag tests are known to flake on a clean `main`) |
| ITEM-05 | STATIC FAIL | F-159: bulk allocation runs in parallel, moves share a position, and one failure hides the success toast |
| ITEM-06 | STATIC FAIL | F-107 (CP_1234 truncated by a Supabase rewrite); F-123 (uniqueness only checked on typing); F-124 (unlink leaves a shared ticket); F-125 (`tickets:dedupe` spans workspaces); F-126 ("Add a ticket" stuck after one use). `ticket` is green |
| ITEM-07 | BLOCKED | Needs L |
| ITEM-08 | BLOCKED | Needs L |

## 4.5 Columns

| ID | Status | Evidence / reason |
| --- | --- | --- |
| COL-01 | BLOCKED | `column-types` not run |
| COL-02 | UNIT | `rich-text`, `rich-text-doc`, `rich-text-docx` |
| COL-03 | UNIT | `status-label-roles`, `components/status-cell`, `components/edit-labels-dialog` |
| COL-04 | UNIT | `dropdown-column` |
| COL-05 | BLOCKED | Needs L |
| COL-06 | STATIC FAIL | F-102: a public booking renames an active member. `booking-requester` is green because it asserts the rename. FX-02 changes that test |
| COL-07 | UNIT | `system-column-types` |
| COL-08 | BLOCKED | Needs L |
| COL-09 | STATIC | No decimals UI, as the plan records (F-147) |
| COL-10 | UNIT | `date-time-columns` |
| COL-11 | STATIC FAIL | F-132: "in 45m", the placeholder's own form, is refused. `countdown-column` is green. FX-08 adds a test |
| COL-12 | UNIT | `special-columns` |
| COL-13 | UNIT | `size-column` |
| COL-14 | STATIC FAIL | F-142: `href={v.url}` with no scheme check. FX-13 |
| COL-15 | STATIC FAIL | F-167: the local provider has no equivalent of trigger 0074; removing every entry brings the defaults back with new ids. `department-reconciliation` is green |
| COL-16 | BLOCKED | Needs L |
| COL-17 | UNIT | `special-columns` |
| COL-18 | STATIC FAIL | F-134: the guard is bypassed by Duplicate and by templates |
| COL-19 | BLOCKED | Needs L |
| COL-20 | STATIC FAIL | F-133 (a plain column deleted with one click in Board settings → Columns); F-144 (re-added column jumps); F-145 (no uniqueness per special type). `special-columns` is green |
| COL-21 | STATIC FAIL | F-138: "Nothing in particular" can't clear an implied role. `column-roles` is green |
| COL-22 | STATIC FAIL | F-150: viewers are offered hidden-in-panel restore |
| COL-23 | BLOCKED | Needs L |

## 4.6 Views, filters and the archive

| ID | Status | Evidence / reason |
| --- | --- | --- |
| VIEW-01 | BLOCKED | `large-board` not run |
| VIEW-02 | STATIC FAIL | F-110: a task whose only PIC is pending or deactivated is in no lane. FX-05 |
| VIEW-03 | STATIC FAIL | F-146 (wording only): "Timeline or Date column" where Due date is meant |
| VIEW-04 | STATIC FAIL | F-146 (wording only): "People column" where PIC is meant. `view-aggregates` and `workload-section` are green |
| VIEW-05 | BLOCKED | Needs L |
| FLT-01 | STATIC FAIL | F-129: the board search doesn't fold accents as the palette does. `board-filtering` is green |
| FLT-02 | STATIC FAIL | F-131: descending toolbar sorts on Priority and Status put empty cells first |
| FLT-03 | STATIC FAIL | F-140: removing the column behind an active filter hides every task |
| ARC-01 | STATIC FAIL | F-129: archive search is a plain substring, so "cp14" misses CP_014. `board-archive` is green |

## 4.7 The task panel

| ID | Status | Evidence / reason |
| --- | --- | --- |
| PANEL-01 | BLOCKED | Needs L |
| PANEL-02 | STATIC FAIL | F-148: the pop-up body isn't in `PanelSizeProvider` |
| PANEL-03 | STATIC FAIL | F-150: hidden-in-panel restore shown to viewers |
| PANEL-04 | STATIC FAIL | F-151 (unpaged activity loses the oldest events); F-152 ("arrived with" includes the partner's lines). `task-journey` is green |
| PANEL-05 | BLOCKED | `item-cover` not run |
| PANEL-06 | STATIC FAIL | F-149: the panel's Archive skips the link question |

## 4.8 Updates, replies and reactions

| ID | Status | Evidence / reason |
| --- | --- | --- |
| UPD-01 | STATIC FAIL | F-184: `@Linh Tran` also matches inside `@Linh Tran Nguyen` |
| UPD-02 | STATIC FAIL | F-164: a reply whose parent is another task's update is accepted |
| UPD-03 | BLOCKED | Needs L |
| UPD-04 | BLOCKED | Needs L |
| UPD-05 | BLOCKED | Needs L; the RLS side is UPD-08 |
| UPD-06 | STATIC FAIL | F-183 (policy lets viewers react; admins can't remove others'); F-186 (unfiltered realtime refetch). `comment-reactions` is green |
| UPD-07 | BLOCKED | `updates-badge` not run |
| UPD-08 | STATIC FAIL | F-104, F-164. Proposed `0079` and policy `0020`, not run |
| UPD-09 | STATIC FAIL | F-120/M-04: edit, delete and the reply reaction are hover-only. FX-18 |

## 4.9 Deliverables and links

| ID | Status | Evidence / reason |
| --- | --- | --- |
| AST-01 | UNIT | `item-assets`, `asset-links` |
| AST-02 | BLOCKED | Needs L (F-152 is related) |
| LNK-01 | UNIT | `item-links` |
| LNK-02 | STATIC FAIL | F-155: editor of A who can only view B: A saves, B fails RLS, and the UI rolls A back. `item-link-sync` and `label-sync` are green |
| LNK-03 | STATIC FAIL | F-124: unlinking leaves both tasks on one ticket |

## 4.10 Booking

| ID | Status | Evidence / reason |
| --- | --- | --- |
| BOOK-01 | BLOCKED | `booking` e2e not run, and stale (F-193) |
| BOOK-02 | UNIT | `booking-wizard` ("will not go past step one…"). The past-date API probe not run |
| BOOK-03 | UNIT | `booking-wizard` (answers from the account; booking for someone else) |
| BOOK-04 | UNIT | `booking-wizard` (spinner; known email fills the name; a corrected name left alone) |
| BOOK-05 | UNIT | `booking-wizard`, `booking` (the service's questions only; sub-service chips; numbering) |
| BOOK-06 | UNIT | `booking-wizard` (one line each with a type; skip). The 51st-line refusal not checked |
| BOOK-07 | BLOCKED | Needs L |
| BOOK-08 | STATIC FAIL | F-157: restored rows drop their asset type. FX-12 |
| BOOK-09 | STATIC FAIL | F-102. FX-02 |
| BOOK-10 | UNIT | `booking` |
| BOOK-11 | UNIT | `booking` |
| BOOK-12 | BLOCKED | Needs L |
| BOOK-13 | STATIC FAIL | F-113: refusals become a generic 500 |
| BOOK-14 | STATIC FAIL | F-162: same key with a different department replays the first receipt. F-158 (a public retry duplicates) is recorded as expected. `portal-booking` is green |
| BOOK-15 | STATIC FAIL | F-103: `ilike` takes `%` and `_`. FX-02 |

## 4.11 Allocation and the form editor

| ID | Status | Evidence / reason |
| --- | --- | --- |
| ALLOC-01 | STATIC FAIL | F-159 (parallel bulk moves); F-160 (targets filtered by *can view*) |
| ALLOC-02 | UNIT | `booking` |
| ALLOC-03 | STATIC FAIL | F-161: trigger 0074 can refuse after the move has happened |
| FORM-01 | UNIT | `booking` ("keeps a draft to itself until it is published"; built-in stored as nothing) |
| FORM-02 | UNIT | `booking` (forms by name, replace on the same name, reset). The UI not run |
| FORM-03 | BLOCKED | Needs L |

## 4.12 The portal

| ID | Status | Evidence / reason |
| --- | --- | --- |
| PORT-01 | BLOCKED | `stakeholder-portal` e2e not run |
| PORT-02 | STATIC FAIL | F-165 (held back until fixed). `stakeholder-portal` and `portal-password` are green |
| PORT-03 | STATIC FAIL | F-163: `?task` outside the range shows "Item not found". `portal-board`, `portal-grouping`, `portal-range` and `portal-scope` are green |
| PORT-04 | BLOCKED | Needs L |
| PORT-05 | STATIC FAIL | **F-101 (P1)**: a department with no requests yet can't book. FX-01 adds the test |
| PORT-06 | STATIC FAIL | F-153: the portal journey carries requester name, department and actor id. `portal-scope` and `portal-board` are green |
| PORT-07 | BLOCKED | Needs L |

## 4.13 Sharing and the dashboard

| ID | Status | Evidence / reason |
| --- | --- | --- |
| SHR-01 | UNIT | `board-share` |
| SHR-02 | UNIT | `item-share` |
| SHR-03 | UNIT | `dashboard-share` |
| DASH-01 | UNIT | `dashboard-metrics`, `dashboard-analytics`, `dashboard-thin-data`, `headline-figure`, `year-comparison`, `trend-line`, `treemap`. The independent recount not done |
| DASH-02 | BLOCKED | Needs L |
| DASH-03 | UNIT | `dashboard-motion` |
| DASH-04 | STATIC FAIL | F-119: the public link polls about 4.5 MB a minute in a background tab |

## 4.14 Automations

| ID | Status | Evidence / reason |
| --- | --- | --- |
| AUTO-01 | STATIC FAIL | F-173: Remove deletes at once and takes the run history with it |
| AUTO-02 | BLOCKED | Needs L |
| AUTO-03 | STATIC FAIL | F-114 (created tasks escape the depth limit); F-169 (`is` on five types compares null with null). `automations`, `automation-more`, `automation-subitems` and `automation-lanes` are green |
| AUTO-04 | STATIC FAIL | F-180 (held back until fixed); F-179 (`CRON_SECRET` ignored when both secrets are set). `automation-runner` is green |
| AUTO-05 | BLOCKED | Needs S (F-176 and F-182 are the known differences) |
| AUTO-06 | STATIC FAIL | F-106: `jsonb_strip_nulls` hides cleared values from 12 types. FX-03 adds a test replaying the stripped payload |
| AUTO-07 | **E3 FAIL** | F-105: a recurring rule's receipt can't be written (`item_id` NOT NULL; 23502). Proposed `0080`. Also F-174, F-175 |
| AUTO-08 | STATIC FAIL | F-172: viewers are offered Run (then 403); a switched-off run returns a generic 500. `quick-runs` and `components/quick-run-picker` are green |
| AUTO-09 | UNIT | `automation-runner` ("tells the people on a task, and not whoever set the change off"), `automation-more`. F-178 is a side effect |
| AUTO-10 | UNIT | `automation-more`: https only, localhost, private literals and credentials refused. STATIC: redirects not followed; a name that resolves to a private address passes, as the code's comment says |
| AUTO-11 | STATIC FAIL | F-115: a claimed event that never finishes keeps the ring lit for good. `automation-activity` is green |
| AUTO-12 | STATIC FAIL | F-170 (archived boards keep running); F-168 (editing a long name fails; FX-09); F-169; F-135 (FX-11) |

## 4.15 Inbox, messages, My Work, people, members, teams

| ID | Status | Evidence / reason |
| --- | --- | --- |
| NOTIF-01 | UNIT | `notifications-clear`. `notifications` e2e not run |
| NOTIF-02 | STATIC FAIL | F-185: the COMMENT preference describes an event that doesn't emit it |
| NOTIF-03 | UNIT | `notification-delivery`. Realtime on S not run |
| NOTIF-04 | UNIT | `messages-and-profile` |
| MYW-01 | UNIT | `my-work-filters`. The phone has no filters (M-07) |
| PPL-01 | STATIC FAIL | F-191: a quiet person's activity may be empty (latest 300 workspace events); "Assets overdue" uses the UTC date |
| PPL-02 | BLOCKED | Needs L |
| MEM-01 | UNIT | `onboarding`. `teams-and-members` e2e not run |
| MEM-02 | BLOCKED | Needs S |
| MEM-03 | STATIC FAIL | F-189: New team is offered without the `canCreateTeam` gate |

## 4.16 Settings, snapshots, trackers, version

| ID | Status | Evidence / reason |
| --- | --- | --- |
| SET-01 | BLOCKED | Needs L |
| SET-02 | STATIC FAIL | F-189: the Overview Teams tile and the Teams list count different sets |
| SET-03 | STATIC FAIL | F-107 on Supabase; F-128 ("1 tickets"). `ticket` is green |
| SET-04 | STATIC FAIL | F-167. `department-reconciliation` and `list-draft` are green |
| SET-05 | UNIT | `asset-rates` |
| SET-06 | BLOCKED | Needs L |
| SET-07 | STATIC FAIL | F-121/F-198: the guide describes an older app. The rewrite and `guide-content.test.ts` are prepared, not run |
| SET-08 | BLOCKED | Needs L |
| SET-09 | STATIC FAIL | F-187: "Reset demo data" is still listed. FX-14 |
| SNAP-01 | BLOCKED | Needs S |
| SNAP-02 | UNIT | `snapshot-file` |
| SNAP-03 | STATIC FAIL | F-118: tables missing from an older file come back empty; skipped tables aren't shown; pending automation work is replayed |
| SNAP-04 | BLOCKED | Needs S. Production's ledger shows a wipe and a restore completing on 25 September; this audit did not run either |
| SNAP-05 | BLOCKED | Needs S |
| SNAP-06 | BLOCKED | `db:snapshot:rehearse` not run |
| TRK-01 | UNIT | `trackers` (the xlsx round trip timed out under load, passes alone) |
| TRK-02 | UNIT | `components/tracker-flush` |
| TRK-03 | UNIT | `tracker-export` (timed out under load, passes alone) |
| VER-01 | STATIC FAIL | F-190: public pages never learn of a new build; a rollback is announced as "ready". `changelog` and `version` are green |

## 4.17 The phone

| ID | Status | Evidence / reason |
| --- | --- | --- |
| MOB-01 | BLOCKED | `mobile-layout` not run. STATIC: `h-dvh` and safe-area padding are there |
| MOB-02 | STATIC FAIL | M-01 (dialogs can't scroll; FX-17), M-02, M-03, M-12. The sweep not run |
| MOB-03 | STATIC FAIL | M-05/F-111 (Today is the UTC day; FX-06); M-06/F-143 (Ticket toggle) |
| MOB-04 | STATIC FAIL | M-04/F-120: hover-only controls on the task. FX-18 |
| MOB-05 | STATIC FAIL | M-07 (My Work filters), M-08 (search), M-09 (settings), M-10 (form editor), M-11 (dashboard tables) |
| MOB-06 | STATIC FAIL | M-01 in landscape |

## 4.18 Cross-cutting

| ID | Status | Evidence / reason |
| --- | --- | --- |
| PERM matrix | BLOCKED | The TypeScript layer is UNIT (`permissions`, `audit-regressions`). The PostgREST pass with each persona's JWT not run |
| SEC-01 | STATIC | Booking key 24, share 22, portal 32 characters. Whether any is logged was not checked end to end |
| SEC-02 | STATIC FAIL | F-165 (held back until fixed) |
| SEC-03 | BLOCKED | Needs S; F-180 found statically |
| SEC-04 | STATIC FAIL | F-104 (comments' `item_id`), F-127 (held back until fixed), F-183 (viewers react) |
| SEC-05 | STATIC FAIL | F-103 |
| SEC-06 | STATIC FAIL | F-142. `rich-text` is green |
| SEC-07 | STATIC | https only, no credentials, private literals and `.local`/`.internal` refused, redirects not followed. DNS names that resolve privately pass (documented in `webhookUrlProblem`) |
| SEC-08 | STATIC FAIL | F-102, F-117 |
| SEC-09 | STATIC | Snapshot files hold live share, portal and invitation tokens and the booking key (F-118; the knowledge base draft says so) |
| DATA-01 | BLOCKED | The flows didn't run. After seeding, `db:special-columns` found nothing to add, so one special column per type per board held on E3 |
| DATA-02 | **E3 PASS** | F-108: FAIL at `0005` before the fix, then 96/96, a no-op rerun and `--dry` |
| SYNC-01 | BLOCKED | `cross-view-sync` not run |
| SYNC-02 | BLOCKED | Needs S (F-186 found statically) |
| PERF-01 | BLOCKED | `large-board` not run |
| PERF-02 | STATIC FAIL | F-119 |
| RES-01 | BLOCKED | Needs L |
| OPS-01 | BLOCKED | `next build` not run |
| OPS-02 | **E3 PASS** (in part) | `db:migrate` fresh, rerun and `--dry`; `db:seed` after F-109; `db:special-columns`. `db:snapshot:rehearse` not run; `tickets:dedupe` not run (F-125 found statically) |

---

## The local Playwright suite

Not run. Before running it, update three stale specs rather than skipping them (F-193):

- `boards-lifecycle.spec.ts:21-51` expects the old templates and radios;
- `column-types.spec.ts:128-147` names a Link column "Brief";
- `booking.spec.ts:92-93,152` expects "Priya Nair" where the cell shows a first name.

## What this ledger does not claim

- No row is a PASS as a whole except DATA-02 and part of OPS-02.
- A UNIT row means the suite ran green, not that it tests everything the row expects.
- A STATIC FAIL is a reading of the code, however careful. Each one should be reproduced before its fix is called verified. `NEXT_SESSION.md` says how.
