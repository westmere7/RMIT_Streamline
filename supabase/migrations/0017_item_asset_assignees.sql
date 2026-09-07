-- =============================================================================
-- 0017_item_asset_assignees.sql
--
-- More than one person can be in charge of an asset line. assignee_ids replaces
-- assignee_id, which is kept in step by a trigger (first of the array) so the
-- older column and its index stay truthful for anything still reading them.
-- =============================================================================

alter table public.item_assets
  add column if not exists assignee_ids uuid[] not null default '{}';

-- Whoever was in charge before is still in charge.
update public.item_assets
   set assignee_ids = array[assignee_id]
 where assignee_id is not null
   and cardinality(assignee_ids) = 0;

create index if not exists item_assets_assignees_idx on public.item_assets using gin (assignee_ids);

comment on column public.item_assets.assignee_ids is
  'The people in charge of this line, in the order they were added.';
comment on column public.item_assets.assignee_id is
  'Superseded by assignee_ids; kept as the first of them.';

-- The single column follows the array, so the two can never disagree.
create or replace function public.item_assets_sync_assignee()
returns trigger
language plpgsql
as $$
begin
  new.assignee_id := case when cardinality(coalesce(new.assignee_ids, '{}')) > 0 then new.assignee_ids[1] else null end;
  return new;
end;
$$;

drop trigger if exists item_assets_sync_assignee on public.item_assets;
create trigger item_assets_sync_assignee
  before insert or update of assignee_ids on public.item_assets
  for each row execute function public.item_assets_sync_assignee();
