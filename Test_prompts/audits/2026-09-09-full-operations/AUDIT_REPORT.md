# Audit report — RMIT Streamline, 9 September 2026

## Readiness

**Ready for routine team use on the local provider. Not certified for the
Supabase deployment by this audit** — not because anything failed there, but
because nothing could be tested there. Read that distinction carefully: it is
the most important sentence in this report.

| Environment | Assessment |
| --- | --- |
| Local provider (demo / IndexedDB) | **Ready.** Daily operations exercised through the UI; three defects found and fixed. |
| Supabase (production at `rmit-streamline.vercel.app`) | **Unverified.** No disposable project exists, and §2 forbids mutation testing against production. Every RLS-enforcement, multi-session-auth and realtime case is BLOCKED. One P1 defect (F-001) is fixed in the application layers and its database layer is written but **not applied**. |

## P1 blockers found

Both are fixed and pinned by tests that fail on the code before the fix.

**F-001 — deactivating a member does not stop them.** The Members dialog
promises they cannot sign in. Under Supabase, nothing enforced it: no Auth ban,
no session revocation, and the Supabase auth provider never read
`deactivatedAt` — only the local provider did, so the guarantee held in the demo
and not in production. Once signed in, both `boardRoleFor()` and
`private.board_role()` answered ownership and an explicit board seat *before*
checking active membership, so a departed colleague kept full OWNER on every
board they had created.

This is the audit's headline. Offboarding is the control an organisation relies
on, and it did not reach the data.

**F-004 — a tracker edit is silently discarded.** The unmount cleanup called
`clearTimeout` under a comment saying it flushed. Type in a cell, switch sheet
within 600 ms, and the edit is gone with the value still on screen as you leave.
Silent, routine, and attributable to nobody.

## The most consequential gaps

1. **No task lifecycle events (F-005).** Completion, throughput, cycle time and
   on-time delivery are all unmeasurable, and the dashboard used to show an
   "On time" percentage built on `item.updatedAt`. The metrics were withdrawn
   rather than left plausible. Fixing this needs an append-only `task_events`
   table and a retained committed deadline.
2. **Backend enforcement is unproven.** Not "probably fine" — untested. The
   policies read correctly, and reading is not evidence.
3. **Public storage objects (F-006).** Covers and avatars are public whatever
   the board's permissions; access cannot be revoked. Deliberate, bounded by
   UUID paths, recorded for a product decision.

## Fixed and verified

| ID | What | Verified how |
| --- | --- | --- |
| F-001 (app layers) | Deactivation refused at sign-in and on session restore; membership precedes ownership in `boardRoleFor()` and `canDeleteBoard()` | 8 unit assertions, 3 of which fail on pre-fix code |
| F-003 | Public board/item links publish a name and a face, nothing else | 3 unit assertions, 2 of which fail on pre-fix code; one asserts the *key set*, so the pattern cannot return |
| F-004 | A pending tracker save runs on unmount instead of being cancelled | 3 unit assertions, 1 of which fails on pre-fix code |

## Fix implemented — verification blocked

| ID | What | Blocker |
| --- | --- | --- |
| F-001 (database layer) | `supabase/policies/0014_membership_precedes_ownership.sql` reorders `private.board_role()` | No disposable database. Production is the only one configured, and an audit does not change its schema. Idempotent (`create or replace function`), reversible by re-running `0008`, touches no table. |

## Open, deferred by product decision

| ID | What | Why deferred |
| --- | --- | --- |
| F-005 | Delivery reliability unmeasurable | Needs new event capture; specified, not invented |
| F-006 | Public cover/avatar objects | Signed URLs cost a request per image and break caching; the trade is the owner's to make |

## Risk register (§7) — all twelve answered

Three cleared, four confirmed, two documented limitations, one blocked, two
documentation items. Full table in `FINDINGS.md`. Worth surfacing:

- **#9, the global client override: safe.** All four call sites pass the same
  cached, stateless admin singleton, so concurrent privileged requests cannot
  contaminate one another. The residual is that nothing *prevents* a future call
  site passing a user-scoped client — a P3 hardening candidate, not a defect.
- **#1, missing portal views: closed.** The portal now renders a synthetic board
  with all seven views and the real item panel. Realtime is still polling.
- **#12, drift: real, including one comment that described the opposite of its
  own function** — and that comment is why F-004 survived review.

## Test scope, exactly

| Suite | Scope | Result |
| --- | --- | --- |
| Typecheck | whole repo | Clean |
| Lint | whole repo | 0 errors, 1 pre-existing warning |
| Unit / component | whole suite | 454 pass, 1 environmental timeout (`board-service > deleting a team`, fails identically on pre-audit code) |
| E2E family slice | 107 tests, one spec per brief family, local provider | **82 passed, 25 failed — and every one of the 25 is environmental.** 24 are `Test timeout of 30000ms exceeded` with no assertion reached; the 25th is `large-board`'s fixture builder failing to produce its 300 items under load (`expect(built.items).toBe(300)`). **Zero behavioural assertion failures.** |
| E2E full suite (222) | — | **NOT RUN.** Low-performance power mode; a full run yields timeouts, not evidence |
| `supabase-smoke` (17) | — | **BLOCKED.** Needs the Supabase provider |
| `deployment-smoke` (5) | — | **NOT RUN**, deliberately: it targets the live Vercel URL and writes |

No Supabase certification is implied by any local pass in this report.

## Residual risk

- Backend authorization is unproven end to end. If one thing gets a disposable
  Supabase project next, it should be this.
- The connected OPS narrative was exercised through existing specs rather than
  as one story over one purpose-built fixture set, so cross-chapter state
  (a request surviving allocation, completion and reporting as the same record)
  was not observed continuously.
- XLSX export is asserted with the library that writes it — not independent
  evidence of interoperability.
- A 1,000-item board and >200 linked ids were not measured on this machine.
- **The e2e slice's 25 failures are attributed to power mode on the evidence of
  their shape** — all timeouts, no assertions — rather than by re-running each
  one on a fast machine. That attribution is a judgement, not a measurement, and
  a clean run when the laptop is back at full speed would settle it.

## Links

`README.md` · `FINDINGS.md` · `FIX_LOG.md` · `COVERAGE.md` ·
`DATA_RECONCILIATION.md` · `PERFORMANCE.md` · `DOCUMENTATION_DRIFT.md` ·
`CLEANUP.md` · `artifacts/`

Regression tests: `tests/unit/audit-regressions.test.ts`,
`tests/unit/components/tracker-flush.test.tsx`.
Changed code: commit `ec57059`.
