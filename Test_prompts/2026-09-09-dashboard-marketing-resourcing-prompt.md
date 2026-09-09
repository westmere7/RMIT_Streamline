# Claude prompt: revise the Streamline dashboard for marketing operations and resourcing

Prepared: 9 September 2026  
Project: RMIT Streamline  
Repository: `E:\WORK_OFFLINE\apps\RMIT_Streamline`

## Your assignment

Act as a marketing operations lead, resource planner, product designer, and senior engineer. Revise the existing dashboard so a manager can decide what needs attention, what the team can deliver, and which incoming requests require a trade-off. Implement the revision, validate it, fix failures, and re-check after every fix. Do not stop at a design proposal.

This is an operational dashboard for an internal marketing and creative service. **Task counts, asset counts, and comparisons between years are core user priorities and must remain prominent.** They support reporting on output, demand growth, service contribution, and resourcing discussions. Improve their clarity and comparability while adding operational context. Counts do not by themselves establish campaign effectiveness, individual productivity, or available capacity.

Keep the existing Streamline visual language while substantially improving the dashboard's look and feel. Visual design is a required deliverable alongside the operational changes. Changes to the dashboard on desktop and mobile are in scope. Preserve the surrounding desktop and mobile application, board workflows, booking, allocation, stakeholder portals, and permissions. Do not turn this into a general application redesign.

## Read and verify before implementing

Read `AGENTS.md`, `CLAUDE.md`, and `KNOWLEDGE_BASE.md`, particularly dashboard analytics, stakeholder identity, booking/allocation, linked tasks/assets, authorization, mobile layouts, providers, and migration side effects. Read the relevant installed Next.js documentation under `node_modules/next/dist/docs/` before changing application code.

Inspect the current implementation, including:

- `src/features/dashboard/analytics.ts`, `dashboard-screen.tsx`, `dashboard-page.tsx`, `panels.tsx`, `dashboard-controls.tsx`, and `prefs.ts`.
- `src/domain/dashboard/dashboard.ts`, `src/services/dashboard-service.ts`, dashboard hooks, public dashboard routes, and sharing server code.
- Task/asset identity, status semantics, stakeholder provenance, workload views, repository interfaces, and local/Supabase implementations.
- Existing dashboard analytics, sharing, and browser tests; the previous full operations audit prompt in `Test_prompts`.

Inspect the working tree and preserve unrelated edits. Treat the observations below as findings from the source on the preparation date; verify them against the current code. Resolve differences using executable behavior and data contracts, and record material discrepancies.

Before editing, write a short implementation note identifying the decisions each panel supports, data available today, misleading calculations, and data that must first be captured. Continue with implementation after that note.

## Product direction and recommended changes

The dashboard should answer six questions:

1. What must ship next, and what is already late or blocked?
2. Which requests need allocation, clarification, or a priority decision?
3. Where is workload concentrated, including unassigned work?
4. Is demand growing faster than delivery, and which departments or types of work drive it?
5. What can we confidently say about capacity and delivery reliability from the data we actually have?
6. How many tasks and asset units are we handling, how does that compare with previous years, and which teams, departments, or asset types explain the change?

Use this decision table as the starting point:

| Existing element | Decision | Required revision |
|---|---|---|
| Team filtering, task drill-down, themes, refresh, fullscreen | Keep | Make filter scope and freshness explicit; preserve permissions and navigation. |
| Task and asset count headlines | Keep prominent and correct labels | Show both measures together, with current and comparison-period totals. Current `summary.assetUnits` can include unfinished work; distinguish requested/scheduled counts from completed output without removing the counts. |
| Annual overview and comparisons between years | Keep and strengthen | Make year-to-date counts and year-over-year comparison visible on Overview. Provide full-year and matched-period comparisons, with detailed monthly and category breakdowns in Demand & Delivery. Show future scheduled work separately. |
| People ranked by task/asset counts | Replace | Show assigned workload with unassigned work and all eligible people; remove performance or productivity implications. Counts currently credit each assignee fully and truncate the list. |
| “On time” and completion timestamps | Repair or withhold | Task completion can fall back to the last item update or latest asset completion. These are not reliable task lifecycle events. Do not publish authoritative delivery reliability from those proxies. |
| Asset mix and distribution panels | Consolidate | One useful breakdown by asset type, team, and department with a switch or drill-down, instead of competing repeated charts. |
| Generic people/board totals and arbitrary green thresholds | Demote/remove | Remove from headline space. No “healthy” label based on an unexplained 60% or 75% threshold. |
| Stakeholder requests | Improve | Separate incoming requests, unallocated intake, accepted backlog, and actual production. Prefer durable provenance and typed stakeholder data over column-name guessing. |
| “Delivery by team” using all scoped work | Relabel/recalculate | Clearly distinguish scheduled workload from completed output; define attribution for multi-team work. |
| Public dashboard | Keep with a narrower projection | Publish an explicit approved summary; do not expose internal staffing, workload rows, or new sensitive fields through snapshot spreading. |
| Exceptions, upcoming deadlines, and data gaps | Add first | Give each number an actionable list and a clear reason the work needs attention. |
| Real capacity and campaign readiness | Add only with trustworthy inputs | Implement the current-data experience first; specify missing foundations separately rather than populating invented numbers. |

