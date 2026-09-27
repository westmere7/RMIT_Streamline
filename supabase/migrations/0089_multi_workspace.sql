-- Several workspaces in one database: one directory of people, and Owners
-- above every workspace.
--
-- Until now OWNER and ADMIN had the same powers inside the one workspace there
-- was (see 0043). With several, they part:
--
--   * An Owner runs the whole app. They are in every workspace, as OWNER,
--     automatically; they alone create and delete workspaces, take and restore
--     snapshots, and make or unmake Owners.
--   * An Admin runs one workspace, the one their ADMIN membership is in.
--
-- Who is an Owner lives in its own table, app_owners, and not only in
-- workspace_members.role: an admin may write any member row of their workspace
-- (workspace_members_update_admin), so an ownership stored only there would be
-- editable by the people it governs. The OWNER rows in workspace_members stay —
-- every policy and helper that asks `workspace_role(ws) = 'OWNER'` keeps
-- working — but they are kept in step with app_owners by the triggers below,
-- and nobody else may write them.
--
-- People are one directory. A profile is one account across every workspace
-- (it already was); anyone active in some workspace can now read every profile,
-- so an admin can give an existing person access to their workspace instead of
-- making them a second account. Access itself is still a membership per
-- workspace, with its own role.

-- =============================================================================
-- Owners
-- =============================================================================

create table if not exists public.app_owners (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.app_owners enable row level security;

create or replace function private.is_app_owner(p_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.app_owners where user_id = coalesce(p_user, (select auth.uid())));
$$;

-- Active in at least one workspace: the people who may read the directory.
create or replace function private.is_active_member_anywhere()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members
    where user_id = (select auth.uid()) and status = 'ACTIVE'
  );
$$;

drop policy if exists app_owners_select on public.app_owners;
create policy app_owners_select on public.app_owners
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_active_member_anywhere());

drop policy if exists app_owners_insert on public.app_owners;
create policy app_owners_insert on public.app_owners
  for insert to authenticated
  with check (private.is_app_owner());

drop policy if exists app_owners_delete on public.app_owners;
create policy app_owners_delete on public.app_owners
  for delete to authenticated
  using (private.is_app_owner());

-- The Owners there are today: everyone with an active OWNER membership.
insert into public.app_owners (user_id)
select distinct user_id from public.workspace_members where role = 'OWNER' and status = 'ACTIVE'
on conflict (user_id) do nothing;

-- =============================================================================
-- Keeping OWNER memberships in step with app_owners
-- =============================================================================

-- Only somebody who has finished onboarding and is not deactivated can be made
-- an Owner, and the last Owner cannot be removed.
create or replace function private.app_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.profiles where id = new.user_id and deactivated_at is not null) then
      raise exception 'A deactivated person cannot be made an Owner.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.workspace_members where user_id = new.user_id and status = 'ACTIVE') then
      raise exception 'Only somebody who has finished onboarding can be made an Owner.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- The profile itself is going: nothing to keep.
  if not exists (select 1 from public.profiles where id = old.user_id) then
    return old;
  end if;
  if not exists (select 1 from public.app_owners where user_id <> old.user_id) then
    raise exception 'There must always be at least one Owner. Make somebody else an Owner first.' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists app_owner_guard on public.app_owners;
create trigger app_owner_guard
  before insert or delete on public.app_owners
  for each row execute function private.app_owner_guard();

-- A new Owner joins every workspace as OWNER; a former Owner stays in them as
-- a member, and an admin of each workspace decides from there.
create or replace function private.app_owner_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
    select w.id, new.user_id, 'OWNER', 'ACTIVE', now() from public.workspaces w
    on conflict (workspace_id, user_id) do update set role = 'OWNER', status = 'ACTIVE';
    return null;
  end if;

  update public.workspace_members set role = 'MEMBER' where user_id = old.user_id and role = 'OWNER';
  return null;
end;
$$;

drop trigger if exists app_owner_sync on public.app_owners;
create trigger app_owner_sync
  after insert or delete on public.app_owners
  for each row execute function private.app_owner_sync();

-- Every Owner is a member of every workspace from the moment it exists.
create or replace function private.workspace_seats_owners()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
  select new.id, o.user_id, 'OWNER', 'ACTIVE', now() from public.app_owners o
  on conflict (workspace_id, user_id) do update set role = 'OWNER', status = 'ACTIVE';
  return null;
end;
$$;

drop trigger if exists workspace_seats_owners on public.workspaces;
create trigger workspace_seats_owners
  after insert on public.workspaces
  for each row execute function private.workspace_seats_owners();

-- The OWNER role belongs to Owners and nobody else, and an Owner's seat in a
-- workspace cannot be taken away while they are one: not demoted, not
-- deactivated, not removed. Unmaking the Owner (app_owners) comes first.
create or replace function private.workspace_member_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.role = 'OWNER' and not exists (select 1 from public.app_owners where user_id = new.user_id) then
    raise exception 'Only Owners hold the Owner role. Make them an Owner from Members instead.' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE'
     and exists (select 1 from public.app_owners where user_id = old.user_id)
     and (new.role <> 'OWNER' or new.status <> 'ACTIVE' or new.user_id <> old.user_id or new.workspace_id <> old.workspace_id) then
    raise exception 'This person is an Owner. Remove them as an Owner before changing their access.' using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    if exists (select 1 from public.app_owners where user_id = old.user_id)
       and exists (select 1 from public.workspaces where id = old.workspace_id)
       and exists (select 1 from public.profiles where id = old.user_id) then
      raise exception 'This person is an Owner. Remove them as an Owner before taking them out of a workspace.' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_member_owner_guard on public.workspace_members;
