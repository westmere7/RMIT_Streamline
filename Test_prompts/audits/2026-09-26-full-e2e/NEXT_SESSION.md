# What is left after the 26 September audit

The first version of this file was a runbook for applying work that could not be run at the time. All of it has since been applied, run and committed: the fixes (v0.49.1), the SQL, the phone revamp (v0.50.0) and the documentation. `report.md` at the repository root says what happened. This file keeps only what is still to do.

## 1. After the deploy

The next Vercel build applies four SQL files to production (`prebuild` runs the migrator):

- `migrations/0079_comments_stay_put.sql`
- `migrations/0080_recurring_receipts.sql`
- `migrations/0081_rewrite_ticket_prefix_long_numbers.sql`
- `policies/0020_comments_update_needs_edit_rights.sql`

Then check:

1. The build log lists those four as applied, and nothing else.
2. A recurring rule fires at its next hour. The Weekly review recipe is the one in use. Before 0080 every recurring rule failed (F-105).
3. Editing your own update still works, and a reply still posts.

## 2. The four open security findings

F-117, F-127, F-165 and F-180 are open security findings. The current files name them in general terms, but their first, detailed wording is public in the history of `b91a73b`, so fix them first.

- Test the SQL one (F-127) on the disposable stack first (§6).
- Then write the fixes up in `FINDINGS.md`.

## 3. Open P2 findings

| ID | What | Next step |
| --- | --- | --- |
| F-113 | Booking refusals reach stakeholders as a generic server error | Return 4xx with the reason |
| F-114 | A task-creating rule chain can escape the depth limit | Put a depth mark on created tasks. Reproduce on the disposable stack first |
| F-115 | Claimed automation events that never finish stay claimed | Release stale claims at the start of each tick and retry |
| F-116 | Undo "Added X" still offered after more was added, and hard-deletes it all | A product decision: clear the offer on any later write, or archive rather than delete |
| F-118 | Restore semantics the person restoring cannot see | Show the skipped tables; don't replay pending automation work; narrow restore to one workspace before multi-workspace |
| F-119 | A public dashboard link in a background tab polls about 4.5 MB a minute | Poll only in the foreground, as the app itself does |

The P3 findings are in `FINDINGS.md`, most still open.

## 4. The phone

- **On devices.** Check one iPhone (Safari) and one Android (Chrome): installing to the home screen, notifications (on an iPhone only once installed), the keyboard over a composer, safe areas, dark mode.
- **R-11.** The dashboard's phone order and list forms of its workload tables.
- **M-17.** The portal's own sign-in hint and the wizard's offer can both show.
- **The composer above the keyboard.** `env(keyboard-inset-height)` where supported.
- **"App updated".** Built and off: Settings → Appearance turns it on for a device. To turn it on for everyone, change the default in `src/features/version/app-updated-card.tsx`.

## 5. Tests

- `board.spec.ts`: the drag-and-drop landing-slot tests flake (known since 8 September).
- F-122: four unit tests time out under load but pass alone. Raise their timeouts, or split the xlsx round trip.
- Nothing tests the `src/server` routes, the SQL triggers and policies since 0040, or snapshots in a browser. Running `supabase-smoke.spec.ts` against a disposable stack in CI would catch the F-105 kind of bug.

## 6. How to run things safely

- **Never from the main checkout against production.** Its `.env.local` points at production. Set `SKIP_DB_MIGRATE=1` for every `dev`, `build` and Playwright run there. `npm run test:e2e:deployment` writes to production.
- **The disposable stack.** Supabase CLI in `E:\WORK_OFFLINE\apps\_streamline_sbstack` (`npx supabase start`, `npx supabase stop`), and the worktree `E:\WORK_OFFLINE\apps\_streamline_sb`, whose `.env.local` reaches only that stack. Move the worktree to a commit with `git -C ..\_streamline_sb checkout --detach <sha>`. Run the app there with `SKIP_DB_MIGRATE=1 npx next dev --port 3300`, and `npm run test:e2e:supabase` only from there.
- **The local e2e suite without the dev server's lock.** Build with `SKIP_DB_MIGRATE=1 NEXT_PUBLIC_DATA_PROVIDER=local NEXT_DIST_DIR=.next-e2e npx next build`, serve it with `NEXT_DIST_DIR=.next-e2e npx next start -p 3500`, and point a copy of `playwright.config.ts` at `:3500` without its `webServer`. `next build` adds the dist folder to `tsconfig.json`; put that file back afterwards.
- **The phone sweep.** `node Test_prompts/audits/2026-09-26-full-e2e/mobile-sweep.cjs http://localhost:3500 <out> 390 844`, then at 360 × 780 and 844 × 390.
