-- =============================================================================
-- 0151_booking_form_schedules.sql
--
-- Scheduled forms: a saved form put live for a window of days, after which the
-- workspace's default form (the one published the ordinary way, still on the
-- workspace row) is served again by itself.
--
-- Nothing switches anything at midnight. The app works out which form to serve
-- whenever someone opens the form or books through it: the window covering
-- today (Vietnam days, both ends included), else the default form. So there is
-- no job to fail, and the switch is on time to the day.
--
-- Each window keeps its own copy of the form (`form`), taken when it was
-- scheduled: a saved form edited later does not change a window already
-- planned. `template_id` remembers which saved form it came from, for "take
-- the newer copy", and goes null if that saved form is deleted.
--
-- Windows of one workspace never overlap: a trigger refuses it, for every
-- writer. Workspace admins read and write them, as they publish the form; the
-- server reads them with the service role to serve the form to anybody.
-- =============================================================================

create table if not exists public.booking_form_schedules (
  id          uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  template_id uuid references public.booking_templates (id) on delete set null,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  form        jsonb not null,
  starts_on   date not null,
  ends_on     date not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint booking_form_schedules_days check (ends_on >= starts_on)
);

create index if not exists booking_form_schedules_workspace_idx on public.booking_form_schedules (workspace_id, starts_on);

create or replace function private.booking_form_schedules_no_overlap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_clash text;
begin
  select s.name into v_clash
  from public.booking_form_schedules s
  where s.workspace_id = new.workspace_id
    and s.id <> new.id
    and s.starts_on <= new.ends_on
    and new.starts_on <= s.ends_on
  limit 1;
  if v_clash is not null then
    raise exception 'Those days overlap the scheduled form "%".', v_clash using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_form_schedules_no_overlap on public.booking_form_schedules;
create trigger booking_form_schedules_no_overlap
  before insert or update of starts_on, ends_on, workspace_id on public.booking_form_schedules
  for each row execute function private.booking_form_schedules_no_overlap();

alter table public.booking_form_schedules enable row level security;
grant select, insert, update, delete on public.booking_form_schedules to authenticated;

drop policy if exists booking_form_schedules_select on public.booking_form_schedules;
create policy booking_form_schedules_select on public.booking_form_schedules
  for select to authenticated
  using (coalesce(private.is_workspace_admin(workspace_id), false));

drop policy if exists booking_form_schedules_insert on public.booking_form_schedules;
create policy booking_form_schedules_insert on public.booking_form_schedules
  for insert to authenticated
  with check (
    coalesce(private.is_workspace_admin(workspace_id), false)
    and created_by = (select auth.uid())
    and (template_id is null or exists (select 1 from public.booking_templates t where t.id = template_id and t.workspace_id = booking_form_schedules.workspace_id))
  );

drop policy if exists booking_form_schedules_update on public.booking_form_schedules;
create policy booking_form_schedules_update on public.booking_form_schedules
  for update to authenticated
  using (coalesce(private.is_workspace_admin(workspace_id), false))
  with check (
    coalesce(private.is_workspace_admin(workspace_id), false)
    and (template_id is null or exists (select 1 from public.booking_templates t where t.id = template_id and t.workspace_id = booking_form_schedules.workspace_id))
  );

drop policy if exists booking_form_schedules_delete on public.booking_form_schedules;
create policy booking_form_schedules_delete on public.booking_form_schedules
  for delete to authenticated
  using (coalesce(private.is_workspace_admin(workspace_id), false));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_form_schedules') then
    execute 'alter publication supabase_realtime add table public.booking_form_schedules';
  end if;
end
$$;
