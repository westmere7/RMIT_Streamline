# Data reconciliation — 9 September 2026

Expected values computed independently of the production aggregation, as §3
requires: the assertions below do not call the same function the application
calls and then declare agreement.

---

## 1. The brief's asset arithmetic

§4 fixture R1: A2 posters ×3, social tiles ×5, hero video ×1 — "three
deliverable lines and nine units".

| Claim | Where asserted | Result |
| --- | --- | --- |
| One task, three lines, nine units | `tests/unit/item-assets.test.ts`, `dashboard-analytics.test.ts` | **PASS** |
| Intake lines are requests, not delivery — allocation must not report 18 units | `dashboard-analytics.test.ts` ("Intake lines: requests, not delivery. Must never count as assets delivered", asset `as6` ×200 on the intake board) | **PASS** — the 200-unit intake line is excluded from delivered assets |
| A linked pair counts once | `dashboard-analytics.test.ts` (`a2` mirrored as `b2`, counted under the earlier copy) | **PASS** |
| Task counts by asset type are not additive | `dashboard-metrics.test.ts` ("measures asset types in units") — one task, three types, nine units; rows sum to 9, task total stays 1 | **PASS** |

## 2. Year comparison

§ dashboard brief fixture: 120 tasks / 400 units this year against 100 / 320.

| Expected | Actual | Result |
| --- | --- | --- |
| +20 tasks, +20 % | +20, +20 % | **PASS** |
| +80 units, +25 % | +80, +25 % | **PASS** |
| Monthly rows sum back to both headlines | 120 and 100 | **PASS** |
| No history → "Unavailable", not 0 | `comparison: null`, `percent: null` | **PASS** |
| True zero baseline → difference, no percentage | `delta: 12, percent: null` | **PASS** |
| Leap day → 29 Feb clamps to 28 Feb | `2028-02-29` → `2027-02-28` | **PASS** |

Computed by hand in the test fixture and compared against `volumeReport`, which
is the code under test — not against a second call to itself.

## 3. Live workspace, internal against public

Read today from the running application, production data, read-only.

| Figure | Internal dashboard | Public link (`/dashboard/<token>`) | Result |
| --- | --- | --- | --- |
| Tasks, 2026 to 9 Sep | 483 | 483 | **Reconciles** |
| Asset units, same period | 11,959 | 11,959 | **Reconciles** |
| Open and overdue (as of now) | 128 | 128 | **Reconciles** |
| Awaiting allocation | 10 | *absent* | **Correct** — owner-derived, withheld from a public link |
| Resourcing tab | present | *absent* | **Correct** — individual workload is not published |
| People named in the payload | yes | **none** | **Correct** |

## 4. Portal scope

| Rule | Where asserted | Result |
| --- | --- | --- |
| A department sees labelled tasks *and* its bookings, each once | `portal-scope.test.ts` | **PASS** |
| A linked pair lists once, booked side preferred | `portal-scope.test.ts` | **PASS** |
| Subitems, archived work and cleared labels are excluded | `portal-scope.test.ts` | **PASS** |
| Relabelling moves a task between departments | `portal-scope.test.ts` (added today) | **PASS** |
| A labelled task has no brief, and never borrows `items.description` | `portal-scope.test.ts` | **PASS** |
| Departments stay isolated; another department's task is refused *by id* | `portal-scope.test.ts` | **PASS** |

## 5. Row-count integrity, measured against the database

Earlier today, against production, read-only:

| Check | Expected | Before | After |
| --- | --- | --- | --- |
| Stakeholder label values returned by `listValuesByColumns` | 1,240 (direct SQL count) | **1,000** — silently truncated at PostgREST's cap | 1,240 |
| `listValuesByBoard` per board, 11 boards | matches SQL count per board | matches | matches |

The 1,000 was not an error anywhere: PostgREST returns a short answer and says
nothing. Roughly a fifth of labelled tasks were missing from their department's
portal, chosen arbitrarily by whatever order the database returned.

## 6. Not reconciled

- **A purpose-built fixture manifest** (R1/R2/R3 with recorded ids, two
  workspaces with colliding names, a password-protected second portal) was not
  built. The existing seed plus unit fixtures were used instead. Consequence:
  the connected OPS narrative was exercised through existing specs rather than
  as one story over one dataset, and cross-chapter state was not preserved.
- **Notification counts and read markers** across two real sessions.
- **XLSX round-trip against an independent reader.** The export is asserted with
  the same library that writes it, which is not independent evidence.