## Information architecture

Use three dashboard views or tabs within the existing dashboard: **Overview**, **Demand & Delivery**, and **Resourcing**. Avoid putting every chart on one long page. Preserve useful existing functionality in the appropriate secondary view.

### Overview: output reporting and the morning stand-up

Lead with two equally prominent figures: **Tasks** and **Asset units**, each showing its explicit date basis, selected-period count, comparison-year count, absolute change, and percentage change where meaningful. Default the volume reporting scope to current year-to-date versus the equivalent period last year, in an explicit timezone. Preserve the user's selected scope on return. Keep both counts visible together; a task/asset toggle may control charts but must not hide either headline measure.

Place a compact year-over-year monthly trend below or alongside these figures, followed by the operational attention area. Use a clearly labelled, separate **Current operations · as of [date]** strip for open overdue work, open work due this week, unallocated requests, and blocked work. These can overlap; explain that and do not sum them into a misleading total. Historical reporting filters must not silently change this current snapshot. Completion output can appear when completion evidence is trustworthy; retain valid created/due-date counts if completion history is unavailable.

Put an **Attention needed** list prominently below the figures. Include overdue, due soon and unassigned, blocked, and requests waiting for allocation. Show task/reference, department where known, team, owner, due date, priority, and the exact reason it appears. Sort deterministically by urgency and deadline; do not invent an opaque risk score. If “due soon” uses a default threshold, expose the definition.

Show upcoming deadlines for the next two to four weeks. Call them campaign launches only when a real launch date and campaign relationship exist. Show future work even if the current year chart previously stopped at the current month.

Every supported figure or chart opens a filtered list whose count reconciles to the displayed metric. Use existing task and board routes for changes. Preserve filters and scroll when returning. Read-only users can inspect authorized records without seeing editing controls.

### Demand & Delivery: the marketing operations review

Show incoming requests and completed work as separate series with distinct definitions. If requests and production tasks are different units, do not subtract the series to claim net backlog growth. Compute backlog from the lifecycle of one consistent entity population.

Support weekly and monthly demand by stakeholder department, receiving team, urgency, and deliverable type. Include an explicit Unknown/Unmapped bucket. Renaming a department must not split its history where stable identity exists.

Show the mix of planned and urgent requests only where those categories are explicitly captured. A priority label is not proof that work was unplanned. Show request notice period separately from production cycle time.

Keep recent completions with drill-down. Expand the Overview's count and year-comparison summary here with full historical volume, asset mix, team breakdowns, and board summaries. Use simple labelled bars and trend lines with accessible tables, rather than decorative gauges or an unreadable dot per task.

### Required task/asset counts and year comparisons

Treat this as a first-class reporting capability, not an optional hidden panel:

