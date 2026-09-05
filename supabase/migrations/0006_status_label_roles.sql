-- =============================================================================
-- 0006_status_label_roles.sql
--
-- A status label can now carry a meaning: done, stuck, or in progress (at most
-- one, and most labels carry none). Done already lived in settings.doneLabelIds;
-- this adds stuckLabelIds and progressLabelIds beside it.
--
-- Boards created before this keep working — the reader treats a missing key as
-- an empty list — but their existing "Stuck" and "Working On It" labels would
-- have no meaning until someone re-saved them by hand. This fills those in once,
-- from the default labels the seed and the templates ship with, and never
-- touches a column that already carries the new keys.
-- =============================================================================

update public.board_columns
set settings = settings
  || jsonb_build_object(
       'stuckLabelIds',
       coalesce(
         (select jsonb_agg(label ->> 'id')
          from jsonb_array_elements(settings -> 'labels') as label
          where lower(label ->> 'name') = 'stuck'),
         '[]'::jsonb
       ),
       'progressLabelIds',
       coalesce(
         (select jsonb_agg(label ->> 'id')
          from jsonb_array_elements(settings -> 'labels') as label
          where lower(label ->> 'name') in ('working on it', 'in progress')),
         '[]'::jsonb
       )
     )
where type = 'STATUS'
  and settings ->> 'kind' = 'status'
  and jsonb_typeof(settings -> 'labels') = 'array'
  and not (settings ? 'stuckLabelIds');
