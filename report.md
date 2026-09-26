# Streamline: documentation, end-to-end audit and phone revamp

**26 September 2026.** From `0649d71` (v0.49.0) to v0.52.0.

## Summary

Asked for, in order: bring the knowledge base, deck, documentation and README up to date; write an extensive end-to-end audit plan and test the app against it; revamp the phone version so it is "robust, perfectly usable"; write this report; push it all with the audit.

**Done:**

- **Documentation.** The knowledge base, README, in-app guide, `.env.example` and the Supabase READMEs are rewritten for v0.49 and brought to v0.50.
- **The deck.** Rebuilt at v0.52: 54 slides, the out-of-date screenshots recaptured from a local build, every slide checked, and copied to the repository root (§5).
- **The audit plan.** 187 test rows in 23 families (`Test_prompts/audits/2026-09-26-full-e2e/AUDIT_PLAN.md`).
- **The audit, run.** A static read of the whole app; the unit suite; a disposable Supabase stack built from the repository, with every server-side fix checked on it; the full browser suite; and a phone sweep at three sizes.
- **Findings.** 100 in the app (F-101 … F-200) and 18 on the phone (M-01 … M-18).
- **Fixed and shipped.** Both P1s, and F-103 … F-112, F-120, F-121 and F-200, plus seven P3s. The four SQL files apply to production on the next deploy.
- **The phone revamp**, built, looked at and tested: sheets, full-screen search, My Work search and filters, Settings as a list, calmer task cards (on the owner's word), installable to a home screen, an offline bar, and more. Only the dashboard's phone order (R-11) and one portal nit (M-17) are left.
- **"App updated"**, a card that says what changed since the version a browser last ran. Built and switched off, as the owner asked.
- **Tests.** Unit: 107 files, 980 tests, all passing. Browser: the fifth full run passed 220 of 244, with 17 skipped and 7 failed. Three of the failures are the known flaky drag-and-drop tests. One was a bug in the booking editor, fixed in v0.51.1, and three were specs the app had outgrown. All four pass now (§6.1, §6.4).
- **After the audit.** v0.50.1 (board search), v0.51.0 (Home asks to turn notifications on), v0.51.1 (the booking editor after publishing) and v0.52.0 (Report a bug), all pushed (§7).

**For the owner:** after the deploy, check that the four SQL files applied and that a recurring rule fires (§9).

---

## 1. What was asked, and where it stands

| Request | State | Where |
| --- | --- | --- |
| Update the knowledge base, deck, documentation and README | Done | `KNOWLEDGE_BASE.md`, `README.md`, the in-app guide, `supabase/*.md`, `Streamline-Intro.pptx` |
| An extensive audit plan, covering every flow and edge case | Done | `AUDIT_PLAN.md` |
| Test it end to end | Done: static, unit, disposable Supabase, browser, phone sweep | `COVERAGE.md`, `FINDINGS.md` |
| Revamp the phone version | Done, apart from R-11 and M-17 | `MOBILE_AUDIT.md` |
| A full report | This file | `report.md` |
| Push everything, with the audit report | Pushed | §2 |

## 2. Pushing

Pushed on 26 September, at the owner's word, as it stood: `0649d71..55e4540`, and this report after it. The later commits went out the same evening; production reported 0.51.0 once `bcbdb96` was deployed.

| Commit | What |
| --- | --- |
| `b91a73b` | The audit's fixes, documentation and folder; v0.49.1 |
| `eb96121` | Streamline on a phone; F-200; v0.50.0 |
| `5ea3de4` | The audit's SQL moved into `supabase/`; local databases without TLS |
| `fe44720` | Four open findings described in general terms |
| `9abeb29`, `55e4540` | The e2e specs caught up with the app |
| `7d1167f` | Board search: a query with no digit is never a ticket; specs from the third run; v0.50.1 |
| `bcbdb96` | Home asks a browser that has not answered to turn notifications on; v0.51.0 |
| `4981037`, `4213d53` | The booking editor after publishing; specs from the fifth run; v0.51.1 |
| `492d84a` | Report a bug; v0.52.0 |

The repository is public. Four findings are still open security issues: F-117, F-127, F-165 and F-180. The files describe them in general terms, but the owner chose to publish the audit commit as it was, so `b91a73b` keeps their first, detailed wording in the history. That makes fixing them the first thing to do (§9).

## 3. The app today (v0.52.0)

### Stack

| Layer | What |
| --- | --- |
| Client | Next.js 16.3 (App Router), React 19.2, TypeScript 5.9 (strict; tests are type-checked too), Tailwind CSS 4, Radix UI, TanStack Query and Virtual, Zustand, dnd-kit, Tiptap 3, React Hook Form with Zod |
| Local mode | IndexedDB through `idb` (schema v17), with a full seed. Cross-tab sync through BroadcastChannel |
| Server | Next route handlers for booking, portal, shares, invitations, automations, snapshots, version and changelog. The service-role key is used only here. `postgres.js` for snapshots and the migrator |
| Data | Supabase: Postgres, email and password Auth, Realtime, Storage, and row-level security on every table. 81 migrations (0001–0082; there is no 0069) and 20 policy files, applied in `supabase/sequence.txt` order |
| Jobs | Automations are captured by Postgres triggers into a queue, then drained by `/api/automations/run`. In production pg_cron drives it every minute; a GitHub Actions workflow is the five-minute fallback |
| Phone | Its own shell below 768 px; a web app manifest and icons, so it installs to a home screen |
| Hosting | Vercel, functions in `sin1`; Supabase in ap-southeast-1 |
| Tests | Vitest 4 with happy-dom, Testing Library and fake-indexeddb: 107 files, 980 tests. Playwright: 34 specs, 247 tests locally |

### New since the last knowledge base (v0.17)

- **Collaboration:** threaded updates with reactions, the task journey, hover profile cards.
- **Tickets:** codes with their own settings section.
- **Boards:** saved board templates; special columns, Requester, Countdown, and plain Date, Time and Date + Time columns.
- **Portal and booking:** the unified portal with per-link settings; the four-step booking wizard with a draft/publish form editor.
- **Automations:** rules, quick runs and a runner.
- **Data safety:** whole-database snapshots with restore, and the Danger zone.
- **Updates:** the update card with What's new, and the loading screen.
- **The phone (v0.50):** everything in §8.

## 4. Documentation

| File | What changed |
| --- | --- |
| `KNOWLEDGE_BASE.md` | Rewritten in 23 sections for v0.49: every feature, the access model, the automation pipeline, snapshots and what a restore does, a migration inventory, a disposable-stack recipe. Brought to v0.50: the phone chapter, the shipped SQL, the storage keys |
| `README.md` | Rewritten: features, the local demo, Supabase setup with `sequence.txt`, the runner, access, architecture, commands, deployment, troubleshooting. A phone line for v0.50 |
| The in-app guide (`guide-content.ts`) | Rewritten with the same chapter ids, so `?guide=` links still work; an Automations chapter; the phone chapter brought to v0.50. `guide-content.test.ts` keeps it honest |
| `.env.example` | `AUTOMATION_SECRET`, `AUTOMATION_TIMEZONE`, `CRON_SECRET` |
| `supabase/README.md`, `optional/README.md`, `policies/README.md` | Sequence order, building an empty database, pg_cron, which file's definition holds, policy 0020 |
| `docs/README.md` | Marks the folder's older reports as history |

## 5. The deck

`Streamline-Intro.pptx`, at the repository root, is built by a script in the session's scratchpad (`decktool/deck/build.js`). It is at v0.52, with 54 slides:

- **Text.** The version; the counts (80 migrations and 20 policy files; 33 e2e specs, with phone flows on a touch profile); the phone slide; the help line, which now mentions Report a bug. Three slides were added earlier: replies and the journey; templates and special columns; snapshots and the Danger zone.
- **Screenshots.** The 15 that were out of date were recaptured from a local production build, never from production. Seven slides were then fixed:
  - Roles (S03) and Tickets (S23) are recropped.
  - Task Allocation (S33) has its pins moved; the fifth now marks Service, since Assets recap is off screen.
  - The update (S21) no longer shows a tooltip.
  - The portal settings (S34) show the portal open.
  - The phone portal (S30) shows tasks: the demo's Task Allocation tasks carry no department, so the capture fills in their Department cells first.
  - About (S53) is at v0.52.0.
- **Checked.** Every slide was rendered through PowerPoint and looked at. The package validator passed on the first build. On later runs it could not download the Dublin Core schema, and the old deck failed the same way.

**Still worth doing.** Some slides use screenshots the recapture list does not cover, taken from production in earlier sessions, and have the same defects as the old deck:

- The sign-in shot (S06) wears a v0.30.0 badge.
- Pins sit on the labels they name on S12, S29, S37 and S40.
- The wizard's first step (S31) and a portal row (S29) show a production task called "What u need dude?".
- A few crops are thin or mostly empty (S17 chart, S20 bulk bar, S26 archive).

Recapturing those from a local build would take them off production data as well.

## 6. The audit

### 6.1 What ran

| Run | Result |
| --- | --- |
| Unit baseline (`npm run check` at `0649d71`) | Lint clean, typecheck clean, 950/954. The four failures were 5 s timeouts under load, and pass alone (F-122) |
| Disposable Supabase (E3) from empty | Failed at `migrations/0005`: migrations use helpers only the policy files define (F-108). The runner now follows `supabase/sequence.txt` → 96/96, a rerun "Up to date", 44 tables matching production. The seed crashed (F-109) and was fixed |
| The fixes on E3 | 16 checks, all passing (§6.2) |
| Snapshots on E3 | Access (401 / 403 / 200), take, download, upload, a damaged file refused, a wrong password refused (403), the wipe (Task Allocation kept), a restore that puts every count back, the safety snapshots. `db:snapshot:rehearse`: the fingerprints matched |
| Unit suite, final | 107 files, 980 tests, all passing. Lint: 0 errors, 6 warnings. Typecheck clean. In the full run, the booking-wizard cases took more than their 5 s timeout; that file now allows 15 s (F-122) |
| Browser, first run | 229 tests while other heavy work ran: dozens of 30 s timeouts. Not counted |
| Browser, second run | Against a production build on a quiet machine. Found the stale specs (§6.4) and F-200; stopped after 89 tests to fix them |
| Browser, third run | 199 passed, 26 failed, 17 skipped, in 39 minutes. Three booking failures were already fixed in `55e4540`. The rest: specs the app has outgrown (§6.4), the drag-and-drop landing-slot tests (flaky since 8 September) and the two OS-notification tests. No bug in the app |
| Browser, fourth run | Every fix in, against a production build of `bcbdb96`. The log stops at test 106 of 244 with no summary: not counted |
| Browser, fifth run | Against a production build of `bcbdb96` on `:3500`. 220 passed, 7 failed, 17 skipped, in 37 minutes. Three failures are the drag-and-drop landing-slot tests. One was a bug in the app: after publishing a booking form with a new service or question, the editor still said a draft was waiting and offered Publish again, because it compared the draft with the stored form, which comes back in a different key order with defaults filled in. Fixed in v0.51.1. The other three were stale specs (§6.4). All four pass against a build of `4213d53` |
| Phone sweep | 42 routes and the task panel at 390 × 844, 360 × 780 and 844 × 390: no page scrolls sideways anywhere (§8) |

Production was read twice, read-only, in the morning (§6.5).

### 6.2 The fixes, checked on the disposable stack

| Finding | Check | Result |
| --- | --- | --- |
| F-101 | Book from the portal for a department with no requests; again straight after a wipe | Books by name, both times |
| F-102 | Book as an active member, as a pending member, and as someone new; then book again as the new person with another name | Members keep their names; only the new person takes the typed name; the second booking renames nobody |
| F-103 | Look up `a%@…` and `j_smith@…` | Nobody found; only the exact address matches |
| F-106 | Clear a status, a date and a number | "When a column is cleared" fires for each, on the stripped payload |
| F-105 (0080) | A recurring rule at its hour; then the same receipt again | Fires once; the duplicate is refused (23505) |
| F-107 (0081) | Change the prefix with tickets 1234 and 14 | PROD_1234 and PROD_014 |
| F-104 (0079 + policy 0020) | Edit your own update; move it to another task; reply to another task's update; reply on the same task | Editing works; moving and the cross-task reply are refused; the same-task reply posts |

### 6.3 Findings and where they stand

**P1**

| ID | Finding | Now |
| --- | --- | --- |
| F-101 | Portal booking failed for any department with no requests yet, which is every department after a wipe | Fixed, v0.49.1, checked on E3 |
| F-102 | A public booker could rename any member, and pull other accounts in as pending | Fixed, v0.49.1, checked on E3. The owner's rule: nobody in the member list is renamed; only someone new takes the typed name |
| M-01 | Dialogs could not scroll on a phone | Fixed, v0.49.1; sheets in v0.50.0 |
| M-04 | 27 controls appeared only on hover | Fixed for the 15 on phone screens, v0.49.1; the phone suite edits, reacts to and deletes an update by touch |

**P2**

| ID | Finding | Now |
| --- | --- | --- |
| F-103 | Requester lookup took `%` and `_` patterns | Fixed, v0.49.1, checked on E3 |
| F-104 | A comment's author could move it onto any task | Fixed by 0079 and policy 0020, checked on E3 |
| F-105 | Every recurring rule failed every hour it was due, the Weekly review included | Fixed by 0080, checked on E3 |
| F-106 | "When a column is cleared" never fired on Supabase for 12 types | Fixed, v0.49.1, checked on E3 |
| F-107 | A prefix change truncated ticket numbers above 999; the live counter was at 923 | Fixed by 0081, checked on E3 |
| F-108, F-109 | An empty database could not be built; the seed crashed | Fixed, v0.49.1 |
| F-110 | Kanban person lanes dropped tasks of pending or departed people | Fixed, v0.49.1 |
| F-111 | The phone's Today was the UTC day | Fixed, v0.49.1 |
| F-112 | One or two letters in search matched every ticket | Fixed, v0.49.1 |
| F-113 | Booking refusals reach stakeholders as a generic server error | Open |
| F-114 | A task-creating rule chain can escape the depth limit | Open |
| F-115 | Claimed automation events that never finish stay claimed | Open |
| F-116 | Undo "Added X" can delete more than expected | Open (product decision) |
| F-117 | Public bookings: an abuse guard is missing | Open; detail held back |
| F-118 | Restore semantics the person restoring cannot see | Open; documented |
| F-119 | A public dashboard link in a background tab polls about 4.5 MB a minute | Open |
| F-120 | Hover-only controls on updates | Fixed (M-04) |
| F-121 | The documentation described an older app | Rewritten |
| F-200 | The sidebar's width, open teams, panel sizes and tracker view reset on every reload, since 13 September | Fixed, v0.50.0; found by the phone suite |

**P3.** 78 minor findings (F-122 … F-199), listed with locations in `FINDINGS.md`. Seven are fixed in v0.49.1: F-132 (Countdown takes "in 45m"), F-135 (template tasks don't wake the template's rules), F-142 (link cells open only web and mail addresses), F-157 (a restored draft keeps asset types), F-168 (long rule names), F-171 (the runner's total), F-187 (the Roles table). F-127, F-165 and F-180 are open, with their detail held back. The rest are open.

### 6.4 Stale browser specs

The app had moved on and the specs had not. None of these was a defect in the app:

- A row's Open and More actions take no room until the row is hovered (since 25 September). Thirty clicks now hover the row first (`clickRowButton`).
- Blank is the one built-in board template, and the template is a list, not radios.
- The booking wizard's first step also needs the department, how urgent, the date and what it involves. Signed in, the form asks no name, so the public-link tests sign out first. The Admin team's link reads "Admin Admins". Each choice in the form editor has a Done button beside its field.
- A new share link opens for the workspace, where no password is needed; the password test switches it to Anyone first.
- Every board has a special Brief column, so the link test names its column Reference.
- Resetting the demo data, and the first sign-in after a reset, wait for the whole local seed.
- The phone card no longer prints the ticket; its menu offers to copy it.

The third run found more of the same, fixed in `7d1167f`:

- Archiving a task asks "Archive …?" first, and deleting an update is a two-tap "Delete?" badge, not a dialog.
- A few row buttons are named by a regular expression or found on the page, so they missed `clickRowButton`; one more "Admin" link.
- The portal's department picker, an empty-state line, an asset type's option and the large board (virtualised, so not 300 rows in the page).
- An update's author is now a link, so "no link in the update" needs to ignore it. The markup stays text.
- The login page's accounts appear only once the seed is in.
- The new phone test checks an update's controls while the update is still fading in.

The fifth run found three more, fixed in `4981037` and `4213d53`:

- The Assets recap cell reads "2 assets ×4": lines, then the quantity.
- The notification test's fake permission reset on every page load, so the switch read off after allowing.
- The portal's department picker was reopened while it was still closing. With one department on screen there is no Department column, by design.

### 6.5 Production, as read in the morning

- **Workspace.** "RMIT VN MKT", ticket prefix CP26, counter 923. 9 boards, 969 live tasks, 26 members, 1 automation rule, 1 template.
- **Automation runner.** Its heartbeat was fresh when read.
- **Schema.** At 0078, the repository head then.
- **Pending members.** Three were created by public bookings on 25 September: the F-102 path in use.
- **Snapshots.** Five. They show the Danger zone wipe used and restored within 28 seconds on 25 September.

## 7. What shipped

**v0.49.1**, the audit's fixes: F-101, F-102/F-103, F-106, F-110, F-111, F-112, the seven P3s above, dialogs that scroll (M-01), hover controls on touch (M-04), the runner in `sequence.txt` order (F-108) and the seed (F-109).

**The SQL**, checked on E3 and moved into `supabase/`: migrations 0079 (comments stay on their task), 0080 (recurring receipts), 0081 (long ticket numbers survive a prefix change) and policy 0020 (edits need edit rights). **The next deploy applies them to production.**

**v0.50.0**, the phone revamp (§8), F-200, and "App updated" (off).

**v0.50.1**, board search: a query with no digit never matches a ticket.

**v0.51.0**, Home asks a browser that has not answered to turn notifications on; allowing also switches on the setting.

**v0.51.1**, the booking editor after publishing (§6.1).

**v0.52.0**, Report a bug:

- **Where.** From the user menu, About and the phone's More page. A category, what happened, and up to three screenshots, uploaded, dropped or pasted.
- **What it makes.** A task in the Bugs group of an ordinary private board, App development. The board is made by the first report and remembered by migration 0082's `workspaces.bug_board_id`.
- **Who has it.** Its one member, and every report's PIC, is danh.nguyen15@rmit.edu.vn, or the workspace owner where nobody has that address. Workspace admins see it too, as they see every board that is not the app's own.
- **Screenshots.** Stored by the server in the public `bug-screenshots` bucket under random names, and linked from three Screenshot columns.

**Tooling.** Snapshots, the rehearsal and `tickets:dedupe` connect without TLS to a database on this machine, and require it everywhere else. The sweep script is in the audit folder.

## 8. The phone

`MOBILE_AUDIT.md` has the audit, the plan, and a section on what v0.50.0 built.

**Built:**

- **Dialogs** rise from the bottom of the screen as sheets, capped at 92dvh, with a grabber and a 44 px close button. One change to the dialog and alert-dialog components gave every dialog that shape at once.
- **Search** fills the screen, with Cancel.
- **Popovers and menus** stay inside the screen and scroll inside themselves.
- **My Work** has a search box and a Filters sheet with every desktop filter, a count and Clear.
- **Settings** is a grouped list; each section opens as its own page, with Back.
- **Task cards**, after the owner's feedback: the name first; the status as a pill; the due date (red when late); the board. The priority shows only when it is high. On a board each card is its own box, edged in its group's colour. The task panel shows the status as a pill on every screen size.
- **Browse** has New board; the form editor keeps Save and Publish above the form.
- **Installable:** a web app manifest, icons, theme colours and Apple metadata. On an iPhone, the notification setting says to add Streamline to the Home Screen first, since Safari gives notifications only to installed web apps.
- **An offline bar.** Changes made offline wait and are sent when the connection returns.
- **Details:** bigger hit areas for switches, chips and small buttons; view selects at 16 px so iOS does not zoom; the permissions table and archive pager fit 360 px; a restore or wipe keeps the screen awake; the phone's Ticket switch, which did nothing there, is gone.

**Proven by:**

- **The sweep**, at 390 × 844, 360 × 780 and 844 × 390: no sideways scroll on any route.
- **`mobile-flows.spec.ts`** on a Pixel 7 profile with touch: the task panel's pill; an update written, edited, reacted to and deleted by touch; a status from a card; search; My Work search and filters; every settings section and back; a board made in landscape; the offline bar; the form editor; and a four-step booking.

**Left:** the dashboard's phone order (R-11), M-17, the composer above the keyboard, and a check on a real iPhone and Android.

## 9. Recommendations, in order

1. **After the deploy**, check that the build log lists the four SQL files as applied, that the Weekly review fires at its hour, and that editing an update still works.
2. **Fix the four open security findings** (F-117, F-127, F-165, F-180). Their detail is public in the history.
3. **After the next deploy, check Report a bug**: the build log lists 0082, the `bug-screenshots` bucket exists, and a report with a screenshot lands on App development. Decide whether admins should see that board (§7).
4. **Stop the public dashboard link polling in the background (F-119).** One idle wall screen can use a month's free egress.
5. **Fix the automation gaps:** F-114 (a depth mark on created tasks), F-115 (release stale claims and retry), F-113 (refusals as 4xx with the reason).
6. **Check the phone on real devices**, then build R-11.
7. **Close the test gaps.** Nothing tests the server routes, the SQL triggers and policies since 0040, or snapshots in a browser. Running `supabase-smoke.spec.ts` against a disposable stack in CI would catch the F-105 kind of bug.
8. **Mind the tooling traps.** `npm run test:e2e` starts `npm run dev`, whose `predev` migrates whatever `.env.local` names, production in the main checkout: run it with `SKIP_DB_MIGRATE=1`. `test:e2e:supabase` loads `.env.local` into the tests: run it only from the disposable worktree.

## 10. Housekeeping

- **The disposable stack** (`E:\WORK_OFFLINE\apps\_streamline_sbstack`, stopped) and its worktree (`_streamline_sb`) are kept for the held-back fixes. `NEXT_SESSION.md` §6 says how to use them.
- **The phone worktree** (`_streamline_mobile`), its branch `mobile-revamp` and its build are removed, and its server on `:3500` is stopped.
- **The next session** starts from `Test_prompts/audits/2026-09-26-full-e2e/NEXT_SESSION.md`.
