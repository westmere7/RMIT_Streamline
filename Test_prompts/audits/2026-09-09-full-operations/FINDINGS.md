# Findings — full operations audit, 9 September 2026

Statuses: OPEN · IN PROGRESS · FIXED AND VERIFIED · FIX IMPLEMENTED — VERIFICATION BLOCKED · DEFERRED PRODUCT DECISION

---

## F-001 — Deactivating a member does not stop them signing in or reading their boards (Supabase)

**Classification** BUG · **Severity** P1 · **Confidence** High (code path confirmed by reading; runtime exploit not demonstrated — see Verification)
**Status** OPEN

### Business consequence

Deactivation is the control an administrator uses when somebody leaves. In the
Supabase deployment it does not end their access. A departed employee who owns a
board — or who was explicitly added to one — keeps reading and writing it, and
can still sign in to the application at all. The person offboarding them has no
signal that anything is still open.

### The promise

`src/features/members/members-page.tsx:465`, the confirmation dialog:

> "They will no longer be able to sign in or be assigned to items. Their history is kept."

### What actually happens

1. `WorkspaceService.setMemberActive()` (`src/services/workspace-service.ts:147`)
   writes two application rows: `users.deactivated_at` and
   `workspace_members.status = 'DEACTIVATED'`.
2. Nothing touches Supabase Auth. There is no `auth.admin.updateUserById` ban,
   no session revocation, no sign-out. (`grep auth.admin` finds calls only in
   `src/server/onboarding.ts`.) The account's JWT stays valid until it expires,
   and the password still works.
3. `src/features/auth/providers/supabase-auth-provider.ts` **never reads
   `deactivatedAt`**. The local provider does, twice
   (`local-auth-provider.ts:65` and `:75`) — so the guarantee holds in the demo
   provider and not in production, which is the reverse of what matters.
4. Once authenticated, `private.board_role()` — current definition in
   `supabase/policies/0008_visibility_is_read_only.sql:45` — returns:

   ```
   0. system board  -> admins only
   1. owner_id = auth.uid()        -> 'OWNER'      <-- before any membership check
   2. explicit board_members row   -> that role    <-- before any membership check
   3. workspace admin              -> 'EDITOR'
   4. workspace_role is null       -> null         <-- the membership check
   5. visibility                   -> VIEWER/EDITOR/null
   ```

   `private.workspace_role()` requires `status = 'ACTIVE'`
   (`0001_rls_policies.sql:48`), so a deactivated member reaches step 4 as
   `null` — but only if steps 1 and 2 have not already returned.

5. `boardRoleFor()` (`src/lib/permissions/permissions.ts:78`) has the same order,
   so the TypeScript and the database agree with each other. They are
   consistently wrong rather than divergent.

### Scope

- Boards the deactivated user **owns**: full OWNER, read and write.
- Boards they hold an **explicit seat** on: that seat's role.
- Everything else: correctly denied at step 4.
- Not cross-tenant: they never gain access they did not previously have.

### Verification status

The code path is confirmed by reading source and the current policy definition.
The runtime exploit is **not demonstrated**, and deliberately so: it would
require deactivating a real member of the production workspace, which §2 of the
audit brief forbids without authorization for that target, and no disposable
Supabase project is configured. Recorded as a confirmed code-path defect with
runtime verification BLOCKED rather than as a demonstrated exploit.

The TypeScript half **is** demonstrable locally and is pinned by a regression
test (see FIX_LOG).

### Fix

Three layers, because the promise is made once and has to hold in all of them:

1. `supabase-auth-provider.ts` refuses a deactivated profile at sign-in and on
   session restore, as the local provider already does.
2. `boardRoleFor()` returns null when there is no active workspace membership,
   before honouring ownership or an explicit seat.
3. A forward policy (`0014`) reordering `private.board_role()` to match.

Layers 1 and 2 are verifiable here. Layer 3 needs a disposable Supabase project
to verify and will be marked FIX IMPLEMENTED — VERIFICATION BLOCKED.

---

## F-002 — `board_role` in `0001` grants EDITOR on workspace-visible boards

**Classification** DOCUMENTATION DRIFT (resolved in current code) · **Severity** n/a
**Status** RESOLVED IN CURRENT CODE — no action

`0001_rls_policies.sql:236` returns `'EDITOR'` for `WORKSPACE` visibility, which
contradicts `boardRoleFor()`'s `'VIEWER'` and its comment that "visibility says
who may read a board, not who may change it".

`0008_visibility_is_read_only.sql:72` supersedes it with `'VIEWER'`. The two
layers agree in the applied state. Recorded because reading `0001` alone gives
the wrong answer, and the knowledge base's warning that "later definitions may
replace earlier helper functions" is doing real work here.

---

## Risk register (§7 of the brief) — verification status

