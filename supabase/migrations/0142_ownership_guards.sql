-- =============================================================================
-- 0142_ownership_guards.sql
--
-- Columns a signed-in session could rewrite though nothing in the app ever
-- does, each a way round a rule. "A session" below is current_user
-- authenticated or anon (these triggers are security invoker, as 0133/0136):
-- the service role, the server's routes and direct connections are not held.
--
--   boards.owner_id        changed only by the current owner or a workspace
--                          admin, and only to someone active in the workspace.
--                          A board OWNER seat (a guest's, even) let its holder
--                          make themselves owner, then delete the board (S17).
--   created_by             on items, item_assets, automation_rules and
--                          board_saved_views, fixed once written: rewriting it
--                          took over a colleague's saved view, or pinned a
--                          change on someone else (B15).
--   board_groups.board_id  fixed once written (B3): moving a group to another
--   board_columns.board_id board stranded its tasks and values, or carried them
--                          into another workspace. Held for the service role
--                          too; nothing moves a group or a column.
--   profiles.deactivated_at  a person cannot change their own: a deactivated
--                          account could switch itself back on (S25). Admins
--                          still do it for others.
--
-- And notification_delivery_rules, the view a sender reads to respect the
-- recipient's settings, showed everyone's muted boards, so it named private
-- boards. A colleague's muted boards are now only those the reader can see,
-- which are the only ones a sender ever asks about (S25).
-- =============================================================================

-- ---- boards.owner_id ---------------------------------------------------------
create or replace function private.board_owner_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.owner_id is distinct from old.owner_id and current_user in ('authenticated', 'anon') then
    if not (old.owner_id = (select auth.uid()) or coalesce(private.is_workspace_admin(old.workspace_id), false)) then
      raise exception 'Only the board''s owner or a workspace admin can hand it to someone else.' using errcode = 'insufficient_privilege';
    end if;
    if not exists (
      select 1 from public.workspace_members m
      where m.workspace_id = new.workspace_id and m.user_id = new.owner_id and m.status = 'ACTIVE'
    ) then
      raise exception 'A board can only be handed to someone active in its workspace.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists boards_owner_guard on public.boards;
create trigger boards_owner_guard
  before update of owner_id on public.boards
  for each row execute function private.board_owner_guard();

-- ---- created_by --------------------------------------------------------------
create or replace function private.created_by_fixed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.created_by is distinct from old.created_by and current_user in ('authenticated', 'anon') then
    raise exception 'Who made this cannot be changed.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists items_created_by_fixed on public.items;
create trigger items_created_by_fixed
  before update of created_by on public.items
  for each row execute function private.created_by_fixed();

drop trigger if exists item_assets_created_by_fixed on public.item_assets;
create trigger item_assets_created_by_fixed
  before update of created_by on public.item_assets
  for each row execute function private.created_by_fixed();

drop trigger if exists automation_rules_created_by_fixed on public.automation_rules;
create trigger automation_rules_created_by_fixed
  before update of created_by on public.automation_rules
  for each row execute function private.created_by_fixed();

drop trigger if exists board_saved_views_created_by_fixed on public.board_saved_views;
create trigger board_saved_views_created_by_fixed
  before update of created_by on public.board_saved_views
  for each row execute function private.created_by_fixed();

-- ---- board_id of groups and columns -------------------------------------------
create or replace function private.board_id_fixed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.board_id is distinct from old.board_id and session_user = 'authenticator' then
    raise exception 'A % stays on the board it was made on.', case tg_table_name when 'board_groups' then 'group' else 'column' end
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists board_groups_board_id_fixed on public.board_groups;
create trigger board_groups_board_id_fixed
  before update of board_id on public.board_groups
  for each row execute function private.board_id_fixed();

drop trigger if exists board_columns_board_id_fixed on public.board_columns;
create trigger board_columns_board_id_fixed
  before update of board_id on public.board_columns
  for each row execute function private.board_id_fixed();

-- ---- profiles.deactivated_at -----------------------------------------------------
create or replace function private.own_deactivation_fixed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.deactivated_at is distinct from old.deactivated_at
     and current_user in ('authenticated', 'anon')
     and old.id = (select auth.uid()) then
    raise exception 'Your own account is switched on and off by an admin.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_own_deactivation_fixed on public.profiles;
create trigger profiles_own_deactivation_fixed
  before update of deactivated_at on public.profiles
  for each row execute function private.own_deactivation_fixed();

-- ---- notification_delivery_rules ----------------------------------------------
create or replace view public.notification_delivery_rules as
  select p.user_id,
         p.types,
         case
           when p.user_id = (select auth.uid()) then p.muted_board_ids
           else coalesce(
             array(select b from unnest(p.muted_board_ids) as b where coalesce(private.can_view_board(b), false)),
             '{}'::uuid[]
           )
         end as muted_board_ids,
         p.browser_enabled,
         p.updated_at
  from public.notification_preferences p
  where p.user_id = (select auth.uid()) or private.shares_workspace_with(p.user_id);

revoke all on public.notification_delivery_rules from anon;
grant select on public.notification_delivery_rules to authenticated;
