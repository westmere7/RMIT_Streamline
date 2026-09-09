# Cleanup — 9 September 2026

## Audit-created records

**None.** No fixture workspace, user, board, task, portal or share was created
for this audit. Every execution ran on the local provider, where each Playwright
test gets its own in-memory IndexedDB that is discarded when the test ends.

## Production data

Read-only throughout this audit. Specifically:

- Row counts and the dashboard share token were **read**, never written.
- No member was deactivated, despite F-001 being about deactivation — the
  runtime exploit is left undemonstrated rather than proven on a real account.
- No portal was opened or closed, no token rotated, no password set.
- No migration was applied. `supabase/policies/0014_membership_precedes_ownership.sql`
  is **written and not applied**.

## Changes made earlier today, outside this audit

Recorded here because they touched production and a reader of this directory
should know:

- Migration `0031_portal_presentation.sql` was applied to the live database
  (additive, all columns defaulted).
- The **Contents** portal was opened for testing and later found closed again.
- One portal setting (hiding the Priority column on **Comm.**) was toggled to
  verify the wiring end to end and **restored** immediately after.

## Temporary files

| File | Status |
| --- | --- |
| `profile.tmp.mts` | Deleted (was committed in error by an interim commit; removed) |
| `open-portal.tmp.mts` | Deleted |
| `check.tmp.mjs` | Deleted |
| `/tmp/hooks-fixed.ts` | Deleted |
| Scratchpad Python patch scripts | Session-local temp directory; not in the repository |

## Retained for reproduction

`Test_prompts/audits/2026-09-09-full-operations/artifacts/`

| File | Why kept |
| --- | --- |
| `before-fix-failures.log` | The six failing assertions on pre-fix code — the evidence that the regression tests are real |
| `family-slice-e2e.log` | The family-slice run |
| `baseline-e2e.log` | Partial; the full-suite baseline was abandoned deliberately (low-performance mode) |