| # | Lead | Verdict |
| --- | --- | --- |
| 1 | Portal polling instead of realtime; missing advanced views | **Split.** Views: RESOLVED — the portal now renders a synthetic board with all seven views and the real item panel (`src/services/portal/portal-board.ts`). Realtime: CONFIRMED CAPABILITY GAP — 4-second polling, no channel. |
| 2 | Portal booking claim/compensation gaps | **DOCUMENTED LIMITATION, safe by default.** `book()` claims the key, books, associates, completes; any ordinary failure deletes the claim so the key can be retried (`stakeholder-portal-service.ts`). A claim stranded by *process death* is never reaped: `replay()` refuses it with "still being recorded", which prevents a duplicate but leaves that key permanently unusable. Mitigated in practice — a fresh form load generates a new key. A task created just before the crash still reaches its department through the STAKEHOLDER label even with no provenance row. |
| 3 | Portal RLS / privileged endpoints unproven on Supabase | **UNVERIFIED — BLOCKED.** No disposable Supabase project; production is not an authorized mutation target. |
| 4 | Legacy share hashing weaker than portal hashing | **CONFIRMED, documented limitation.** `hashPassword()` is one round of SHA-256 over `salt:password`; portal passwords use PBKDF2-SHA256 at 210k iterations. Board, item and dashboard shares still use the weak scheme. Impact bounded: these guard read-only public projections, not accounts. |
| 5 | Public board projection exposing more than expected | **CONFIRMED — see F-003.** |
| 6 | Public cover/avatar objects outside private-board visibility | **CONFIRMED, documented limitation, P3.** `item-covers` and `avatars` are public buckets: reads are `using (bucket_id = …)` with no board check, so a cover on a PRIVATE board is fetchable by anyone holding the URL. Writes *are* gated (`private.can_edit_item()` on the item id in the path). Paths are `<uuid>/cover.webp`, so enumeration is impractical and this is capability-URL security rather than an open directory; the real cost is that access cannot be revoked by changing board permissions. Deliberate: the app renders these with `getPublicUrl` and no signing. |
| 7 | Tracker debounce/unmount and whole-document save | **CONFIRMED — see F-004.** Whole-document last-write behaviour is by design and documented; the unmount flush is not. |
| 8 | Board seats surviving inactive membership | **CONFIRMED — see F-001.** |
| 9 | Global repository-client override and concurrent privileged requests | **RESOLVED IN CURRENT CODE.** All four call sites (`server/booking.ts:37`, `server/dashboard-share.ts:28`, `server/portal.ts:60`, `server/share.ts:62`) pass `getSupabaseAdminClient()`, a cached singleton with `persistSession: false` and no per-request state. The override is therefore always set to the same stateless object; concurrent requests cannot contaminate one another. Residual: nothing *prevents* a future call site passing a user-scoped client. Hardening candidate, P3. |
| 10 | Dashboard vs portal dedup/date/completion rules | **CONFIRMED DIFFERENCE, intended, under-documented.** Both collapse a linked pair to one row, with different tie-breakers: the dashboard keeps the **earliest created** copy (`analytics.ts collapseLinked`), the portal keeps the **booked** copy and falls back to earliest (`portal-scope`). Counts agree — one row each — but the two surfaces can name different items as the representative. The brief expects them to differ; the knowledge base did not say so. Documentation item, recorded in DOCUMENTATION_DRIFT. |
| 11 | Mobile hydration overwriting desktop preferences | **RESOLVED IN CURRENT CODE.** `mobile-layout.spec.ts` covers the 767/768 boundary and a desktop → mobile → desktop round trip with a non-default sidebar width; 13/13 pass (this machine, 9 Sep). |
| 12 | Documentation drift | **CONFIRMED, several.** See DOCUMENTATION_DRIFT.md. F-002 (superseded policy), the tracker flush comment that describes the opposite of the code (F-004), and the dashboard/portal representative rule (#10). |

---

## F-003 — A public board or item link publishes a staff directory

**Classification** BUG · **Severity** P2 · **Confidence** High (confirmed by reading; payload shape asserted by a regression test)
**Status** OPEN

### Business consequence

Anyone holding a board or item share link — no account, no password unless the
link has one — receives, for every person named anywhere on that board, their
job title, department, timezone, working hours and stakeholder group. That is a
staff directory attached to a link intended to show a project's status, and it
tells a stranger when each named person is at their desk.

### What actually happens

`toPublicUser()` (`src/domain/board/board-share.ts:150`) is a spread with one
deletion:

```ts
export function toPublicUser(user: User): User {
  return { ...user, email: "" };
}
```

Every other field of `User` survives: `firstName`, `lastName`, `displayName`,
`avatarUrl`, `jobTitle`, `department`, `timezone`, `stakeholderGroup`,
`workHoursStart`, `workHoursEnd`, `deactivatedAt`, `createdAt`, `updatedAt`.

`peopleOnBoard()` (`src/services/board-share-service.ts:248`) collects everyone
named by the board's owner, item creators, PERSON cells, asset creators and
assignees, comment authors, comment mentions, and activity actors — so the set
is wider than "people working on this board".

It is also the anti-pattern rather than a one-off mistake: a field added to
`User` later is published by default. The same shape was corrected on the
dashboard payload earlier today (`publicDashboardSnapshot`), which is what
prompted checking this one.

### Scope

`/share/<token>` (board) and `/share/item/<token>` (item). The dashboard link is
not affected — it now publishes no users at all.

### Fix

Rewrite `toPublicUser()` as a field-by-field allowlist: the id (needed to match
an avatar to a cell), the display name, and the avatar URL. Everything else is
omitted. A regression test asserts the exact key set, so a new `User` field
cannot join the payload silently.

---

## F-004 — A tracker edit is silently discarded if you leave within 600 ms

**Classification** BUG · **Severity** P1 · **Confidence** High (deterministic; the code cancels the save)
**Status** OPEN

### Business consequence

Type into a tracker cell and switch sheet, close the panel, or navigate away
within 600 ms and the edit is **gone**, with no error and no signal. The value
was on screen when you left. Trackers are where this team keeps its planning
sheets, so the loss is silent, routine, and attributed to nobody.

### What actually happens

`useSheetEditor` (`src/features/trackers/hooks.ts:149`) debounces saves by
600 ms. Its unmount cleanup is:

```ts
// Flush a pending save if the user navigates away mid-debounce.
React.useEffect(() => {
  return () => {
    if (timer.current) window.clearTimeout(timer.current);
  };
}, []);
```

The comment says flush. The code **cancels**. `clearTimeout` discards the
pending save and nothing runs in its place, so the last edit within the window
never reaches `services.trackers.saveSheet`.

`beginUnsavedWork()` does guard the *browser* unload path (closing the tab), which
is why this survives a refresh test and not a navigation test — the loss happens
on React unmount: switching sheet (`SheetEditorProvider` is mounted with
`key={sheet.id}`, so a sheet switch unmounts it), leaving the tracker route, or
closing the editor.

### Reproduction

1. Open a tracker with two sheets.
2. Type a value into a cell on sheet A.
3. Within 600 ms, click sheet B.
4. Return to sheet A, or reload.

Expected: the value is there. Actual: the cell is as it was.

### Fix

Keep the pending sheet in a ref and, on unmount, run the save immediately
instead of clearing the timer — fire-and-forget, because the component is going
away but the edit must not. Pinned by a regression test that unmounts inside the
window and asserts `saveSheet` was called with the edited sheet.

---

## F-005 — Delivery reliability cannot be measured at all

**Classification** FEATURE GAP · **Severity** P2 · **Confidence** High
**Status** DEFERRED PRODUCT DECISION — foundations specified, not built

### Business consequence

Nobody can answer "are we delivering on time?" from this system, and until today
the dashboard implied it could: it showed an "On time" percentage.

### Why

Two missing inputs, both structural:

1. **No completion event.** `TaskFact.completedAt` is
   `latest asset completedAt ?? item.updatedAt`. A task renamed in 2026 records
   a 2026 completion for 2024 work.
2. **No committed deadline.** The due date is mutable and only the current value
   is stored, so extending a missed deadline silently rewrites history in the
   team's favour.

### Action taken

The metrics were **withdrawn rather than left showing a plausible number**: the
completion date basis and the on-time tile are gone, and the dashboard says why
on the page. Created- and due-date volume are sound and were kept.

### What would fix it

`task_events(item_id, kind ∈ started/completed/reopened/cancelled, at, actor)`,
append-only, plus a `committed_due_date` retained when the due date moves. Legacy
rows stay unknown; no backfill can invent an event nobody recorded. Specified in
`docs/dashboard-revision-note.md` §4.

---

## F-006 — Cover and avatar images are public objects, whatever the board's permissions

**Classification** UNVERIFIED RISK (design limitation) · **Severity** P3 · **Confidence** High (config read; not exploited)
**Status** DEFERRED PRODUCT DECISION

### What

`item-covers` and `avatars` are **public** Storage buckets. Reads are
`using (bucket_id = '…')` with no board check
(`0013_item_covers.sql:30`, `0005_direct_messages.sql:115`), so a cover on a
PRIVATE board is fetchable by anyone holding its URL. Writes *are* correctly
gated — `private.can_edit_item()` on the item id in the path.

### Impact, honestly

Paths are `<uuid>/cover.webp`, so enumeration is impractical: this is
capability-URL security, not an open directory. The real cost is that access
**cannot be revoked** — making a board private, or deleting it, does not stop an
already-known URL from resolving.

Deliberate, not accidental: the app renders these with `getPublicUrl()` and no
signing, which is why they load in an `<img>` without a round trip.

### Options, not applied

Signed URLs with a short expiry (costs a request per image and breaks caching),
or accept and document. Recorded for the product decision rather than changed
unilaterally.
