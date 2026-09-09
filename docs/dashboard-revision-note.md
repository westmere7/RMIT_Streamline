# Dashboard revision — implementation note

Written 9 September 2026, before any code changed. What the dashboard is for,
what the data can honestly support, what it currently says that is not true, and
what would have to be captured before the rest becomes possible.

Every observation below was checked against the working tree, not taken from the
brief.

## 1. The decisions each area has to support

| Question a manager arrives with | Where it is answered | Evidence available today |
| --- | --- | --- |
| What must ship next; what is late or blocked? | Overview → Current operations, Attention needed, Upcoming | Due dates, status roles (`done`/`stuck`/`progress`), owners. Good. |
| Which requests need allocation or a decision? | Overview → Attention; Demand & Delivery → intake | Task Allocation board membership, `portal_requests` provenance, STAKEHOLDER cells. Partial: allocation state is inferred. |
| Where is workload concentrated, including unassigned? | Resourcing → Assigned workload | PERSON columns, asset assignees, due dates and timelines. Good for *assignment*; nothing for capacity. |
| Is demand growing faster than delivery? | Demand & Delivery | Creation dates are reliable. Completion dates are not (see §3). |
| What can we say about capacity and reliability? | Deliberately little | Neither effort estimates nor availability exist. See §4. |
| How many tasks and asset units, versus last year, and what explains the change? | Overview headlines + Demand & Delivery comparison | Creation and due dates by year, asset quantities, teams, asset types. Good, once the periods are matched. |

## 2. What the data actually supports

**Trustworthy.** Item creation timestamps. Asset quantities (`assetCount`), which
are production units and are what the Assets recap cell already shows. Team
membership of a board. Status *role* (`done`/`stuck`/`progress`) — a board may
word a status however it likes, and the role is the workspace's own statement of
meaning. Due dates where present. Person columns. Link relationships between
mirrored copies.

**Newly trustworthy, and not yet used.** The STAKEHOLDER column type and the
`stakeholder_departments` registry both exist now (migrations 0030/0031). The
dashboard still guesses a department by matching column *names* against
`DEPARTMENT_HINTS = ["department", "school", "faculty", …]`, which is exactly the
column-name guessing the brief says to replace. A typed column and a registry
with durable identity across renames are strictly better and are already in the
snapshot.

**Not trustworthy.** Task completion. There is no completion event anywhere in
the schema.

## 3. Calculations that currently mislead

Each of these is a defect to correct, not a preference.

1. **"Assets delivered" is not delivered.** `dashboard-screen.tsx` labels
   `summary.assetUnits` "Assets delivered", and `assetUnits` counts every asset
   unit in scope whether finished or not. `doneAssetUnits` exists beside it and
   is not what the headline shows.

2. **Completion is a proxy for a proxy.** In `buildFacts`:
   `completedAt = isDone ? (latest asset completedAt ?? item.updatedAt)`. So a
   task counts as "completed" on the day somebody last edited it — renaming a
   task in 2026 moves its 2024 completion. Everything built on this is
   unreliable: the `completed` date basis, `onTimeRate`, and any throughput
   series.

3. **On-time delivery has no committed deadline.** `onTimeRate` compares that
   proxy against `dueDate`, which is mutable. A deadline extended after it was
   missed silently rewrites history in favour of the team. There is no record of
   the original commitment.

4. **A partial year is compared with a whole one.** `previousScope` shifts the
   year and `inSpan` keeps anything in that calendar year, so with the default
   span (`year`, current) the dashboard compares 2026-to-date against the whole
   of 2025 and shows the shortfall as a decline.

5. **Due-date volume silently counts creation.** `taskDate(task, "due")` returns
   `dueDate ?? createdAt`. Undated work is therefore reported as scheduled in
   the month it was created.

6. **People are ranked, and truncated.** `loadByPerson(…, 8)` credits every
   assignee the full task and asset count and shows the eight largest. It reads
   as a productivity league table, it omits everybody else, and the numbers do
   not sum to the workspace total.

7. **Arbitrary thresholds are painted as health.** `donePct >= 60` and
   `onTimeRate >= 75` turn tiles green. Neither number is defined anywhere.

8. **Archived boards erase history.** `loadDashboardSnapshot` filters to
   `archivedAt === null`, so archiving a finished campaign removes its work from
   every historical total.

9. **The public payload is a subtraction.** `publicDashboardSnapshot` spreads the
   internal snapshot and removes some fields. Anything added to the snapshot
   later is published by default — the opposite of an allowlist.

