# End-to-end audit — 26 September 2026

## What this is

A plan for testing everything Streamline v0.49.0 does, and the passes through it:

- an inventory of every route, flow and edge case;
- the unit suite;
- a disposable Supabase stack built from the repository, where the server-side fixes were checked;
- the full browser suite, against a production build;
- a phone sweep of every route at three sizes;
- a static read of every area.

The audit found 100 defects and gaps (F-101 … F-200), plus 18 on the phone (M-01 … M-18). The fixes shipped in v0.49.1, the SQL moved into `supabase/`, and the phone revamp shipped in v0.50.0.

**Two passes.** About an hour into the first, the Claude Code auto-mode safety check began refusing every shell command, browser action and repository write, so everything that needed running was written down instead. Later the same day the tools were back and all of it was run: the fixes applied and tested, the SQL checked on the disposable stack, the browser suite run, the phone revamp built. Each file says which pass a result comes from.

## Environment

See `ENVIRONMENT.md`. Revision `0649d71` on `main` to start; Node 22.14.0; Next 16.3.4; Asia/Saigon.

| Env | Used for |
| --- | --- |
| E1 | Unit tests |
| E2 | The browser: the local suite against a production build, and the phone sweep |
| E3 | Disposable Supabase in Docker, reached through a separate worktree |
| E4 | Production (two read-only queries, in the morning) |

## Read in this order

| File | What it holds |
| --- | --- |
| `../../../report.md` | The report: what was asked, done, found and left |
| `AUDIT_PLAN.md` | The plan: environments and safety rules, personas, 187 test rows in 23 families, execution order, exit criteria |
| `FINDINGS.md` | F-101 … F-200 with evidence, location, consequence and where each fix stands |
| `MOBILE_AUDIT.md` | The phone: findings M-01 … M-18, the revamp spec, what v0.50.0 built, and how it was proven |
| `FIX_LOG.md` | The fixes as first prepared (FX-01 … FX-18) and where they stand now |
| `COVERAGE.md` | A status for every row of the plan, from both passes, without claiming a PASS on the strength of a test's name |
| `DOCUMENTATION_DRIFT.md` | Documents, comments, migration headers and on-screen text that no longer matched the code |
| `ENVIRONMENT.md` | Versions, environments, and production state as read |
| `NEXT_SESSION.md` | What is left to do, and how to run things safely |
| `mobile-sweep.cjs` | The phone-width sweep of every route |

## Findings at a glance

| ID | Title | Sev | Now |
| --- | --- | --- | --- |
| F-101 | Portal booking failed for a department with no requests yet, which is every department after a wipe | **P1** | Fixed, v0.49.1, checked on E3 |
| F-102 | A public booker could rename any member, and pull other accounts in as pending | **P1** | Fixed, v0.49.1, checked on E3 |
| F-103 … F-107 | Requester patterns, comments moved between tasks, recurring rules failing, "column cleared" on Supabase, long ticket numbers | P2 | Fixed; F-104, F-105 and F-107 by the SQL; all checked on E3 |
| F-108, F-109 | An empty database could not be built; the seed crashed | P2 | Fixed, v0.49.1 |
| F-110 … F-121 | Kanban lanes, phone dates and search fixed; 500s, automation loops and stuck claims, undo, an abuse guard, restore semantics and background polling open; hover-only controls and stale documentation fixed | P2 | 6 fixed, 7 open (see `FINDINGS.md`) |
| F-122 … F-199 | Minor | P3 | 7 fixed, the rest mostly open |
| F-200 | UI preferences reset on every reload | P2 | Fixed, v0.50.0 |
| M-01 … M-18 | The phone | P1–P3 | 15 fixed, M-13 checked, M-11 in part, M-17 open |

## The public repository

The repository is public. Four findings are still open security issues: F-117, F-127, F-165 and F-180. The files here describe them in general terms, but the first version of this folder, pushed with commit `b91a73b`, has their detail in its history. Fix them first.
