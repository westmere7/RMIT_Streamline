# Full operations audit — 9 September 2026

## What this is

An evidence-based audit of RMIT Streamline against
`Test_prompts/2026-09-09-full-operations-audit-prompt.md`, with the confirmed
defects fixed and pinned by regression tests.

It is a **scoped pass, not the whole brief.** Two constraints shaped it, both
recorded rather than worked around:

1. **No disposable Supabase project.** `.env.local` points at production, and §2
   forbids mutation, denial and destructive testing there without authorization
   for that target. Every RLS-enforcement, multi-session-auth and realtime case
   is therefore **BLOCKED**, and a local-provider pass is never recorded as a
   substitute.
2. **The machine was in low-performance power mode.** A full 222-test Playwright
   run produces timeouts rather than evidence — demonstrated: `board-service >
   deleting a team` exceeds its own 30-second limit and does so identically on
   pre-audit code. The run was scoped to **one spec per family from the brief**,
   107 tests, so every criterion has a real execution status.

## Environment

See `ENVIRONMENT.md`. Revision at the start of the audit:
`811aa78`, branch `main`, Node 22.14.0, Next 16.3.4, timezone Asia/Saigon,
D0 = 2026-09-09.

## Read in this order

| File | What it holds |
| --- | --- |
| `AUDIT_REPORT.md` | Readiness, what was found, what was fixed, what remains |
| `FINDINGS.md` | Six findings with reproduction, root cause and status; plus a verdict on all twelve items of the brief's §7 risk register |
| `FIX_LOG.md` | Root cause, files, before-fix failure, recheck, neighbouring regressions, blockers |
| `COVERAGE.md` | Every OPS chapter and every edge-case family, with a status and a reason |
| `DATA_RECONCILIATION.md` | Independently computed expectations against actual figures |
| `PERFORMANCE.md` | Measurements, with the caveat about power mode stated |
| `DOCUMENTATION_DRIFT.md` | Claims that did not match the code, including one comment that described the opposite of its own function |
| `CLEANUP.md` | What was created (nothing) and what was touched in production (read-only) |

## Findings at a glance

| ID | Title | Class | Sev | Status |
| --- | --- | --- | --- | --- |
| F-001 | Deactivating a member does not stop them signing in or reading their boards | BUG | **P1** | FIXED (TypeScript) · policy layer VERIFICATION BLOCKED |
| F-003 | A public board or item link publishes a staff directory | BUG | P2 | FIXED AND VERIFIED |
| F-004 | A tracker edit is silently discarded if you leave within 600 ms | BUG | **P1** | FIXED AND VERIFIED |
| F-005 | Delivery reliability cannot be measured at all | FEATURE GAP | P2 | DEFERRED — metrics withdrawn rather than faked |
| F-006 | Cover and avatar images are public whatever the board's permissions | UNVERIFIED RISK | P3 | DEFERRED PRODUCT DECISION |
| F-002 | `0001` policy grants EDITOR where the app grants VIEWER | DOC DRIFT | n/a | RESOLVED — superseded by `0008` |

## Reproducing the fixes

```bash
npx vitest run tests/unit/audit-regressions.test.ts tests/unit/components/tracker-flush.test.tsx
```

Eleven tests. To see them fail on the pre-fix code, check out
`src/lib/permissions/permissions.ts`, `src/domain/board/board-share.ts` and
`src/features/trackers/hooks.ts` at `811aa78` and run the same command: six
fail, five pass. That run is kept at `artifacts/before-fix-failures.log`.

## One thing that is not applied

`supabase/policies/0014_membership_precedes_ownership.sql` is written and
**not applied**. It reorders `private.board_role()` so the database enforces
F-001 as well as the application. Applying it needs a database; the only one
configured is production, and an audit does not change its schema. It is a
`create or replace function`, so it is idempotent and reversible by re-running
`0008`, and it touches no table.
