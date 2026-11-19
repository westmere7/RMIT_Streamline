-- =============================================================================
-- 0121_member_approval_values.sql
--
-- The new values migration 0122 uses, on their own: Postgres will not use an
-- enum value in the transaction that added it.
--
--   AWAITING_APPROVAL  someone who joined through the workspace's join link and
--                      finished onboarding, waiting for an admin to let them in
--                      (no access until then, like INVITED)
--   MEMBER_JOINED      the admins' inbox item saying so
--   USER               what that item is about: the person
-- =============================================================================

alter type public.workspace_member_status add value if not exists 'AWAITING_APPROVAL';
alter type public.notification_type add value if not exists 'MEMBER_JOINED';
alter type public.notification_entity_type add value if not exists 'USER';
