-- =============================================================================
-- 0028 – Profile details  (domain: src/domain/user/user.ts)
--
-- Three things the people page now shows and lets someone edit: which
-- stakeholder group they sit with (a name from workspace_lists, kept as text so
-- a group can be renamed or retired without touching every profile), and the
-- hours they work, read in their own timezone.
--
-- All three are null on every existing row; the page says "not set" until
-- someone fills them in.
-- =============================================================================

alter table public.profiles
  add column if not exists stakeholder_group text,
  add column if not exists work_hours_start  text,
  add column if not exists work_hours_end    text;

comment on column public.profiles.stakeholder_group is
  'Name of a workspace_lists STAKEHOLDER_GROUPS option. Text, not a reference: profiles outlive the list.';
comment on column public.profiles.work_hours_start is
  'Start of their working day as "HH:MM", read in profiles.timezone.';

alter table public.profiles
  drop constraint if exists profiles_work_hours_shape;
alter table public.profiles
  add constraint profiles_work_hours_shape check (
    (work_hours_start is null or work_hours_start ~ '^[0-2][0-9]:[0-5][0-9]$')
    and (work_hours_end is null or work_hours_end ~ '^[0-2][0-9]:[0-5][0-9]$')
  );
