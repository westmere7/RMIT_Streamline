-- =============================================================================
-- 0110_size_scale.sql
--
-- What each T-shirt size means in this workspace: a span of working time, the
-- kind of work, and typical jobs (SizeScale, src/domain/workspace/size-scale.ts).
-- Null means the defaults, which are the GCMC project sizing sheet. Edited in
-- Settings -> Sizes; read by the size picker to describe each size and to say
-- where a task's assets put it.
-- =============================================================================

alter table public.workspaces
  add column if not exists size_scale jsonb;

alter table public.workspaces
  drop constraint if exists workspaces_size_scale_object;
alter table public.workspaces
  add constraint workspaces_size_scale_object
  check (size_scale is null or jsonb_typeof(size_scale) = 'object');

comment on column public.workspaces.size_scale is
  'SizeScale: per T-shirt size, a span of working time, a scope and examples. Null means the defaults.';