- Show task totals and asset-unit totals for the selected year and comparison year. Offer full calendar year, year-to-date, matching quarter/month, and custom ranges. Default the comparison to the previous year, with a selector for any other available year.
- Provide a January–December comparison chart aligned by month. Let the user switch its measure between tasks and assets while keeping both headline totals visible. Show two years by default, with clear year labels and distinguishable line styles/markers; avoid overcrowding the chart.
- Provide a matching table with period, selected-year count, comparison-year count, absolute difference, and percentage difference. Support the same comparison by team, stakeholder department, and asset type where those dimensions exist. Task counts grouped by asset type can overlap when one task contains multiple types; explicitly label that relationship and never present those rows as additive unique-task totals.
- Use `(selected − comparison) / comparison × 100` when the comparison count is positive. For a true zero baseline, show the absolute difference and “No percentage comparison”; missing historical data must instead display “Unavailable,” not zero.
- Compare current YTD only with the equivalent elapsed calendar period in the comparison year. Do not compare a partial current year with a complete prior year as though they were equivalent. Clearly label any explicitly selected full-year view as partial actuals when the year is unfinished. Define leap-day alignment and test it.
- Distinguish future scheduled volume from actual completions. Historical created/due-date counts may remain available when completion events are missing, using accurate labels and coverage notes. Do not suppress all year comparisons because one date basis is unreliable.
- Keep date basis, timezone, team/department filters, identity rules, and units consistent across both years. Use stable identities for renamed teams/departments where available. Expose archive/history coverage gaps and current-access limitations that affect comparability; never invent historical snapshots.
- Use neutral increase/decrease styling by default. Increased production or demand is valuable information, but whether it is favourable depends on context. Do not automatically colour every increase green or every decrease red.
- Make both years' values drillable to their authorized contributing records, and reconcile chart/table totals with the headlines. On mobile, preserve access to the counts, comparison period, and differences without requiring hover.

Campaign/objective, channel, audience, launch date, approver, and approval stage are useful future dimensions. Reuse structured fields if available. Otherwise document a small proposed schema and capture flow; do not infer these dimensions from task titles or add mandatory booking fields without an explicit requirement.

Do not add ROI, ROAS, conversions, reach, engagement, enrolment impact, or “marketing performance” scores using production counts. These require separate outcome data and attribution definitions. Keep them out of this implementation unless the repository already supplies validated sources.

### Resourcing: the allocation meeting

Initially provide **Assigned workload**, organized by team and person for the next two/four/eight weeks. Distinguish in-progress work, scheduled work, overdue work, and work with no due date. Include unassigned demand, people with no assignments, former members with outstanding work, and a searchable full roster; do not silently show only the busiest eight people.

Show task counts and asset units separately. A video and a social tile can each be one asset while requiring different effort. Optional size distributions can help explain complexity, but do not turn XS–XL into hours without a documented, configurable estimation model. No capacity percentages from counts or profile workday hours alone.

Schedule allocations across their actual planned interval where recorded. When only a due date exists, show due-date demand and label that limitation; do not imply all production happens on the deadline. Undated work remains visible outside the calendar.

True capacity needs available hours, leave/holidays, non-project commitments, effort estimates, and allocation over time. If these are absent, deliver the workload view and record capacity as a separate follow-up with required inputs and acceptance criteria. Do not build an unrelated HR/time-tracking system to make a dashboard look complete.

If suitable capacity data already exists, use:

- Net availability = working time minus non-overlapping unavailable time and reserved commitments.
- Planned load = assigned estimated effort in the same interval and unit.
- Load percentage = planned load / net availability × 100; unknown and zero availability require explicit states.
- Remaining capacity = net availability − planned load; preserve negative values as overload.

For example, 40 working hours minus 8 hours leave minus 8 hours other commitments gives 24 available hours. A 30-hour plan is 125% loaded with a 6-hour shortfall. This is a calculation fixture, not sample production data. Planned load is not actual time utilization.

Never suggest one person is underperforming from task counts, completion counts, or a capacity percentage. Show operational constraints and evidence, with human decisions for reassignment and priority trade-offs. Do not automatically reassign tasks.

## Look and feel: required visual revision

Aim for a calm, polished workspace for a marketing team: clear hierarchy, readable data, restrained branding, and enough density to support daily decisions. The manager should immediately see the current scope, urgent work, and the next useful action. Treat the following as design direction to implement and inspect in the browser, not merely a list of CSS suggestions.

### What to change visually

The current source uses prominent red/navy hero cards, many similarly framed panels, tiny uppercase supporting labels, and chart grids that enforce matching heights. Reassess these choices in actual screenshots. Keep task/asset totals and year comparisons visually prominent, with a clearly distinguished attention area close by. Reduce repeated borders, nested cards, badge clutter, and empty space created solely to make unrelated charts equally tall.

