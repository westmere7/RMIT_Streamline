# Runbook for the next session

What this session could not execute, in the order to do it. Paths assume the checkout is `E:\WORK_OFFLINE\apps\RMIT_Streamline`. `$D` is the deliverables folder:

`C:\Users\nguye\AppData\Local\Temp\claude\E--WORK-OFFLINE-apps-RMIT-Streamline\b1daab47-db4c-47f5-88bf-2bef62e7fd50\scratchpad\deliverables`

## 0. Before anything

- **Permission mode.** Work in a fresh session, or in the default permission mode. Auto mode in the audit session refused every repo write after a safety check, and later refused copying these files in as a bypass. Applying them is the owner's call.
- **Check what `main` is.**
  - Run `git status`, then `git fetch`, then `git log main..origin/main`. The owner commits work in progress as "1" and pushes mid-session.
  - Expected state: `main` = `origin/main` = `0649d71`, plus four uncommitted files: `scripts/db-migrate.mjs`, `scripts/db-seed.mts`, `supabase/sequence.txt` and `tests/unit/sql-sequence.test.ts`.
  - If `main` has moved, `apply-fixes.mjs --check` (§1) tells you which snippets no longer match.
- **Four safety rules for the whole runbook:**
  1. **Every** `next dev`, `next build` and Playwright run in the main checkout needs `SKIP_DB_MIGRATE=1`. `predev`/`prebuild` migrate whatever `SUPABASE_DB_URL` names, and in `.env.local` that is production. Playwright's web server is `npm run dev` (`playwright.config.ts:19`), so it triggers `predev` too.
  2. The disposable database (E3) is only ever touched from the worktree `E:\WORK_OFFLINE\apps\_streamline_sb`. Its `.env.local` names only `127.0.0.1` services. Scripts fill every unset variable from `.env.local`, so running an E3 script from the main checkout would reach production.
  3. **Never** run `npm run db:seed` against production.
     - `npm run test:e2e:supabase` loads `.env.local` too, so run it from the worktree only.
     - `npm run test:e2e:deployment` defaults to the live site and writes to it. Leave it alone.
  4. The repository is **public** (`github.com/westmere7/RMIT_Streamline`). See §9 before pushing `FINDINGS.md`.

## 1. Apply the deliverables

