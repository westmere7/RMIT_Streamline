-- =============================================================================
-- 0026 – Workspace lists  (domain: src/domain/workspace/workspace-list.ts)
--
-- The lists a workspace standardises once and reuses everywhere: the asset
-- types a deliverable can be, the stakeholder groups a request comes from, and
-- whatever else is added to WORKSPACE_LIST_KEYS later.
--
-- One row per option, ordered by position. A list nobody has edited has no rows
-- at all and the application offers the built-in defaults, so nothing has to be
-- backfilled here; the first save writes the whole list out.
--
-- A Tags column is deliberately not one of these: its palette belongs to the
-- board that asks for those words (board_columns.settings).
-- =============================================================================

create table if not exists public.workspace_lists (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  list_key     text not null,
  name         text not null,
  color        text not null default 'slate',
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint workspace_lists_key_known check (list_key in ('ASSET_TYPES', 'STAKEHOLDER_GROUPS')),
  constraint workspace_lists_name_shape check (char_length(btrim(name)) between 1 and 40)
);

comment on table public.workspace_lists is
  'Workspace-wide option lists (asset types, stakeholder groups). Empty for a list still on its built-in defaults.';

-- One name per list per workspace, however it is capitalised.
create unique index if not exists workspace_lists_unique_name_idx
  on public.workspace_lists (workspace_id, list_key, lower(btrim(name)));
create index if not exists workspace_lists_workspace_idx on public.workspace_lists (workspace_id, list_key, position);

drop trigger if exists workspace_lists_set_updated_at on public.workspace_lists;
create trigger workspace_lists_set_updated_at
  before update on public.workspace_lists
  for each row execute function public.set_updated_at();

-- Everyone's pickers follow an edit without a reload.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_lists'
  ) then
    alter publication supabase_realtime add table public.workspace_lists;
  end if;
end
$$;
