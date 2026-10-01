-- =============================================================================
-- 0099_board_saved_views.sql
--
-- A board's views saved under a name: which view is open, what is searched,
-- filtered and sorted, which columns are hidden, and each view's own settings.
-- The JSON shape is src/domain/board/saved-view.ts (SavedViewConfig), read
-- back through normaliseViewConfig.
--
-- A shared view is everyone's on the board and its editors' to change; the
-- rest are the saver's alone (see policies/0023). A private view goes with the
-- person who saved it; a shared one is handed over when they are removed.
-- =============================================================================

create table if not exists public.board_saved_views (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  name       text not null,
  shared     boolean not null default false,
  config     jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_saved_views_name_not_empty check (length(btrim(name)) > 0),
  constraint board_saved_views_name_length check (length(name) <= 60)
);

create index if not exists board_saved_views_board on public.board_saved_views (board_id, created_at);

drop trigger if exists board_saved_views_set_updated_at on public.board_saved_views;
create trigger board_saved_views_set_updated_at
  before update on public.board_saved_views
  for each row execute function public.set_updated_at();