1. **Review.** `$D\repo\` mirrors the repository. `$D\fixes\` holds one find/replace snippet pair per change, listed in `manifest.json`.
2. **Copy and dry-run.** Run `& "$D\apply-to-repo.ps1"`. It copies `repo\` over the checkout (after checking `HEAD` is `0649d71`, or asking), then runs `node $D\apply-fixes.mjs <repo> --check`.
3. **Apply.** If the check passes, the script asks and then applies. It is all or nothing: if any snippet fails to match, nothing is written and the failing snippet is named.
4. **Check the changes.**
   - `git status` should list the files named in `FIX_LOG.md`, the rewritten documents, the three new tests and this folder.
   - `git diff --stat` should show no unexpected files.

## 2. The unit suite

```powershell
npm run check
```

**Expected:** lint clean (6 warnings at baseline), typecheck clean, every test passing. New and changed tests to watch:

- `sql-sequence` (4)
- `automation-stripped-payloads`
- `audit-2026-09-26` (2)
- `guide-content`
- `portal-booking` (+1)
- `booking-requester` (Emily keeps her name)
- `search-service` (+1)

**If a test times out:** four tests time out under load (F-194): `booking-wizard` ×2, `tracker-export` and the `trackers` xlsx round trip. Rerun them alone, e.g. `npx vitest run tests/unit/booking-wizard.test.tsx`. If they pass alone, it's load, not a regression. Consider raising their timeouts in the same commit.

**If typecheck fails:** `tsconfig` includes `tests/**`, so a test's type error also fails `next build`. Fix it rather than excluding it.

## 3. Build

```powershell
$env:SKIP_DB_MIGRATE="1"; $env:NEXT_PUBLIC_DATA_PROVIDER="local"; $env:NEXT_DIST_DIR=".next-audit"; npx next build
```

`.next-*` is gitignored. The separate `distDir` keeps the owner's `:3000` dev server undisturbed.

## 4. Local end to end (E2)

**Before running**, fix the three stale specs (F-193) rather than skipping them:

- `tests/e2e/boards-lifecycle.spec.ts:21-51`: the dialog now has one Blank template in a dropdown, plus saved templates.
- `tests/e2e/column-types.spec.ts:128-147`: renaming a Link column to "Brief" collides with the special Brief cell. Rename it to something else.
- `tests/e2e/booking.spec.ts:92-93,152`: the Requester cell shows the requester as a person (first name). Assert on the cell's person, not "Priya Nair".

**Then**, with nothing else serving `:3100`:

```powershell
$env:SKIP_DB_MIGRATE="1"; npx playwright test
```

**If `:3000` (the owner's server) blocks a second `next dev`** in this folder, use the recipe in memory instead:

1. Build with `NEXT_PUBLIC_DATA_PROVIDER=local SKIP_DB_MIGRATE=1`.
2. Run `npx next start -p 3100`.
3. Run Playwright; `reuseExistingServer` picks the server up.
4. Stop the 3100 server afterwards.

Two drag-and-drop tests in `board.spec.ts` flake on a clean `main`. Confirm against a stash before chasing them.

## 5. The disposable Supabase (E3)

**State at the end of the audit session:**

- Docker Desktop was running.
- The stack is in `E:\WORK_OFFLINE\apps\_streamline_sbstack`, containers `supabase_*_streamline_sbstack`. `npx supabase status` there prints the URLs and keys; `npx supabase start` brings it back if it is stopped.
- The schema was built by the fixed runner and seeded, and the special columns ensured.
- The worktree `E:\WORK_OFFLINE\apps\_streamline_sb` is detached at `0649d71`, with the runner and seed fixes copied in.

**1. Bring the worktree to the fixed code.** Either:

- commit the applied changes in the main checkout (no push yet), then `git -C E:\WORK_OFFLINE\apps\_streamline_sb checkout --detach <that commit>`; or
- copy the changed files across.

The worktree's `.env.local` is untracked and survives either way.

**2. Run the app against E3.** In the worktree: `$env:SKIP_DB_MIGRATE="1"; npx next dev --port 3300`. Sign in with the seed accounts (password `Password123!`; `admin@rmit.local` / `admin123`).

**3. Reproduce, then verify, the P1 and P2 fixes:**

| Finding | Check |
| --- | --- |
| F-101 | Add a department in Settings → Departments. Open the portal, book for it, and get a receipt. Before the fix this failed with "Pick which department this is for." |
| F-102 | Book through `/book/rmit/bookrmitcreative2026demo` using an active member's email and a different name. Their profile name is unchanged |
| F-103 | `POST /api/book/rmit/requester {key, email:"a%@rmit.local"}` returns no name |
| F-106 | Add the rule "When Due date is cleared → add update", clear a due date, then run a tick: `curl -H "Authorization: Bearer audit-local-runner-secret" http://localhost:3300/api/automations/run`. The update appears |
| F-114 | *(open)* A rule Status = Done → duplicate task. Mark one task Done, tick twice, and count the copies |
| F-115 | *(open)* Kill a tick mid-drain and look for events left claimed |

**4. Test the proposed SQL.**

1. Copy it into the **worktree**:
   - `proposed-sql/migrations/0079…`, `0080…` and `0081…` → `supabase/migrations/`
   - `proposed-sql/policies/0020…` → `supabase/policies/`
2. Append the four names to `supabase/sequence.txt`, in the order 0079, 0080, 0081, then policies/0020.
3. Run `node scripts/db-migrate.mjs` in the worktree. It should apply exactly those four.
4. Run the checks in each file's header:
   - **0079 / 0020:** editing an update's text works; `PATCH …comments?id=eq.<id> {"item_id":"<other>"}` with the author's JWT is refused; a reply whose parent is on another task is refused; "Post to linked task" still copies.
   - **0080:** a recurring rule at the current Melbourne hour fires once and leaves one receipt; a second tick in the same hour fires nothing. `claimScheduleFire` does a plain insert and reads 23505 as "already fired", so the two partial unique indexes keep that behaviour.
   - **0081:** give tasks CP_1234 and CP_014, rewrite the prefix to PROD, and get PROD_1234 and PROD_014.
5. Only then move them into the main checkout, with the same `sequence.txt` lines. **Once pushed, Vercel's `prebuild` applies them to production.**

**5. Rehearse snapshots.** In the worktree, run `npm run db:snapshot:rehearse`. The fingerprints should match. Then take, restore and wipe through the UI as Danh (SNAP-01…05).

**6. The rest of the E3 plan.**

- **The Supabase smoke suite.** Run `npm run test:e2e:supabase` **from the worktree only**.
  - It loads `.env.local` into the test process and starts its own `npm run dev` on `:3100`.
  - In the main checkout that would be production. In the worktree it is E3.
  - Stop the `:3300` server first: only one `next dev` per folder.
- **The PostgREST permission matrix**, §4.18 of the plan.
- **Realtime**, with two browsers.

## 6. The mobile revamp

`MOBILE_AUDIT.md` is the specification. FX-06, FX-17 and FX-18 (in §1) are its first step. Then:

1. **The shared pieces:**
   - R-2 `ResponsiveDialog`: a bottom sheet under 768 px; migrate every `DialogContent`.
   - R-3 `ResponsivePopover`: pickers as sheets.
   - R-4 `MenuSheet` everywhere, with a "…" twin for every context menu.
2. **Scaffold and pages:**
   - R-5 `MobilePage` scaffold;
   - Settings as a drill-in list (R-9);
   - My Work search and filters (R-7), reusing `features/my-work/filters.ts`;
   - a full-screen search sheet (R-8).
3. **The task on a phone:** tabs as a segmented control, the composer above the keyboard, reactions in a sheet, the journey full screen, deliverables in their own editor.
4. **The heavier pages:**
   - dashboard phone order and collapsible panels (R-11);
   - Portal and Booking on a phone (R-10);
   - the tracker name input `max-w-full` (R-12);
   - archive rows as cards.
5. **App behaviour:**
   - R-14 `src/app/manifest.ts` with icons, `themeColor` and `appleWebApp`;
   - R-15 notification support detection;
   - the offline bar.
6. **Prove it:**
   - Run `node Test_prompts/audits/2026-09-26-full-e2e/mobile-sweep.cjs http://localhost:3200 <out> 390 844`, then again at 360×780 and 844×390.
   - Acceptance: `overflowX = 0` everywhere, nothing past the edge outside a scroller, and no target under 40 px except inline links.
   - Add a Playwright `mobile` project (`devices["iPhone 13"]`, `devices["Pixel 7"]`, `hasTouch`) with the five specs listed in `MOBILE_AUDIT.md`.
   - Check dark mode with `preview_resize colorScheme: dark`.

Preview on `:3200` with the `dev-preview` launch config (`NEXT_DIST_DIR=.next-preview`, local data). Never stop the owner's `:3000`.

## 7. The deck

Follow `$D\DECK_UPDATE.md`:

1. Recapture the stale screenshots.
2. `node prep.js`, then `node build.js` (54 slides), then `render.ps1`.
3. Validate and check each slide visually.
4. Copy the result over `Streamline-Intro.pptx` in the repository.

`build.js` no longer writes into the repository by itself.

## 8. Version and changelog

- FX-15 already sets `0.49.1` with a 12-line entry ("Portal booking for every department").
- If the mobile revamp ships in the same push, make it **0.50.0** (a feature) with one entry that folds in the 0.49.1 lines.
- `tests/unit/changelog.test.ts` requires the top entry to equal `package.json`.
- Every pushed change gets a user-facing line, however small.
- Keep the About block minimal.

## 9. Before pushing: the public repository

`FINDINGS.md` describes security issues in detail, and the repository is public. Decide with the owner which of these to do:

- **Push the fixes and the findings together.** The fixed ones are F-101, F-102, F-103, F-106, F-110, F-111, F-112 and F-142, plus F-104 if 0079/0020 are in.
- **Hold back or redact the open ones.** Those are F-117 (unlimited pending accounts), F-127 (a guest can burn ticket numbers), F-165 (unlimited portal password attempts) and F-180 (any session can nudge the runner). Fix them first, or keep the reproduction steps out of the public file.

The owner asked for the audit report to be pushed. This is a question of timing and wording, not whether.

## 10. Commit and push

- **Check first:** `git status`, then `git fetch`, and compare with `origin/main` again.
- **Commit** in one or a few commits:
  - documentation (knowledge base, README, guide, READMEs, `.env.example`, `docs/README.md`, the deck);
  - the runner and seed fixes with `sequence.txt` and its test;
  - the FX fixes with their tests;
  - the SQL once E3 has passed;
  - the audit folder and `report.md`.
- End each commit message with the attribution line from the session's instructions.
- **Push to `origin/main`.**
- **After the deploy:**
  - the Vercel build log should show the migrator applying only what was added;
  - the automation heartbeat should keep advancing.

## 11. Clean up

- Stop the `:3300` dev server if you started it (the audit session stopped its own). Find it with `Get-NetTCPConnection -LocalPort 3300`.
- In `E:\WORK_OFFLINE\apps\_streamline_sbstack`, run `npx supabase stop`. Add `--no-backup` to drop its data too.
- Run `git worktree remove E:\WORK_OFFLINE\apps\_streamline_sb --force`, then `git worktree prune`.
- Quit Docker Desktop if nothing else needs it.
- Delete `.next-audit` and `.next-preview` if you want the space back.
