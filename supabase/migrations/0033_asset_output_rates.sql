-- How fast the team produces each kind of deliverable.
--
-- One jsonb object on the workspace, keyed by asset-type name, each value
-- { qty, every, per } — "3 posters every 2 days" is { qty: 3, every: 2,
-- per: "day" }. See src/domain/workspace/asset-rate.ts, which is also where
-- the reading is made junk-tolerant: the column is deliberately untyped beyond
-- "an object", because the names it keys are a list people edit.
--
-- What it is for: a count of deliverables says how many things there are, not
-- how much work they are, so the dashboard weighs each type by its rate and
-- reports effort in hours beside the counts. Nothing is computed here and no
-- total is stored — effort is derived at render time, so correcting a rate
-- re-reads history instead of rewriting it.
--
-- Additive and nullable: a workspace with no rates recorded shows no effort
-- figure and every other number carries on unchanged. Keyed by name rather
-- than by a list row's id on purpose — workspace_lists rows are deleted and
-- re-inserted on every save, so nothing may hang off their identity.

alter table public.workspaces add column if not exists asset_rates jsonb;

-- An object, never an array or a scalar: the reader expects name → rate pairs.
alter table public.workspaces
  drop constraint if exists workspaces_asset_rates_object;
alter table public.workspaces
  add constraint workspaces_asset_rates_object
  check (asset_rates is null or jsonb_typeof(asset_rates) = 'object');
