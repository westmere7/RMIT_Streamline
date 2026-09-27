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
  -- One removal at a time, so two Owners removing each other at the same
  -- moment cannot both see the other still there and leave nobody.
  perform pg_advisory_xact_lock(7441903);
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

-- An admin edits the people of their workspace. The profile is one account
-- across every workspace, so an admin may edit it only when they administer
-- every workspace the person is active in; anyone else's profile is theirs and
-- the Owners'. An Owner's profile is the Owners' alone.
create or replace function private.administers_everywhere(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_app_owner()
    or (
      exists (
        select 1 from public.workspace_members them
        where them.user_id = p_user and coalesce(private.is_workspace_admin(them.workspace_id), false)
      )
      and not exists (
        select 1 from public.workspace_members them
        -- coalesce: the helper answers null, not false, for a workspace the caller is not in.
        where them.user_id = p_user and them.status = 'ACTIVE' and not coalesce(private.is_workspace_admin(them.workspace_id), false)
      )
    );
$$;

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (
    private.shares_workspace_with(id)
    and (not private.is_app_owner(id) or private.is_app_owner())
    and private.administers_everywhere(id)
  )
  with check (private.shares_workspace_with(id) and (not private.is_app_owner(id) or private.is_app_owner()));

-- A person's details are theirs once they have joined. An admin fills them in
-- for somebody still pending; after that only the person changes them. The one
-- thing an admin still writes is whether the account is on (deactivated_at),
-- which is what deactivating and reactivating do. An email, which is how a
-- person is found (invitations, requesters, sign-in), is never changed by
-- anybody else; the server (no session) is not held to any of this.
create or replace function private.profile_edit_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null or (select auth.uid()) = old.id then
    return new;
  end if;
  if new.email is distinct from old.email then
    raise exception 'Only the person themselves can change their email address.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.workspace_members where user_id = old.id and status <> 'INVITED')
     and (to_jsonb(new) - 'deactivated_at' - 'updated_at') is distinct from (to_jsonb(old) - 'deactivated_at' - 'updated_at') then
    raise exception 'Once somebody has joined, their details are theirs to change.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_email_guard on public.profiles;
drop function if exists private.profile_email_guard();
drop trigger if exists profile_edit_guard on public.profiles;
create trigger profile_edit_guard
  before update on public.profiles
  for each row execute function private.profile_edit_guard();

-- =============================================================================
-- Comments: deleted by their author, or by an admin who is on that board
-- =============================================================================

-- An admin (Owners are admins everywhere) deletes somebody else's update only
-- on a board they are a member of: its owner, or a seat on it. Being able to
-- see a board through the admin role is not enough.
create or replace function private.can_delete_comment(p_item_id uuid, p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_author_id = (select auth.uid())
    or (
      coalesce(private.is_workspace_admin(private.board_workspace(private.item_board(p_item_id))), false)
      and exists (
        select 1 from public.boards b
        where b.id = private.item_board(p_item_id)
          and (
            b.owner_id = (select auth.uid())
            or exists (select 1 from public.board_members bm where bm.board_id = b.id and bm.user_id = (select auth.uid()))
          )
      )
    );
$$;

-- =============================================================================
-- Boards, tasks and rules stay in their workspace
-- =============================================================================

-- A board never changes workspace, and its team is one of its workspace's.
create or replace function private.board_stays_in_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.workspace_id <> old.workspace_id then
    raise exception 'A board cannot move to another workspace.' using errcode = 'check_violation';
  end if;
  if new.team_id is not null and not exists (select 1 from public.teams where id = new.team_id and workspace_id = new.workspace_id) then
    raise exception 'A board''s team must be in the board''s workspace.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists board_stays_in_workspace on public.boards;
create trigger board_stays_in_workspace
  before insert or update of workspace_id, team_id on public.boards
  for each row execute function private.board_stays_in_workspace();

-- A task moves only between boards of one workspace: its values, deliverables,
-- links, ticket and history all belong to that workspace.
create or replace function private.item_stays_in_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.board_id <> old.board_id
     and (select workspace_id from public.boards where id = new.board_id) is distinct from (select workspace_id from public.boards where id = old.board_id) then
    raise exception 'A task cannot move to a board in another workspace.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists item_stays_in_workspace on public.items;
create trigger item_stays_in_workspace
  before update of board_id on public.items
  for each row execute function private.item_stays_in_workspace();

-- A rule's workspace is its board's.
create or replace function private.automation_rule_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.boards where id = new.board_id and workspace_id = new.workspace_id) then
    raise exception 'A rule belongs to its board''s workspace.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists automation_rule_workspace on public.automation_rules;
create trigger automation_rule_workspace
  before insert or update of workspace_id, board_id on public.automation_rules
  for each row execute function private.automation_rule_workspace();

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
  add constraint workspace_snapshots_kind_check check (kind in ('manual', 'before_restore', 'before_wipe', 'before_delete', 'before_change', 'before_remove', 'upload'));

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
