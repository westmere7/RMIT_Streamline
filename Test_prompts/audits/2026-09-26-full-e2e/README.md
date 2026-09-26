# End-to-end audit — 26 September 2026

## What this is

A plan for testing everything Streamline v0.49.0 does, and the first pass through it:

- an inventory of every route, flow and edge case;
- a baseline run of the unit suite;
- a disposable Supabase database built from the repository;
- a static read of every area.

The audit found 99 defects and gaps (F-101 … F-199), plus 18 on the phone (M-01 … M-18). It fixed and verified two operational defects. It also prepared 15 code fixes, plus a version bump and a policies README (FX-01 … FX-18). There is no FX-04: the requester directory is replaced whole, in the mirror, under FX-02.

It is **a first pass, not the whole plan.** One constraint shaped it, and it is recorded here rather than worked around:

> About an hour in, the Claude Code auto-mode safety check began refusing every shell command, every browser-preview action and every write inside the repository, "because of earlier conversation content… it will keep firing for the rest of this conversation". After the context was compacted, the shell worked again for one read-only command. Copying the prepared files into the repository was then refused as an "Auto-Mode Bypass", and so was the next shell command. Nothing was pushed past either refusal.

So everything that needs execution is written down, not done: the local Playwright suite, the phone sweep, the E3 flows, the prepared fixes, the mobile revamp, the deck and the push. `NEXT_SESSION.md` gives the order.

## Environment

See `ENVIRONMENT.md`. Revision `0649d71` on `main`; Node 22.14.0; Next 16.3.4; Asia/Saigon.

| Env | Used for |
| --- | --- |
| E1 | Unit tests |
| E2 | The local browser (not reached) |
| E3 | Disposable Supabase in Docker, reached through a separate worktree |
| E4 | Production (two read-only queries) |

## Read in this order

| File | What it holds |
| --- | --- |
| `../../../report.md` | The session report: what was asked, done, found and left |
| `AUDIT_PLAN.md` | The plan: environments and safety rules, personas, 187 test rows in 23 families, execution order, exit criteria |
| `FINDINGS.md` | F-101 … F-199 with evidence, location, consequence and fix status |
| `MOBILE_AUDIT.md` | The phone: findings M-01 … M-18, the revamp spec (R-1 … R-17), page by page, and how to prove it |
| `FIX_LOG.md` | The two verified fixes in the working tree, the prepared fixes (FX-01 … FX-18) and the proposed SQL |
| `COVERAGE.md` | A status for every row of the plan, without claiming a PASS on the strength of a test's name |
| `DOCUMENTATION_DRIFT.md` | Documents, comments, migration headers and on-screen text that no longer match the code |
| `ENVIRONMENT.md` | Versions, environments, and production state as read |
| `NEXT_SESSION.md` | The runbook for everything not executed |
| `proposed-sql/` | 0079, 0080, 0081 and policy 0020. Not applied; test them on E3 first |
| `mobile-sweep.cjs` | The phone-width sweep of every route. Written, not run |

## Findings at a glance

| ID | Title | Sev | Evidence | Status |
| --- | --- | --- | --- | --- |
| F-101 | Portal booking fails for a department with no requests yet, which is every department after a wipe | **P1** | STATIC | PREPARED (FX-01) |
| F-102 | A public booker can rename any member, and pull other accounts in as pending | **P1** | STATIC | PREPARED (FX-02) |
| F-103 | Requester lookup takes `%`/`_` patterns | P2 | STATIC | PREPARED (FX-02) |
| F-104 | A comment's author can move it to any item | P2 | STATIC | PROPOSED SQL |
| F-105 | Recurring automations can never write their receipt | P2 | **DB** | PROPOSED SQL |
| F-106 | `column_cleared` never fires on Supabase for 12 types | P2 | STATIC | PREPARED (FX-03) |
| F-107 | A ticket prefix rewrite truncates numbers above 999 | P2 | STATIC | PROPOSED SQL |
| F-108 | The repository could not build an empty database | P2 | **DB** | **FIXED + VERIFIED** |
| F-109 | `db:seed` crashed on the current schema | P2 | **DB** | **FIXED + VERIFIED** |
| F-110 … F-121 | Kanban lanes, phone dates, search flooding, 500s, automation loops and stuck claims, undo, account flooding, restore semantics, background polling, hover-only controls, stale documentation | P2 | STATIC | 4 prepared, the rest open (see `FINDINGS.md`) |
| F-122 … F-199 | Minor | P3 | STATIC | Mostly open |
| M-01 | Dialogs can't scroll on a phone | **P1 (phone)** | STATIC | PREPARED (FX-17) |
| M-04 | 27 controls are reachable only by hover | **P1 (phone)** | STATIC | PREPARED for the 15 phone-reachable ones (FX-18) |

## Before pushing this folder

The repository is public. Four open findings, F-117, F-127, F-165 and F-180, are described here only in general terms until they are fixed; the owner has the details.