| Area | Desired treatment |
|---|---|
| Page header | Compact title with a short operational subtitle. Put freshness and secondary actions together without competing with the title. |
| View navigation | Clearly labelled Overview, Demand & Delivery, and Resourcing tabs with an unmistakable active state. Use accessible tab semantics and keyboard behavior. |
| Filters | One coherent toolbar with the period and team visible. Put less-used dimensions behind a labelled filter control with an active-filter count and clear/reset action. |
| Headline figures | Two prominent aligned cards for Tasks and Asset units, each with comparison values and labelled changes. Use large readable numbers, sentence-case labels, and a clear period/date-basis line. Place current operational counts in a separate compact strip. |
| Year comparison | A prominent compact monthly chart with year labels and a task/asset measure switch. Keep the selected and comparison periods visible, with a direct route to detailed reporting. |
| Attention needed | A strong operational anchor below the reporting summary: a readable list/table with clear task titles, due dates, owner, and reason for attention. Emphasize the reason, not every field at once. |
| Upcoming work | A compact agenda beside the attention list when space permits, ordered by date. Avoid a full calendar grid if it mostly contains empty cells. |
| Charts | Clear titles that explain the measure, direct labels where practical, consistent legends, and a visible way to inspect the underlying records. |
| Resource rows | Align people/team names, counts, dates, and any supported load indicators. Use calm neutral styling; highlight a documented exception, not an arbitrary ranking. |
| Supporting information | Use restrained captions and expandable definitions. Do not place multi-sentence explanations inside every card header. |

### Layout and visual hierarchy

Use this reading order for Overview: header → tabs and reporting scope → task/asset headline comparisons and a compact year-over-year trend → current operations strip → attention list and upcoming deadlines → a compact supporting workload summary. On a typical 1440 × 900 desktop viewport, aim to show both volume headlines, their comparison context, and the operational strip without scrolling through decorative content. Keep the trend compact so operational work remains easy to reach.

Use an approximately two-thirds/one-third split for attention and upcoming work on sufficiently wide screens. Let content determine height; avoid mandatory equal-height chart stacks. Adapt using the available content width after the existing sidebar, rather than viewport width alone. On narrow screens, preserve this reading order in a single column.

Use the existing spacing scale consistently. Starting targets: 24–32 px between major sections, 16–24 px inside desktop panels, and 12–16 px on phones. These are tuning values, not reasons to override established tokens. Align panel headings, controls, numeric columns, and chart plot areas. Remove extra containers when spacing or a divider communicates grouping adequately.

### Typography, surfaces, and colour

Reuse the installed application font. Establish a small, consistent hierarchy: approximately 24–28 px for the page title, 16–18 px for section titles, 28–36 px for headline figures, and 14–16 px for primary content. Keep secondary labels readable, generally at least 12–13 px. Use tabular numerals for comparisons. Prefer sentence case to dense all-caps labels. Long department and task names must wrap or have an accessible full-name disclosure.

Read `src/app/globals.css` and existing shared primitives before styling. Retain the neutral canvas, existing card surfaces, RMIT red/navy identity, and indigo selection treatment. Use the current semantic tokens rather than introducing a dashboard-only brand palette. Red brand actions and overdue states need different shapes/text so colour does not carry both meanings alone. Use subdued surfaces and restrained borders/shadows; avoid large saturated metric backgrounds dominating the page.

Support every existing theme, including **light, dark, and dim** where available. Check text, controls, chart axes, gridlines, tooltips, badges, and disabled states in each theme. Do not change global theme tokens or shared component defaults just to style this dashboard; scope any necessary additions to dashboard components.

### Chart and list styling

Use labelled bars for category comparisons and lines/columns for time series. Keep the same category colours and order across related views. Reduce gridline contrast without making axes unreadable. Show units, meaningful ticks, and honest axes; quantity bars should start at zero. Separate requested/scheduled/completed series clearly and do not use dual axes that make unrelated units appear comparable.

Limit simultaneous chart categories and offer a full table for the remainder. A summarized Other group must reconcile to the full data. Do not use a donut, gauge, heatmap, or animation merely to fill a space. If a resource heatmap is useful, provide values and an accessible table/list alternative; colour intensity must encode a defined measure.

Use subtle row hover/focus states and aligned columns. A row may open a task, but its secondary controls must remain separately accessible without nested interactive elements. Status badges should be compact and meaningful. Avoid surrounding every owner, date, department, and asset count with a pill.

### Mobile, interaction, and feedback

Use two summary columns only when labels and values comfortably fit; fall back to one at narrow widths or enlarged text. Present attention rows as compact stacked entries with the title, due date, reason, and owner readable without sideways scrolling. Keep period/team selection discoverable; additional filters can use the app's established sheet pattern. Support safe areas and the existing mobile navigation.

