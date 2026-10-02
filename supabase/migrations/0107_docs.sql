-- =============================================================================
-- 0107_docs.sql
--
-- Docs: pages of writing that sit in a team beside its boards and trackers.
-- A "page" doc keeps its blocks as the editor's JSON in `content`; a "pdf" doc
-- keeps a file in the private `docs` storage bucket, at
-- <workspace id>/<doc id>/<file name>, and is shown read only.
--
-- Read by anyone in the workspace and written by anyone but guests, as
-- trackers are (policies/0025_docs_policies.sql). Realtime, so a doc open in
-- two places follows itself and the sidebar hears of new ones.
-- =============================================================================

create table if not exists public.docs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  team_id      uuid references public.teams (id) on delete set null,
  title        text not null default 'Untitled' check (char_length(title) <= 200),
  icon         text check (icon is null or char_length(icon) <= 16),
  kind         text not null default 'page' check (kind in ('page', 'pdf')),
  content      jsonb,
  file_path    text,
  file_name    text,
  file_size    bigint check (file_size is null or file_size >= 0),
  created_by   uuid not null references public.profiles (id),
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.docs is 'Pages of writing (or a kept PDF) in a team, beside its boards and trackers.';

create index if not exists docs_workspace_id_idx on public.docs (workspace_id);
create index if not exists docs_team_id_idx on public.docs (team_id);

drop trigger if exists docs_set_updated_at on public.docs;
create trigger docs_set_updated_at
  before update on public.docs
  for each row execute function public.set_updated_at();

-- The bucket for PDFs: private, so a file is only ever reached through a
-- signed link handed to someone the policies let read it. Advisory, as with
-- the covers bucket (0013): a project without storage access still migrates.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('docs', 'docs', false, 15728640, array['application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
exception when insufficient_privilege or undefined_table then
  raise notice 'storage bucket "docs" not created: %', sqlerrm;
end
$$;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
exception when undefined_object then
  raise notice 'publication supabase_realtime missing: %', sqlerrm;
end
$$;