10. **Preferences are browser-wide.** `streamline.dashboard` in `localStorage` is
    shared across users and workspaces on one machine.

11. **Request stage is guessed from group names.** `/incoming|new|inbox/` against
    the group's name, falling back to owner presence. `portal_requests` now
    records provenance properly.

## 4. What must be captured before the rest is possible

Deferred deliberately, with what each would need:

- **Task lifecycle events.** A `task_events` append-only table (`item_id`,
  `kind` ∈ started/completed/reopened/cancelled, `at`, `actor`). Without it,
  throughput, cycle time, WIP age and on-time delivery cannot be stated
  honestly. Legacy rows stay unknown; no backfill can invent them.
- **Committed deadlines.** The first agreed due date, kept when the due date
  moves. Without it, on-time delivery is unmeasurable.
- **Effort and availability.** Estimated effort per task or asset, contracted
  hours, leave, and non-project commitments. Without all four, capacity
  percentages are fiction. Assigned workload is what is deliverable now.
- **Campaign and channel.** No structured campaign entity exists. Inferring one
  from task titles would be guesswork.

None of these block the work in §5.

## 5. What this revision does

**Keeps and strengthens** the task and asset-unit counts and year comparison —
they are the reporting core. They gain matched periods, a selectable comparison
year, an explicit date basis and timezone, and reconciling drill-downs.

**Corrects** the labels, the matched-period comparison, the due/created
substitution, the department source (typed STAKEHOLDER + registry, with an
explicit Unknown bucket), and the request stage (provenance first).

**Withholds** on-time delivery and completion-based throughput until events
exist, while keeping created- and due-date volume, which are sound.

**Replaces** the people ranking with assigned workload: every eligible person,
unassigned demand named as its own row, counts shown as association counts with
that stated.

**Removes** the green thresholds and the generic people/board totals from
headline space.

**Rebuilds** the public payload as a field-by-field aggregate.

**Splits** the page into Overview, Demand & Delivery and Resourcing.

## 6. Metric dictionary

Every figure below states entity, unit, date basis and exclusions. These
definitions live next to the code in `src/features/dashboard/metrics.ts` and are
surfaced to the reader.

| Metric | Entity | Unit | Date basis | Notes |
| --- | --- | --- | --- | --- |
| Tasks | Top-level unarchived item, linked copies collapsed to the earliest, intake board excluded | count | created or due (explicit) | Never both. Undated work is excluded from a due-date count, not moved to creation. |
| Asset units | Asset line × quantity | units | line due date, else parent task's, else creation — labelled | One task may hold many units and many types. |
| Incoming requests | Unique originating request | count | created | Provenance first (`portal_requests`), then intake board, then a typed STAKEHOLDER cell. Linked allocation copies excluded. |
| Unallocated requests | Open request with no team and no owner | count | as of now | Heuristic while allocation state is untyped; disclosed in the UI. |
| Open overdue | Open, non-done task with a due date before today | count | as of now | Independent of the reporting filter. |
| Due this week | Open task due within 7 days | count | as of now | Overlaps overdue by definition; never summed with it. |
| Blocked | Task whose status role is `stuck` | count | as of now | The workspace's own definition of stuck. |
| Scheduled volume | Task or asset units with a real due date in the period | count/units | due | Undated work reported separately, never folded in. |
| Assigned workload | Task–person association | count | due date or timeline interval | Associations do not sum to unique tasks; stated on the panel. |
| Completed output | *Withheld* | — | — | Requires completion events. |
| On-time delivery | *Withheld* | — | — | Requires committed deadlines. |

**Comparison rules.** `(selected − comparison) / comparison × 100` where the
comparison count is positive; a true zero baseline shows the absolute difference
and "No percentage comparison"; absent history shows "Unavailable", never zero.
Year-to-date compares only the elapsed period, aligned by month and day, with
29 February treated as 28 February in a non-leap comparison year. An explicitly
selected unfinished full year is labelled partial actuals.

## 7. Discrepancies against the brief

- The brief expects department to come from stakeholder data rather than column
  names. That is now possible in a way it was not when the portal work began:
  the STAKEHOLDER column type is matched by **type**, and
  `stakeholder_departments` gives a department identity that survives a rename.
  This revision uses both.
- The brief's decision table says "Prefer durable provenance … over column-name
  guessing" for stakeholder requests. Provenance exists (`portal_requests`) but
  covers only portal bookings; the STAKEHOLDER label covers the rest. Both are
  used, in that order, and the source of each figure is stated.
