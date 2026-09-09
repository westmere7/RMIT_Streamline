# Coverage ledger — full operations audit, 9 September 2026

Statuses: **PASS · FAIL · BLOCKED · NOT RUN · N/A**. Execution status is kept
separate from whether a feature is fully implemented.

Provider for every executed row: **local** (`NEXT_PUBLIC_DATA_PROVIDER=local`,
pinned by `playwright.config.ts`), which is the isolated environment §2 asks
for — each test gets its own in-memory IndexedDB. Machine in low-performance
mode, so the run was scoped deliberately: one spec per family rather than all
222 tests. That choice is recorded here, not hidden.

---

## Why so much is BLOCKED

`.env.local` points at the **production** Supabase project. §2 of the brief
forbids mutation, denial, concurrency and destructive testing against it without
authorization for that target, and no disposable project is configured. So:

- Every RLS-enforcement case is **BLOCKED**. A local-provider pass is not a
  substitute and is not recorded as one.
- Every multi-session real-auth case is **BLOCKED** (needs distinct Supabase
  sessions; "View as" is explicitly not a substitute).
- Realtime latency measurement is **BLOCKED**.
- `deployment-smoke.spec.ts` defaults to the live Vercel URL and performs
  writes. **NOT RUN**, deliberately.
- `supabase-smoke.spec.ts` (17 tests) requires the Supabase provider. **BLOCKED**.

---

## Daily operations (§5)

Executed through the real UI by the Playwright specs named, on the local
provider, unless stated.

| ID | Chapter | Status | Evidence / reason |
| --- | --- | --- | --- |
| OPS-01 | 08:30 morning planning | **PASS (partial)** | `auth-and-navigation` covers sign-in, home, My Work, inbox, board open, deep links. Search by reference in mixed case/hyphen forms covered by `mobile-layout` ("search matches the booking code as well as the name") and unit `search-service`. Multi-persona simultaneous sessions: BLOCKED. |
| OPS-02 | 09:00 new briefs arrive | **PASS (partial)** | `booking` (8) covers member booking, validation, required fields, key handling; `stakeholder-portal` covers portal submission and the receipt. R3-through-legacy-link and the "must not become an Event portal request" case: covered in principle by `portal-scope` unit tests (label vs provenance), NOT RUN as a UI narrative. |
| OPS-03 | 09:30 triage and allocation | **PASS (partial)** | `booking` covers allocation to a team and the linked copy. The 3-lines/9-units-not-18 rule is asserted by `dashboard-analytics` ("intake lines are requests, not delivery"). Non-admin denial of the system board: `permissions`. |
| OPS-04 | 10:00 production starts | **PASS** | `board` (13), `column-types` (11), `board-views` (6), `mobile-layout` (13) — status/dates/priority/tags/size edits, all seven views, mobile card-to-grid, explicit Kanban move, persistence after reload. |
| OPS-05 | 11:00 discussion and handoff | **PASS (partial)** | `updates-badge` covers Updates vs Inbox read state. `updates-composer` (10) NOT RUN this pass — mentions/formatting/links covered by unit `rich-text` and `format-activity`. Portal staff comment permissions: unit `stakeholder-portal`; backend denial BLOCKED. |
| OPS-06 | 13:30 priorities change | **PASS (partial)** | `cross-view-sync` (8) covers concurrent surfaces and secondary updates. "Change a STAKEHOLDER value and confirm portal ownership does not change" — **behaviour deliberately changed today**: the label now *does* move a task between portals, at the product owner's instruction (see KB §13c). Department rename identity: unit `department-reconciliation`, `portal-scope`. |
| OPS-07 | 15:00 review and delivery | **PASS (partial)** | `item-assets` covers line/unit completion. Semantic completion surviving a label rename: unit `status-label-roles`. Public share projections: `board-share` (7) plus the new `audit-regressions`. Reopen-and-recomplete history: **NOT RUN** — and the dashboard now withholds completion metrics entirely, so there is nothing to reconcile (see F-005). |
| OPS-08 | 16:00 tracking and reporting | **PASS (partial)** | `trackers` (6) plus unit `tracker-export`, `sheet-view`, and the new `tracker-flush`. XLSX round-trip through an *independent* reader: **NOT RUN** — the export is asserted by unit tests using the same library that writes it, which is not independent evidence. Recorded as a coverage gap. |
| OPS-09 | 17:00 end-of-day continuity | **PASS (partial)** | `mobile-layout` covers the desktop → phone → desktop round trip with a non-default sidebar width. `version-check` (2) covers Later/Reload. Cache clearing on account switch: **NOT RUN**. |
| OPS-10 | next day / weekly admin | **PASS (partial)** | `teams-and-members` (5), `boards-lifecycle` (7) cover invite, membership change, archive/restore, team removal with board retention. Share/portal rotation with a reader open: `board-share`, `stakeholder-portal`. Date-boundary advancement with controlled clocks: **NOT RUN**. |

---

## Edge-case families (§6)

