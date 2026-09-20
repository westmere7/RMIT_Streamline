-- =============================================================================
-- 0055_automation_more_triggers.sql
--
-- Two more things the queue can say happened, and more rules that listen.
--
-- A task being renamed and a task being restored from the archive were
-- changes the app made and the queue never heard about, so no rule could
-- answer them. Both are captured now. The enqueue checks also learn the new
-- trigger kinds that ride on events the queue already carried: a subitem
-- arriving (an `item_created` with a parent), a task leaving a group (the
-- same `item_moved` row, read from the other end), somebody being taken off a
-- people column, a column being emptied, a number crossing a line (all
-- `value_changed`). Those need no new event; they need the trigger to know
-- that a board with such a rule is listening.
--
-- The trigger functions are `create or replace`, so this file simply restates
-- them. Nothing in 0052 is edited.
-- =============================================================================

alter table public.automation_events drop constraint if exists automation_events_kind_known;
alter table public.automation_events
  add constraint automation_events_kind_known
  check (kind in ('item_created', 'item_renamed', 'value_changed', 'item_moved', 'item_archived', 'item_restored', 'comment_added'));

-- ---- items ------------------------------------------------------------------

create or replace function public.automation_capture_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_payload jsonb := '{}'::jsonb;
  v_listens text[];
begin
  if tg_op = 'INSERT' then
    -- An archived task arriving is a restore or an import, not a creation.
    if new.archived_at is not null then return new; end if;
    v_kind := 'item_created';
    v_payload := jsonb_build_object('toGroupId', new.group_id, 'parentItemId', new.parent_item_id);
    -- "a task is added" has always included subitems; "a subitem is added" is
    -- the narrower rule, and only a subitem wakes it.
    v_listens := case when new.parent_item_id is null then array['item_created'] else array['item_created', 'subitem_created'] end;
  elsif new.archived_at is not null and old.archived_at is null then
    v_kind := 'item_archived';
    v_listens := array['item_archived'];
  elsif new.archived_at is null and old.archived_at is not null then
    v_kind := 'item_restored';
    v_listens := array['item_restored'];
  elsif new.group_id is distinct from old.group_id then
    v_kind := 'item_moved';
    v_payload := jsonb_build_object('fromGroupId', old.group_id, 'toGroupId', new.group_id);
    v_listens := array['item_moved_to_group', 'item_moved_from_group'];
  elsif new.name is distinct from old.name then
    v_kind := 'item_renamed';
    v_payload := jsonb_build_object('fromName', old.name, 'toName', new.name, 'parentItemId', new.parent_item_id);
    v_listens := array['item_renamed'];
  else
    return new;
  end if;

  if not private.automation_board_listens(new.board_id, v_listens) then
    return new;
  end if;

  insert into public.automation_events (board_id, item_id, kind, actor_id, payload, depth)
  values (
    new.board_id,
    new.id,
    v_kind,
    coalesce((select auth.uid()), new.created_by),
    v_payload,
    private.automation_depth_for(new.id)
  );
  return new;
end;
$$;

drop trigger if exists items_automation_capture on public.items;
create trigger items_automation_capture
  after insert or update of group_id, archived_at, name on public.items
  for each row execute function public.automation_capture_item();

-- ---- item_column_values -----------------------------------------------------

create or replace function public.automation_capture_value()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb := null;
  v_board uuid;
begin
  if tg_op = 'UPDATE' then
    if new.value_json is not distinct from old.value_json then return new; end if;
    v_before := old.value_json;
  end if;

  v_board := new.board_id;

  if not private.automation_board_listens(
    v_board,
    array['column_changed', 'column_set_to', 'column_cleared', 'number_crosses', 'person_assigned', 'person_unassigned'],
    new.column_id
  ) then
    return new;
  end if;

  insert into public.automation_events (board_id, item_id, kind, column_id, actor_id, payload, depth)
  values (
    v_board,
    new.item_id,
    'value_changed',
    new.column_id,
    (select auth.uid()),
    jsonb_strip_nulls(jsonb_build_object('before', v_before, 'after', new.value_json)),
    private.automation_depth_for(new.item_id)
  );
  return new;
end;
$$;
