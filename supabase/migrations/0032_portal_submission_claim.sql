-- A portal booking claims its key before it has a receipt to store.
--
-- `portal_submissions.receipt` was created `jsonb not null` in
-- 0030_stakeholder_portal.sql, but the write is deliberately two-phase — see
-- `StakeholderPortalService.book()`:
--
--   1. claim   insert (portal_id, submission_key, request_hash) with item_id and
--              receipt both null. The unique constraint on
--              (portal_id, submission_key) is what settles a race between two
--              taps: one insert wins, the loser replays the winner's receipt.
--   2. book    write the task.
--   3. complete  update the claim with item_id and the receipt.
--
-- Step 1 can only be the arbiter if it happens *before* the booking, and at that
-- moment there is no receipt. So every portal booking failed on the claim insert
-- with a not-null violation. The service catches an insert failure and treats it
-- as "somebody else claimed this key", looks for the winner, finds none, and
-- throws — which `handleRoute` turns into a generic 500. Hence "Something went
-- wrong on the server" on every portal link, for every department, while
-- /api/book (which never touches this table) kept working.
--
-- The code already treats a null receipt as the claimed-but-not-finished state:
-- `PortalSubmission.receipt` is `unknown`, and `replay()` reads a missing receipt
-- as "that booking is still being recorded". The column is what was wrong.
--
-- item_id was already nullable for the same reason; receipt now matches it.

alter table public.portal_submissions
  alter column receipt drop not null;

comment on column public.portal_submissions.receipt is
  'The receipt to replay on a retry. Null between the claim and its completion: the key is claimed before the task is booked, so the claim cannot carry one yet.';
