-- =============================================================================
-- 0039_booking_saved_blocks.sql
--
-- The same question turns up in most briefs: "where are the assets?", "has
-- this been through brand?". Rebuilding it choice by choice in every service
-- is how the copies drift apart. A block saved here keeps its wording and its
-- choices under a name; inserting it hands the brief a copy with an id of its
-- own.
--
-- Like booking_templates, these belong to the workspace, not to whoever saved
-- them. The JSON shape is one BookingBlock from
-- src/domain/booking/booking-template.ts, validated by the app before writing.
-- =============================================================================

create table if not exists public.booking_saved_blocks (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  block        jsonb not null,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint booking_saved_blocks_name_not_empty check (length(btrim(name)) > 0)
);

-- One saved block per name in a workspace; saving under an existing name replaces it.
create unique index if not exists booking_saved_blocks_workspace_name on public.booking_saved_blocks (workspace_id, lower(btrim(name)));

comment on table public.booking_saved_blocks is
  'Blocks of a booking brief saved by name, for an admin to drop into any brief from the form editor.';

drop trigger if exists booking_saved_blocks_set_updated_at on public.booking_saved_blocks;
create trigger booking_saved_blocks_set_updated_at
  before update on public.booking_saved_blocks
  for each row execute function public.set_updated_at();
