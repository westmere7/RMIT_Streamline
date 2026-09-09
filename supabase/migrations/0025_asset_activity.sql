-- =============================================================================
-- 0025 – Asset activity  (domain: Activity, src/domain/activity/activity.ts)
--
-- Every movement on a task's asset list — added, edited, ticked off, removed —
-- is written to the activity feed by src/services/item-asset-service.ts, with
-- the item and the board on it so the same entry is read on the task's Activity
-- tab, in the board's activity and in the workspace feed.
-- =============================================================================

alter type public.activity_event_type add value if not exists 'ASSET_ADDED';
alter type public.activity_event_type add value if not exists 'ASSET_UPDATED';
alter type public.activity_event_type add value if not exists 'ASSET_REMOVED';
alter type public.activity_event_type add value if not exists 'ASSET_COMPLETED';
alter type public.activity_event_type add value if not exists 'ASSET_REOPENED';