create trigger workspace_member_owner_guard
  before insert or update or delete on public.workspace_members
  for each row execute function private.workspace_member_owner_guard();

-- Owners seated in every workspace that exists now (one, today).
insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
select w.id, o.user_id, 'OWNER', 'ACTIVE', now()
from public.workspaces w cross join public.app_owners o
on conflict (workspace_id, user_id) do update set role = 'OWNER', status = 'ACTIVE';

-- =============================================================================
-- Workspaces: Owners create and delete them, and the last one stays
-- =============================================================================

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (private.is_app_owner());

drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_delete on public.workspaces
  for delete to authenticated
  using (private.is_app_owner());

-- Owners join a new workspace through workspace_seats_owners; nobody seats
-- themselves any more.
drop policy if exists workspace_members_insert_bootstrap on public.workspace_members;

create or replace function private.workspace_keeps_one()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.workspaces) <= 1 then
    raise exception 'The last workspace cannot be deleted.' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists workspace_keeps_one on public.workspaces;
create trigger workspace_keeps_one
  before delete on public.workspaces
  for each row execute function private.workspace_keeps_one();

-- =============================================================================
-- People: one directory
-- =============================================================================

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (private.shares_workspace_with(id) or private.is_active_member_anywhere());

-- An admin edits the people of their workspace, but not an Owner: an Owner's
-- profile is theirs and the other Owners'.
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (
    private.shares_workspace_with(id)
    and (not private.is_app_owner(id) or private.is_app_owner())
    and exists (
      select 1
      from public.workspace_members me
      where me.user_id = (select auth.uid())
        and me.status = 'ACTIVE'
        and me.role in ('OWNER', 'ADMIN')
        and exists (
          select 1 from public.workspace_members them
          where them.workspace_id = me.workspace_id and them.user_id = public.profiles.id
        )
    )
  )
  with check (private.shares_workspace_with(id) and (not private.is_app_owner(id) or private.is_app_owner()));

-- =============================================================================
-- Notifications belong to a workspace
-- =============================================================================

-- Each workspace's inbox shows its own. Taken from the board when one is
-- named; kept when the board is later deleted, and gone with the workspace.
alter table public.notifications
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

update public.notifications n
set workspace_id = b.workspace_id
from public.boards b
where n.board_id = b.id and n.workspace_id is null;

-- The ones that name no board were all written while there was one workspace,
-- so they are that workspace's. Only when there is still just the one.
update public.notifications
set workspace_id = (select id from public.workspaces limit 1)
where workspace_id is null and (select count(*) from public.workspaces) = 1;

create index if not exists notifications_user_workspace_idx on public.notifications (user_id, workspace_id, created_at desc);

create or replace function private.notification_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.workspace_id is null and new.board_id is not null then
    select workspace_id into new.workspace_id from public.boards where id = new.board_id;
  end if;
  return new;
end;
$$;

drop trigger if exists notification_workspace on public.notifications;
create trigger notification_workspace
  before insert on public.notifications
  for each row execute function private.notification_workspace();

-- =============================================================================
-- Whether a workspace shows Portal and Booking in its menu
-- =============================================================================

-- A workspace that does not take bookings can take the entry out of its
-- menu. On everywhere until an admin turns it off, so the workspace that is
-- already here keeps its menu as it is.
alter table public.workspaces
  add column if not exists show_portal_menu boolean not null default true;

-- =============================================================================
-- Snapshots: one taken before a workspace is deleted
-- =============================================================================

alter table public.workspace_snapshots drop constraint if exists workspace_snapshots_kind_check;
alter table public.workspace_snapshots
  add constraint workspace_snapshots_kind_check check (kind in ('manual', 'before_restore', 'before_wipe', 'before_delete', 'upload'));

-- =============================================================================
-- The directory: who has finished joining somewhere
-- =============================================================================

-- An admin adding an existing person needs to know who is onboarded, and the
-- memberships that say so belong to workspaces the admin may not be in.
-- Only the ids come back, and only to somebody active in a workspace.
create or replace function public.directory_people()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct m.user_id
  from public.workspace_members m
  where m.status = 'ACTIVE' and private.is_active_member_anywhere();
$$;

revoke all on function public.directory_people() from public, anon;
grant execute on function public.directory_people() to authenticated;

-- =============================================================================
-- Messages and notifications stay inside their workspace
-- =============================================================================

-- A direct message belongs to a workspace, so it goes to somebody in that one.
-- Sharing some other workspace with them is not enough: they would never see
-- it there.
drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = direct_messages.workspace_id and m.user_id = direct_messages.recipient_id and m.status = 'ACTIVE'
    )
  );

-- A notification about a workspace's work goes to somebody in that workspace
-- (active, or still joining), from somebody active in it. One that names no
-- workspace keeps the old rule.
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and case
      when workspace_id is null then private.shares_workspace_with(user_id)
      else private.is_workspace_member(workspace_id)
        and exists (
          select 1 from public.workspace_members m
          where m.workspace_id = notifications.workspace_id and m.user_id = notifications.user_id and m.status in ('ACTIVE', 'INVITED')
        )
    end
  );
