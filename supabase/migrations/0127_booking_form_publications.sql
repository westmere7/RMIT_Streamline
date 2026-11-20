-- =============================================================================
-- 0127_booking_form_publications.sql
--
-- Every booking form a workspace has published, so an admin can see the past
-- ones and put any of them back live. The live form stays on the workspace row
-- (workspaces.booking_form and the booking_form_* columns); this is its
-- history, one row per publish, newest last, written by BookingService
-- whenever it publishes or goes back to the built-in form.
--
--   template      the form as published; null for the built-in form
--   name          what it was published as; null before forms had names
--   published_by  who published it; null when not recorded
--
-- Admins only, as the form itself is (workspaces_update, policies/0001): they
-- read it, and add to it as themselves. Rows are never changed or removed by
-- hand; they go with their workspace.
--
-- Each workspace's live form is put in as its first row.
-- =============================================================================

create table if not exists public.booking_form_publications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text,
  template     jsonb,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null
);

create index if not exists booking_form_publications_workspace_idx
  on public.booking_form_publications (workspace_id, published_at desc);

comment on table public.booking_form_publications is
  'Every booking form a workspace published (null template = the built-in form), for the past forms list and re-publishing.';

alter table public.booking_form_publications enable row level security;

drop policy if exists booking_form_publications_select on public.booking_form_publications;
create policy booking_form_publications_select on public.booking_form_publications
  for select to authenticated
  using (private.is_workspace_admin(workspace_id));

drop policy if exists booking_form_publications_insert on public.booking_form_publications;
create policy booking_form_publications_insert on public.booking_form_publications
  for insert to authenticated
  with check (
    private.is_workspace_admin(workspace_id)
    and (published_by is null or published_by = (select auth.uid()))
  );

-- The form each workspace is serving now, as the first entry.
insert into public.booking_form_publications (workspace_id, name, template, published_at, published_by)
select w.id, w.booking_form_name, w.booking_form, coalesce(w.booking_form_published_at, w.created_at), w.booking_form_published_by
from public.workspaces w
where (w.booking_form is not null or w.booking_form_published_at is not null)
  and not exists (select 1 from public.booking_form_publications p where p.workspace_id = w.id);