| Family | Status | Evidence / reason |
| --- | --- | --- |
| **AUTH** | **PASS (partial)** | `auth-and-navigation` (8), unit `auth-messages`, `onboarding`. Local passwordless behaviour is *not* reported as a Supabase bypass. **F-001 found here**: the Supabase provider never checked `deactivatedAt`. Invitation expiry boundaries: unit `onboarding`. Supabase session/JWT cases: BLOCKED. |
| **ACL** | **PASS + 1 FAIL→FIXED** | `permissions` (7) plus the new `audit-regressions` (8). Precedence order verified against both TypeScript and the *current* SQL definition (`0008`, not the superseded `0001` — see D-02). **F-001**: membership now precedes ownership in both layers. Direct PostgREST denial tests: BLOCKED. |
| **BOARD** | **PASS** | `board` (13), `boards-lifecycle` (7), `groups-and-items` (9, NOT RUN this pass but green earlier today), `large-board` (1) for virtualization. |
| **FIELD** | **PASS** | `column-types` (11) covers the type union including STAKEHOLDER, SIZE, ASSETS_RECAP, DEPENDENCY; unit `size-column`, `item-reference`, `rich-text`. Zero-vs-missing and unchecked-vs-null are asserted in `column-types`. |
| **LINK** | **PASS (partial)** | `data-integrity` (8), unit `item-links`, `item-link-sync`, `label-sync`. Cycle attempts and A–B–C chains: unit. Simultaneous edits at opposite ends: **NOT RUN**. |
| **BOOK** | **PASS (partial)** | `booking` (8), unit `booking`, `portal-booking`. Idempotency same-key/different-body and claim recovery: unit `portal-booking`. **Real process interruption: NOT RUN** — needs a disposable environment. Risk 2 verdict recorded in FINDINGS. |
| **PORTAL** | **PASS (partial)** | `stakeholder-portal` (13), unit `portal-scope` (11), `portal-board` (12), `portal-password`, `department-reconciliation`. Payload allowlist asserted at unit level. **RLS and privileged endpoints: BLOCKED.** Seven-view gap from the original brief is **closed** (see FINDINGS risk 1). |
| **SHARE** | **PASS + 1 FAIL→FIXED** | `board-share` (7), unit `board-share`, `item-share`, `dashboard-share`. **F-003 found here**: `toPublicUser` published a staff directory. Weak legacy hashing recorded as a documented limitation, not an exploit. Storage object exposure: **F-006**, documented limitation. |
| **COLLAB** | **PASS (partial)** | `updates-badge` (2), unit `notification-delivery`, `messages-and-profile`, `updates-summary`. `notifications` (11) and `updates-composer` (10) **NOT RUN** this pass. Browser notification permission states: **NOT RUN**. |
| **ASSET** | **PASS** | `item-assets` (2), unit `item-assets`. Independent recap arithmetic (lines, quantity, completed, next due, overdue) asserted in unit. Upload size/MIME boundaries: **NOT RUN**. |
| **TRACKER** | **PASS + 1 FAIL→FIXED** | `trackers` (6), unit `trackers`, `sheet-view`, `sheet-view-editing`, `tracker-export`, and the new `tracker-flush`. **F-004 found here.** Independent XLSX reader: **NOT RUN**. |
| **REPORT** | **PASS** | `board-views` (6), `cross-view-sync` (8), unit `dashboard-analytics`, `dashboard-metrics` (23), `view-aggregates`. Expected values computed independently of the production aggregation in `dashboard-metrics`. |
| **SYNC** | **PASS (partial)** | `cross-view-sync` (8) covers two same-origin surfaces. Controlled 401/403/409/5xx and lost-response-after-commit: **NOT RUN**. Realtime latency: **BLOCKED**. |
| **UX** | **PASS** | `mobile-layout` (13) at the 767/768 boundary, `accessibility` (6) keyboard-only. Viewport sweep 320/390/1440 done by hand on the dashboard today; 430/1024/1920: **NOT RUN**. Light/dark verified; **dim theme NOT RUN**. |
| **SCALE** | **PASS (partial)** | `large-board` (1) covers the existing 300-item case. A 1,000-item board and >200 linked ids: **NOT RUN** on this machine in low-performance mode. Measured limits from earlier today are real evidence, though: PostgREST's 1000-row cap and the 16 KB URL limit were both hit and fixed. |
| **DATA** | **PASS (partial)** | `data-integrity` (8), `version-check` (2), unit `data-export`, `seed-integrity`. Schema head verified today: migrations to `0031`, IndexedDB `DB_VERSION 14`. Copied previous-version IndexedDB upgrade: **NOT RUN**. Migration failure injection: **BLOCKED** (needs a disposable database). |

---

## Not run, deliberately

| Item | Reason |
| --- | --- |
| `deployment-smoke.spec.ts` | Defaults to the live Vercel URL and writes. §2 forbids it without authorization for that target. |
| `supabase-smoke.spec.ts` | Requires the Supabase provider; production is the only one configured. |
| Full 222-test Playwright run | Machine in low-performance mode; a full run produces timeouts rather than evidence (demonstrated: `board-service > deleting a team` exceeds its own 30 s limit and does so identically on pre-audit code). |
| Production build (`npm run build`) | Not run this pass; types and lint are clean and the last build was green earlier today. |