Keep touch controls comfortably sized, generally 44 × 44 px, without forcing desktop data rows to become oversized. Sticky toolbars must not obscure focused elements or consume most of a phone screen. Do not hide essential actions behind hover. Use subtle state transitions, respect reduced motion, and avoid replaying count-up animations or shifting rows on every background refresh.

Design loading skeletons, first-use/empty states, no-filter-results states, partial/stale data, and failures as part of the page. Differentiate “no work” from “could not load work.” Keep layout stable while refreshing, and place recovery actions close to the affected content.

### Visual acceptance checks

Capture before/after screenshots using the same fixture data, filters, theme, and viewport. Review all three views at 390 px and 1440 px wide; also spot-check 320, 768, 1024, and 1920 px, the existing breakpoint boundaries, and enlarged text/zoom. Review light, dark, and dim themes. Check long titles, large numbers, sparse data, dense data, and all loading/error states.

Ensure ordinary content reflows at 320 CSS pixels without clipped controls or page-wide horizontal scrolling. Confine any essential two-dimensional table scrolling to its own region, with a usable mobile alternative. This follows the [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

Inspect screenshots yourself, fix crowding, weak hierarchy, contrast, overflow, misalignment, and excess whitespace, then recapture the affected view. Verify keyboard operation and actual interactions separately from screenshots. Also compare representative unchanged board and shell screens to catch accidental global CSS regressions.

Deliver a brief explanation of the visual decisions and browser evidence. If browser access is unavailable, report visual validation as blocked; do not claim a polished result based only on a successful build.

## Metric contracts and data integrity

Define the formula, entity, unit, date basis, inclusions/exclusions, attribution, unknown handling, and drill-down query for every metric. Keep those definitions close to pure analytics code and in user-facing help.

| Metric | Required meaning |
|---|---|
| Incoming requests | Unique originating requests created during the selected period, not every linked allocation copy. |
| Unallocated requests | Open requests that have no valid allocation, based on structured state/provenance. If only a group-name heuristic exists, disclose it until replaced. |
| Current backlog | Open accepted work as of now; label it as a snapshot. Historical backlog requires lifecycle evidence. |
| Open overdue | Open, non-cancelled work with a known due date before today in the configured timezone. Undated work is separate. |
| Scheduled volume | Tasks or asset units due in the period, labelled as scheduled. Never silently substitute creation for missing due dates. |
| Completed output | Unique qualifying completions during the period. Completed tasks and completed asset units are distinct measures. |
| Work in progress | Work that has started and has not finished, based on explicitly mapped workflow semantics. Do not assume every unfinished item has started. |
| Work item age | Time since an actual start event for unfinished work. If only creation is known, call it age since request/creation. |
| Cycle time | Start-to-finish duration for an eligible completion cohort. Show the sample size and missing-event coverage. |
| Request notice | Requested deadline minus request creation, where the original requested deadline is recorded. Do not call this cycle time. |
| On-time delivery | Eligible completions by their recorded committed deadline / eligible completions with both trustworthy timestamps and deadlines. Show denominator and exclusions. |

Resolve these integrity issues explicitly:

1. **Identity:** follow canonical request and linked-task identities. Earliest linked copy can deduplicate counts but does not automatically determine which team delivered the work. Define unique workspace totals and team contribution totals separately. Restrict every relationship traversal to authorized data.
2. **Assets:** quantity is production units, not effort. Do not double-count copied intake/allocation assets as independent production without evidence. If lineage is ambiguous, expose the limitation and propose a mapping; do not merge merely similar titles.
3. **Assignees:** association counts may show a task under multiple people, but explain that they do not sum to unique task totals. Estimated effort must be split using explicit allocations, not credited in full to every assignee. Do not count both parent effort and its component asset effort.
4. **Dates:** move business date controls out of hidden settings. Offer full year, year-to-date, month, quarter, and custom ranges for reporting, plus this week/next week for operational planning. Clearly distinguish current snapshots, creation cohorts, due-date plans, and completion cohorts. Scope exceptions as “as of now” when appropriate, so a historical date filter does not hide today's overdue work.
5. **Comparisons:** retain and strengthen year-over-year comparison. `previousScope` currently shifts the year; label it accurately and support a selectable comparison year. An optional preceding-period comparison must be separately named and must not replace year comparisons. Follow the matched-period, zero-baseline, and coverage rules above.
6. **Lifecycle:** mutable `updatedAt`, mutable due dates, and asset completion proxies cannot establish reliable historical task completion or original commitments. Reuse authoritative events if present; otherwise propose or implement only the minimal additive event capture needed for supported metrics. Keep legacy unknowns unknown. Define reopening, re-completion, cancellation, and deadline revisions without duplicate throughput.
7. **History:** active-board-only snapshots can erase historical delivery when a board is archived. Separate current operational scope from authorized historical completion scope; do not resurrect deleted private records or fabricate historical membership.
8. **Coverage:** missing department, owner, status, dates, effort, or lifecycle evidence is not zero. Show concise coverage information and an authorized list of records that need correction. Partial page fetches or repository failures must never appear as complete totals.

Use the same selectors for cards, charts, and drill-downs. Fetch all authorized pages, avoid per-item request waterfalls, and keep filtering responsive on large workspaces.

## Interaction, privacy, and implementation boundaries

- Reuse existing components, spacing, semantic colors, theme support, and chart capabilities. Add no chart library without a concrete need.
- Use clear labels, keyboard navigation, visible focus, adequate contrast, touch targets, and non-color status cues. Tooltips cannot be the only way to read data. Mobile gets a focused single-column layout and usable filters; avoid shrinking a desktop grid.
- Preserve the current mobile/desktop breakpoint contract and application shell. Dashboard changes may affect both layouts; unrelated desktop screens must remain intact.
- Store dashboard preferences per user and workspace, with a safe migration from existing browser-wide settings. Reset invalid filters after membership or team changes. Do not cache another user's data across sign-out or workspace switches.
- Show last successful refresh and loading, empty, unavailable, partial, and stale states. Background refresh failure must not leave a misleading “Live” indicator. Preserve a usable last snapshot with a stale label when appropriate.
- Enforce authorization at repositories/server boundaries, including aggregates and drill-downs. Hidden UI is not access control. Restricted-board contributions must not leak through counts, names, or filters.
- Give public sharing a field-by-field allowlisted aggregate payload. Do not reuse the internal snapshot by subtracting a few fields. Do not expose internal request text, individual workload, availability/leave, contact details, hidden board metadata, or new planning fields. Preserve password, expiry, revocation, and read-only behavior. Test the network response itself.
- Maintain local, memory/test, and Supabase provider behavior for any schema changes. Use additive migrations and repository contracts; document backfill limitations honestly.
- Inspect npm lifecycle scripts: this project's `predev` and `prebuild` can migrate a configured database. Run migration-dependent validation against an isolated test database. Do not seed, reset, or mutate production to test this change, and do not deploy as part of this prompt.

## Delivery sequence

1. Establish the metric dictionary, baseline screenshots, and a compact fixture dataset with independently calculated expected results.
2. Correct misleading labels, cohort calculations, missing-data handling, identity rules, and drill-down reconciliation.
3. Implement Overview, Demand & Delivery, and Assigned workload using trustworthy current data and the required visual direction. Remove/demote the low-value panels described above. Refine the hierarchy, typography, spacing, charts, and responsive interactions using browser evidence.
4. Add supported lifecycle metrics only when evidence supports them. For absent campaign or capacity inputs, deliver a specific follow-up proposal instead of simulated metrics or empty dashboard sections.
5. Verify sharing, access boundaries, provider parity, performance, and both responsive layouts. Update the knowledge base to describe actual implemented behavior.

Do not defer working current-data improvements because an advanced metric needs new inputs. Conversely, do not claim the dashboard answers capacity or marketing effectiveness questions that remain unsupported.

## Simulate day-to-day operations and edge cases

Use controlled fixtures and an isolated environment. Exercise real screens and persistence where available, not only pure functions.

- **Monday allocation:** a department submits a request, intake is visible, it is allocated to a team, linked copies appear, and request totals stay stable. The appropriate workload and unassigned counts update.
- **Urgent midweek request:** a high-priority job due tomorrow appears in attention and upcoming workload. The manager can inspect competing work without an automatic reassignment.
- **Mixed production:** one task requests three posters, five social assets, and one video. Show one task and nine asset units, with partial asset completion handled independently.
- **Year comparison:** fixtures contain 120 tasks and 400 asset units in one year, versus 100 tasks and 320 units in the comparison year. Expect +20 tasks/+20% and +80 units/+25%. Reconcile both headlines, monthly chart, comparison table, and drill-downs. These are test fixtures, not production statistics. Also test matched YTD periods, arbitrary comparison years, missing history, a true zero baseline, a decrease, renamed teams/departments, archived boards, mixed-asset tasks, and future scheduled work.
- **Shared ownership:** two people and two teams contribute to linked work. Workspace totals deduplicate; contribution views explain overlaps. Explicit effort shares reconcile if supported.
- **Friday review:** a task finishes, refreshes, is edited later, and is reopened. Historical completion and reliability follow the documented event policy rather than the latest edit time.
- **Changing commitments:** a due date is extended after it was missed. The original commitment is not silently rewritten in historical on-time reporting.
- **Unassigned and unknown work:** no owner, no date, no department, unmapped status, empty workspace, and zero eligible completions. No false 0%, 100%, or “healthy” states.
- **Changing structure:** rename/disable a department, move a task, archive a board, remove a member, and switch workspace. Check identity, scope, history, preferences, and access.
- **Capacity where supported:** part-time schedules, overlapping holidays/leave, zero availability, overbooking, multiweek work, missing estimates, and split assignments. Missing data never implies spare capacity.
- **Dates:** week/month/year boundaries, local midnight, leap day, timezone differences, future dates, and equal-period comparisons. Use one consistent business timezone policy.
- **Freshness:** rapid edits, duplicate/out-of-order events, disconnect/reconnect, partial fetch failure, failed refetch, and a second browser tab. No stale data presented as current.
- **Permissions:** owner, editor, viewer, restricted-board user, public share visitor, expired/revoked share, and cross-workspace access. Inspect response payloads and direct requests.
- **Usability and scale:** narrow phone, breakpoint boundaries, tablet, desktop, light/dark themes, keyboard-only navigation, and a large multi-page dataset. Cards and drill-downs must reconcile at scale.

## Mandatory fix-and-recheck loop

For every defect discovered:

1. Record reproduction steps, expected behavior, actual behavior, severity, and affected data/user scope.
2. Add a focused failing regression test where the defect concerns calculations, persistence, authorization, or behavior. For visual issues, capture reproducible before evidence.
3. Fix the root cause with the smallest coherent change.
4. Immediately rerun the original reproduction and the focused test. Do not move on while the fix remains unverified.
5. Re-check affected neighboring paths: different filters, linked work, permissions, both layouts, and relevant providers.
6. If any check fails, repeat this loop. Mark a finding fixed only with passing evidence; distinguish blocked and not-run checks from passes.

After all fixes, run the complete relevant regression suite and browser smoke scenarios again. Use the repository's actual scripts for lint, type checking, unit tests, and build where the environment safely supports them. Record commands and results; do not claim a build or browser scenario passed if it was not run.

## Final deliverables and completion criteria

Deliver the working dashboard revision, relevant regression tests, updated knowledge base, and a short dated implementation report containing:

- What was kept, revised, removed, and added, and which management decision each change supports.
- Metric definitions, data coverage, unresolved identity/lifecycle limitations, and explicitly deferred capacity/campaign foundations.
- Before/after evidence for desktop and mobile across supported themes, the visual decisions and inspection results, calculation fixtures, scenario results, and the fix/recheck log.
- Schema/migration implications, validation results, and any remaining blockers.

Completion means task and asset counts remain prominent, selectable year comparisons work and reconcile, and the default dashboard also helps run today's work; marketing demand and delivery are clearly distinguished; workload is honest about capacity limits; every visible total reconciles with its authorized records; sharing excludes internal planning data; and implemented changes pass their re-checks. Do not call data-dependent future features complete merely because a placeholder exists.

## Reference principles

Flow measures require explicit start/finish definitions: WIP is started unfinished work, throughput counts finished work over time, age measures unfinished work since start, and cycle time measures start to finish. Use these distinctions when naming metrics. [The Kanban Guide](https://kanbanguides.org/the-kanban-guide/).

Capacity planning compares expected demand with available resources. This informs the distinction between assignment counts and capacity supported by effort and availability inputs. [Atlassian capacity planning guide](https://www.atlassian.com/work-management/project-management/resource-planning/capacity-planning).

These references inform the recommendations; they do not replace the repository's actual data model or establish business rules for RMIT.
