-- =============================================================================
-- 0077_board_templates.sql
--
-- Board layouts saved under a name, for new boards to start from: the columns
-- always, and whichever of groups, column settings, widths, automations, task
-- names and the board's look were chosen when it was saved. Never what is in
-- the tasks. The JSON shape is src/domain/board/board-template.ts
-- (BoardTemplateSpec), validated by the app before it is written.
--
-- Templates belong to the workspace; created_by is who saved one, and with an
-- admin the only one who may change or delete it (see policies/0019).
-- =============================================================================

create table if not exists public.board_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  description  text,
  spec         jsonb not null,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint board_templates_name_not_empty check (length(btrim(name)) > 0)
);

-- One template per name in a workspace; saving under an existing name replaces it.
create unique index if not exists board_templates_workspace_name on public.board_templates (workspace_id, lower(btrim(name)));

drop trigger if exists board_templates_set_updated_at on public.board_templates;
create trigger board_templates_set_updated_at
  before update on public.board_templates
  for each row execute function public.set_updated_at();
