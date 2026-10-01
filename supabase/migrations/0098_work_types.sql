-- =============================================================================
-- 0098_work_types.sql
--
-- 0097 called these skills; they are work types: how much of each kind of
-- work the deliverables came to, not what anybody is good at. Renamed before
-- anything was written to them. The stored shape is
--   {"workTypes": [{"id","name","color"}], "assets": {"<asset type>": "<work type id>"}}
-- =============================================================================

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workspaces' and column_name = 'asset_skills') then
    alter table public.workspaces rename column asset_skills to work_types;
  end if;
end
$$;

alter table public.workspaces
  drop constraint if exists workspaces_asset_skills_object;
alter table public.workspaces
  drop constraint if exists workspaces_work_types_object;
alter table public.workspaces
  add constraint workspaces_work_types_object
  check (work_types is null or jsonb_typeof(work_types) = 'object');
