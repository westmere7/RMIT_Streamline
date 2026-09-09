# Fix log — full operations audit, 9 September 2026

Each entry: root cause, files, the before-fix failure, the immediate recheck,
the neighbouring regressions, and any verification blocker. Failed iterations
are kept.

---

## FIX-001 — Deactivation reaches the boards (F-001)

### Root cause

Two layers answered ownership and an explicit board seat *before* checking that
the caller is still an ACTIVE member, and a third layer never checked
deactivation at all.

### Files

| File | Change |
| --- | --- |
| `src/lib/permissions/permissions.ts` | `boardRoleFor()` — membership check moved above ownership and explicit seat. `canDeleteBoard()` — membership guard added, because it reads `ownerId` directly. |
| `src/features/auth/providers/supabase-auth-provider.ts` | `signIn` and `getSession` refuse a deactivated profile and sign the session out. The local provider already did this; this one did not. |
| `supabase/policies/0014_membership_precedes_ownership.sql` | New. Replaces `private.board_role()` from `0008` with the membership check at step 1. |

### Before-fix failure

`artifacts/before-fix-failures.log`, with `src/` at the pre-audit revision:

```
× takes a deactivated member off the board they own   expected 'OWNER' to be null
× takes away an explicit seat too                     expected 'EDITOR' to be null
× treats somebody still invited the same way          expected 'OWNER' to be null
```

### Immediate recheck

`npx vitest run tests/unit/audit-regressions.test.ts` → 8 passed, including the
five control assertions that an active member keeps everything they had.

### Neighbouring regressions

- `tests/unit/permissions.test.ts` → pass (the existing ACL matrix is unchanged
  for active members).
- `tests/e2e/permissions.spec.ts` → in the family slice.
- Typecheck and lint clean.

### Verification blocker

**Policy `0014` is not applied and not verified.** Applying it needs a database;
the only one configured is production, and §2 forbids schema changes there for
an audit. Status for that layer: **FIX IMPLEMENTED — VERIFICATION BLOCKED**.
The TypeScript layers are FIXED AND VERIFIED.

Note the ordering risk if it *is* applied: the policy is a `create or replace
function`, so it is idempotent and reversible by re-running `0008`. It changes
no table.

---

## FIX-002 — A public link names a person and nothing else (F-003)

### Root cause

`toPublicUser()` was `{ ...user, email: "" }` — a subtraction, so every other
column of `users` was published and any field added later joined by default.

### Files

`src/domain/board/board-share.ts` — rewritten as a field-by-field allowlist:
id, display name, avatar. Everything else blanked.

### Before-fix failure

```
× keeps the staff directory out of it                          expected 'Senior Designer' to be null
× is an allowlist, so a new field on User cannot join by accident
    + "homeAddress"        (a field invented by the test appeared in the payload)
```

The second assertion is the important one: it fails on the *shape*, so the same
mistake made a different way still fails.

### Immediate recheck

Both pass. `JSON.stringify` of the projection contains no job title, no
timezone, no working hours.

### Neighbouring regressions

`board-share`, `item-share`, `dashboard-share` unit suites → pass. The board
share page still renders owners and avatars, because id + displayName +
avatarUrl are exactly what the cells need.

### Residual

`firstName` is filled with the display name rather than the real first name, so
components that greet by first name on a public page show the full name. Judged
better than publishing the surname separately.

---

## FIX-003 — A tracker edit survives leaving the sheet (F-004)

### Root cause

The unmount cleanup called `clearTimeout` and nothing else, under a comment
saying it flushed. The debounced save was cancelled, not run.

### Files

`src/features/trackers/hooks.ts` — the debounced write is extracted into `run()`
and also stored in a `flush` ref; the cleanup calls `flush.current?.()` instead
of clearing the timer. Fire and forget: the component is going, the write is
not.

### Before-fix failure

```
× saves when the editor unmounts inside the debounce window
    expected "vi.fn()" to be called 1 times, but got 0 times
```

### Immediate recheck

`tests/unit/components/tracker-flush.test.tsx` → 3 passed, including that a
normal debounce still writes exactly once and that unmounting with no edit
writes nothing.

### Neighbouring regressions

`tests/unit/trackers.test.ts`, `sheet-view`, `sheet-view-editing`,
`tracker-export` → pass. `tests/e2e/trackers.spec.ts` → in the family slice.

### Failed iteration, kept

The first version of the test assigned `commit` to a module-level variable from
inside the component. The React Compiler lint refused it twice — first
"Cannot reassign variables declared outside", then "This value cannot be
modified" when I tried a mutable holder object. Rewritten to hand the callback
out through an effect prop, which is what the rule is asking for. The
application code was never at fault; the test was.

---

## Checks run after the last fix

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Clean |
| `npm run lint` | 0 errors, 1 pre-existing warning (`virtual-rows.tsx`, TanStack Virtual + React Compiler) |
| `npx vitest run tests/unit/audit-regressions.test.ts tests/unit/components/tracker-flush.test.tsx` | 11 passed |
| Affected unit suites (permissions, board-share, item-share, trackers, dashboard-analytics) | 45 passed |
| E2E family slice, 107 tests, one spec per brief family | See `artifacts/family-slice-e2e.log` |
