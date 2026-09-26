## Environment

Recorded 26 September 2026 (Asia/Saigon).

| Field | Value |
| --- | --- |
| Git revision at start | `0649d71` on `main`; tree clean; `main` = `origin/main` |
| Package version | `0.49.0` |
| Node / npm | v22.14.0 / 10.9.2 |
| Next / React / TypeScript | 16.3.4 / 19.2.8 / ^5.9 |
| Vitest / Playwright | 4.1.11 / ^1.62.1 |
| OS | Windows 11 Pro 10.0.26200, i9-13900HX (32 threads), 96 GB RAM, Balanced power plan |
| Docker | Docker Desktop 29.7.2 (started for the audit), 32 CPUs / 50 GB available to it |
| Supabase CLI | 2.118.0, in `E:\WORK_OFFLINE\apps\_streamline_sbstack` |

## Environments used

| Env | State |
| --- | --- |
| **E1** unit | `npm run check` in the main checkout |
| **E2** local browser | Not reached before the session's tool block (see README) |
| **E3** disposable Supabase | Local stack, Postgres 17.6 (`public.ecr.aws/supabase/postgres:17.6.1.171`), with auth, rest, realtime, storage and kong. The Supabase dashboard, mail, edge runtime and analytics were switched off. Built from the repo by the fixed runner, then seeded and given its special columns. The app ran from worktree `E:\WORK_OFFLINE\apps\_streamline_sb` (detached at `0649d71` plus the runner and seed fixes) on port 3300, `.env.local` naming only `127.0.0.1` services, `AUTOMATION_SECRET=audit-local-runner-secret` |
| **E4** production | Two read-only queries early in the session: workspace, counts, members, snapshots, recent activity, heartbeat. A third was refused by the permission classifier ("Production Reads"). Nothing was written |

## Production state as read (for context only)

These facts come from those two early reads:

- **Workspace.** "RMIT VN MKT", slug `rmit`, ticket prefix `CP26`, counter **923**.
- **Contents.**
  - 9 boards, 1,036 items (969 live), 26 profiles and members, 8 teams (one named "7"), 2 trackers, 3,047 comments, 1 automation rule, 1 board template.
  - 3 people invited on 25 September through bookings: `nam.le@…`, `marcus.webb@…`, `linh.tran@…`.
- **Snapshots.** 5, including "Before real-world testing" (20,564 rows). On 25 September a wipe at 15:59:30Z was undone by restoring "Before wiping board data" at 15:59:58Z.
- **Repository.** `github.com/westmere7/RMIT_Streamline` is **public**. That matters for when `FINDINGS.md` is pushed (see the README).
- **Activity.** Only from test accounts in the last 7 days: `duc@`, `admin@`, `danh@rmit.local`.
- **Automation heartbeat.** Fresh: `2026-09-26T07:29Z`, minutes before the read.
- **Schema.** Latest applied migration `0078_requester_column_type` (25 September 16:52Z), so production was at the repo head.

## Safety

- **Local dev and builds.** Every dev/build command in the main checkout used `SKIP_DB_MIGRATE=1`.
- **Disposable database only.** The seed and all writes ran against the local stack only, from the worktree whose `.env.local` holds no production values.
- **Production.** No production writes.
