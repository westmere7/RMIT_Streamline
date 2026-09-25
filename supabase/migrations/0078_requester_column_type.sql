-- =============================================================================
-- 0078_requester_column_type.sql
--
-- The Requester, a special column every board holds: who asked for the work,
-- as a person (userIds, like a people column). A booking fills it in: a member
-- signed in is themselves, and someone booking through a public link is found
-- by their email or added as a pending member (src/server/requesters.ts).
--
-- Only the enum grows here. New enum values cannot be used in the transaction
-- that adds them, and nothing here uses them.
-- =============================================================================

alter type public.column_type add value if not exists 'REQUESTER';
