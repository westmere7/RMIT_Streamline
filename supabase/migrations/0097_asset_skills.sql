-- =============================================================================
-- 0097_asset_skills.sql
--
-- Skills: each workspace's asset types grouped into a handful of crafts
-- (Design, Video & Motion…), for the dashboard's skill profile. Kept on the
-- workspace beside asset_rates and keyed the same way, by asset type name:
--   {"skills": [{"id","name","color"}], "types": {"<asset type>": "<skill id>"}}
-- Null until someone sets them; the dashboard then draws no profile.
-- =============================================================================

alter table public.workspaces
  add column if not exists asset_skills jsonb;

alter table public.workspaces
  drop constraint if exists workspaces_asset_skills_object;
alter table public.workspaces
  add constraint workspaces_asset_skills_object
  check (asset_skills is null or jsonb_typeof(asset_skills) = 'object');
