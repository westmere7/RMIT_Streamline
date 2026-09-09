# Documentation drift — 9 September 2026

Claims that do not match the current source or runtime, with the evidence.

---

## D-01 — A comment that describes the opposite of its code

`src/features/trackers/hooks.ts:234`

> `// Flush a pending save if the user navigates away mid-debounce.`

The cleanup below it calls `clearTimeout` and nothing else, which cancels the
save. This is not merely wrong prose: it is the reason the defect (F-004)
survived review — a reader checking "is the unmount path safe?" finds a comment
saying yes.

**Action** Fixed with the code, not separately.

---

## D-02 — Reading `0001_rls_policies.sql` gives the wrong permission rule

`private.board_role()` is defined three times: `0001`, `0006`, and
`0008_visibility_is_read_only.sql`. Only the last is in force. `0001` grants
`EDITOR` on WORKSPACE-visible boards; `0008` grants `VIEWER`, matching
`boardRoleFor()`.

The knowledge base does warn that "later definitions may replace earlier helper
functions" (§ policies), which is what saved this from being filed as a
TypeScript/SQL divergence. The warning is easy to miss when the file names give
no hint that `0001` has been superseded.

**Action** No code change. Recorded so the next reader checks the whole chain
before concluding anything about permissions. A comment at the top of `0001`
pointing forward would be cheap and is proposed, not applied.

---

## D-03 — The dashboard and the portal pick different representatives

Both collapse a run of linked tasks to one row, and they choose differently:

| Surface | Rule | Source |
| --- | --- | --- |
| Dashboard | Earliest `createdAt` | `analytics.ts` `collapseLinked` |
| Portal | The **booked** copy, else earliest | `stakeholder-portal-service.ts` `scope` |

Counts agree — one row each — but the two surfaces can name different items as
the representative of the same pair, and a reader comparing a dashboard
drill-down against a portal row will find different task ids.

This is intended: a portal's canonical row is the request the stakeholder made,
and the dashboard's is the first record of the work. The audit brief expects
them to differ. The knowledge base described neither rule.

**Action** Recorded in `KNOWLEDGE_BASE.md` §13b/§13c as part of this audit.

---

## D-04 — "They will no longer be able to sign in"

`src/features/members/members-page.tsx:465`. True under the local provider
(`local-auth-provider.ts:65`), false under Supabase, where nothing checks
`deactivatedAt` at sign-in and no Auth account is disabled. See F-001.

**Action** The code is being changed to match the promise, rather than the
promise softened to match the code.

---

## D-05 — Knowledge base statements checked and found current

Not drift; recorded because the brief asks that prior claims not be inherited as
fresh evidence, and these were re-verified today rather than assumed.

| Claim | Status |
| --- | --- |
| Local IndexedDB at `DB_VERSION = 14` | Current |
| Latest applied SQL `0031_portal_presentation.sql` | Current — applied to the live database today |
| Policy files 0001–0013 plus the portal policy | Current |
| `links.listByWorkspace()` exists because workspace ids exceed a PostgREST URL | Current, and the same limit produced the portal's 80-id chunking |
| Portal reads are batched and paged | Current |
