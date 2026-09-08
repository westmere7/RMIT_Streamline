-- =============================================================================
-- 0019_booking_form_templates.sql
--
-- The booking form is the workspace's to shape. An admin edits the questions,
-- their wording and order on the Book a task page; the result is stored on the
-- workspace (workspaces.booking_form) and shown to everyone, stakeholders on
-- the public link included. Null means the built-in form.
--
-- Versions worth keeping are saved by name in booking_templates, so a form can
-- be swapped for another and back. Templates belong to the workspace, not to
-- whoever saved them (created_by is a record, not an owner).
--
-- The JSON shape is src/domain/booking/booking-template.ts (BookingFormTemplate);
-- it is validated by the app before it is written.
-- =============================================================================

alter table public.workspaces add column if not exists booking_form jsonb;

comment on column public.workspaces.booking_form is
  'The booking form as the workspace shaped it (BookingFormTemplate JSON). Null means the built-in form.';

create table if not exists public.booking_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  template     jsonb not null,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint booking_templates_name_not_empty check (length(btrim(name)) > 0)
);

-- One template per name in a workspace; saving under an existing name replaces it.
create unique index if not exists booking_templates_workspace_name on public.booking_templates (workspace_id, lower(btrim(name)));

comment on table public.booking_templates is
  'Saved booking forms, by name, that a workspace admin can load back onto the Book a task page.';

drop trigger if exists booking_templates_set_updated_at on public.booking_templates;
create trigger booking_templates_set_updated_at
  before update on public.booking_templates
  for each row execute function public.set_updated_at();
