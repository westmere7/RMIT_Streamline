-- =============================================================================
-- 0056_automation_keyword_triggers.sql
--
-- Rules that listen for words.
--
-- "The name contains …" needs the name on the event, which `item_created`
-- never carried (a rename already does), so the item trigger now writes
-- `toName` on creation as well. Otherwise the three keyword triggers ride on
-- events the queue already raises — a task added or renamed, an update
-- posted, a value changed — and only the enqueue checks have to learn that a
-- board with such a rule is listening. The functions are restated whole;
-- nothing in 0052 or 0055 is edited.
-- =============================================================================

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
    if new.archived_at is not null then return new; end if;
    v_kind := 'item_created';
    v_payload := jsonb_build_object('toGroupId', new.group_id, 'parentItemId', new.parent_item_id, 'toName', new.name);
    v_listens := case when new.parent_item_id is null
      then array['item_created', 'name_contains']
      else array['item_created', 'subitem_created', 'name_contains'] end;
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
    v_listens := array['item_renamed', 'name_contains'];
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
    array['column_changed', 'column_set_to', 'column_cleared', 'column_contains', 'number_crosses', 'person_assigned', 'person_unassigned'],
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

-- ---- comments ---------------------------------------------------------------

create or replace function public.automation_capture_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_board uuid;
begin
  select i.board_id into v_board from public.items i where i.id = new.item_id;
  if v_board is null then return new; end if;
  if not private.automation_board_listens(v_board, array['comment_added', 'comment_contains']) then return new; end if;

  insert into public.automation_events (board_id, item_id, kind, actor_id, payload, depth)
  values (
    v_board,
    new.item_id,
    'comment_added',
    new.author_id,
    jsonb_build_object('commentId', new.id, 'body', left(new.body, 2000)),
    private.automation_depth_for(new.item_id)
  );
  return new;
end;
$$;
