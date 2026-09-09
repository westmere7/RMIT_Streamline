# Dashboard revision — implementation report

9 September 2026. Companion to `dashboard-revision-note.md`, which was written
before any code changed and records what was verified in the source first.

## 1. What changed, and which decision it serves

| | Change | Decision it supports |
| --- | --- | --- |
| **Kept** | Task and asset-unit counts, prominent and side by side | "How much are we handling, and how does that compare?" |
| **Kept** | Year-over-year comparison, strengthened | The same question, reported upwards |
| **Kept** | Team filter, drill-down routes, themes, refresh, full screen | Unchanged habits |
| **Revised** | "Assets delivered" → **Asset units**, with the period and date basis stated | The old label counted unfinished assets as delivered |
| **Revised** | Comparison now matches *ranges*, not year numbers | Stops a partial year reading as a decline against a whole one |
| **Revised** | Department from the typed STAKEHOLDER cell + registry | A renamed department stays one row; column-name guessing is marked `inferred` |
| **Revised** | One page of eleven panels → **Overview / Demand & Delivery / Resourcing** | Each meeting gets its own page |
| **Replaced** | People ranking → **Assigned workload** | Allocation needs everybody, including the people with nothing on |
| **Removed** | Completion date basis, on-time rate | Neither has a trustworthy input (§3) |
| **Removed** | 60% / 75% "healthy" thresholds, generic people/board headline totals | Undefined judgements in headline space |
| **Added** | **Current operations** strip, as of today, independent of the filter | A historical filter must not hide today's overdue work |
| **Added** | **Attention needed**, with the reason for each row | "What must I decide about this morning?" |
| **Added** | Coverage notes beside the figures | A report over half-undated work is a different document |
| **Rebuilt** | Public payload as a field-by-field allowlist; no Resourcing tab | A public link must not carry individual workload |
| **Moved** | Preferences to per user + per workspace | Two people on a machine no longer inherit each other's filters |

## 2. Metric definitions

In `src/features/dashboard/metrics.ts`, next to the code, and summarised in
`KNOWLEDGE_BASE.md` §13b. Entity, unit, date basis and exclusions are stated for
each. The two rules that shape the rest:

- **A period is a range of days.** Year-to-date compares 1 January → today
  against 1 January → the same day of the comparison year; 29 February clamps to
  the 28th in a common year; an unfinished chosen year is labelled partial
  actuals.
- **A missing value is not a zero.** No history reads "Unavailable"; a true zero
  baseline shows the difference and "no % comparison"; a month not yet reached
  draws nothing.

## 3. Coverage and unresolved limitations

**Withheld, with the reason on the page:**

- *Completed output and throughput.* No completion event exists.
  `TaskFact.completedAt` falls back to `item.updatedAt`, so a task renamed today
  would count as finished today.
- *On-time delivery.* Needs both a trustworthy completion and the deadline that
  was originally committed. The due date is mutable; extending it after a miss
  would rewrite history in the team's favour.
- *Capacity and load.* Needs contracted hours, leave, non-project commitments
  and effort estimates. None of the four is recorded. Resourcing names all four
  and shows assignment, which is real.
- *Campaign readiness, planned-vs-urgent mix, request notice.* No campaign
  entity; a priority label is not proof that work was unplanned; the originally
  requested deadline is not kept separately from the current due date.

**Known limitations kept as limitations:**

- *Archived boards.* The snapshot reads active boards only, so archiving a
  finished campaign removes its work from historical totals. Not fixed in this
  pass; separating current operational scope from historical completion scope is
  a change to the read, not to the analytics.
- *Allocation state.* "Awaiting allocation" is a heuristic — a request with no
  team and nobody assigned — because allocation has no state of its own. Said so
  in the tooltip.
- *Inferred departments.* Boards with no STAKEHOLDER column fall back to a
  column's name. The fact is carried on the value (`inferred`) so it can be
  surfaced when it matters.

## 4. What would have to be captured

| Foundation | Minimum shape | Unlocks |
| --- | --- | --- |
| Task lifecycle events | `task_events(item_id, kind ∈ started/completed/reopened/cancelled, at, actor)`, append-only | Throughput, cycle time, WIP age, work-item age |
| Committed deadline | First agreed due date, retained when the due date moves | On-time delivery, deadline-revision reporting |
| Effort | Estimate per task or asset line, in one unit | Planned load |
| Availability | Contracted hours, leave, standing commitments | Net availability, remaining capacity |
| Campaign | A campaign entity with a launch date | Campaign readiness, launch calendar |

Legacy rows stay unknown under all of these. No backfill can invent an event
that was never recorded.

## 5. Verification

Run on this machine, in low-performance mode, with the commands recorded.

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | Clean |
| Lint | `npm run lint` | 0 errors, 2 pre-existing warnings |
| Unit | `npx vitest run` | 442 of 443 pass; the one failure is below |
| Dashboard unit | `npx vitest run tests/unit/dashboard-*` | 41 pass |

**The one failure.** `board-service.test.ts > deleting a team` exceeds its own
30-second timeout. It fails identically with this work stashed *and* with `src/`
checked out at the pre-dashboard commit, so it is machine speed under
low-performance mode, not this change. Recorded rather than worked around.

**Calculation fixtures.** The brief's figures are asserted directly
(`tests/unit/dashboard-metrics.test.ts`): 120 tasks and 400 units against 100
and 320 give +20/+20% and +80/+25%, and the monthly rows sum back to both
headlines. Also covered: matched year-to-date, an arbitrary comparison year,
absent history, a true zero baseline, a decrease, a renamed department, undated
work under a due-date basis, mixed-asset tasks, leap day, shared ownership,
former members, and the reason ordering in the attention list.

Two defects were found by those tests before any UI existed: `coverage()` and
the department dimension were both still reading the old field. Both fixed and
re-run.

**Browser evidence** (dev server, live workspace data — 483 tasks, 11,959 asset
units in 2026 to date):

- 1440×900: both headline figures, the comparison chart and the operations strip
  are above the fold; the attention/upcoming split follows.
- 390 px: single column, tabs and filters reachable, no page-level horizontal
  scrolling (`scrollWidth === clientWidth`).
- 320 px: no page-level horizontal scrolling. 22 controls extend past the
  viewport; all 22 are inside a container with `overflow-x: auto`, which is the
  W3C reflow allowance for a data table, and none is clipped.
- Public link (`/dashboard/<token>`, an existing share, unchanged): two tabs
  only — Overview and Demand & Delivery — no avatars anywhere, no "awaiting
  allocation" figure, and the same 483 / 11,959 as the internal view.

Two visual defects were found by looking and fixed: the chart legend swatches
rendered colourless because the CSS variables were declared on the `<svg>` and
the legend sits outside it, and panel headings were crushed to "Ass…" beside
their own controls on a phone.

**Not run.** The full Playwright suite. Under low-performance mode a 222-test
run takes long enough that timeouts stop being evidence of anything; the
dashboard-touching spec (`mobile-layout.spec.ts`) was run on its own instead.
This is a gap, not a pass.

## 6. Schema

None. Every change in this revision is additive in TypeScript only: the snapshot
gained a `departments` array, read from the existing `stakeholder_departments`
table created by migration 0030. No migration, no backfill, no provider
divergence — the local, memory and Supabase repositories all already answered
`listDepartments`.
