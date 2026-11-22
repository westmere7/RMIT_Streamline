-- =============================================================================
-- 0137_automation_board_moves.sql
--
-- A task that changes boards leaves one and arrives on the other.
--
-- Allocating a request, re-allocating it, or moving a task to another board
-- changes its board_id and group_id in one update. Until now that raised a
-- single `item_moved`, filed on the board it reached, so:
--   - the receiving board's "When a task is created" rules never fired for an
--     allocated request, though they did for a booking routed straight there;
--   - the board it left heard nothing, so "When a task leaves <group>" never
--     fired when a request was allocated out of Booked by Form.
--
-- Now each row that changes boards (the task and each of its subitems) raises
-- two events:
--   - `item_created` on the board it reached, payload `arrived: true` and
--     `fromBoardId`, heard by "created", "subitem created" and name keywords;
--   - `item_moved` on the board it left, payload `left: true`, `fromGroupId`
--     and `toBoardId` (no `toGroupId`), heard by "moved from group" only.
-- The runner lets a rule on the board it left only tell people, comment, make
-- a task on its own board or call a webhook: the task is no longer there.
--
-- Restated whole from 0057; the trigger now also listens to board_id.
-- =============================================================================

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
  v_actor uuid := coalesce((select auth.uid()), new.created_by);
  v_depth integer;
begin
  if tg_op = 'INSERT' then
    if new.archived_at is not null then return new; end if;
    v_kind := 'item_created';
    v_payload := jsonb_build_object('toGroupId', new.group_id, 'parentItemId', new.parent_item_id, 'toName', new.name);
    v_listens := case when new.parent_item_id is null
      then array['item_created', 'name_contains']
      else array['item_created', 'subitem_created', 'name_contains'] end;
  elsif new.board_id is distinct from old.board_id then
    -- Two events for one update: the board it left, then the board it reached.
    v_depth := private.automation_depth_for(new.id);
    if private.automation_board_listens(old.board_id, array['item_moved_from_group']) then
      insert into public.automation_events (board_id, item_id, kind, actor_id, payload, depth)
      values (
        old.board_id,
        new.id,
        'item_moved',
        v_actor,
        jsonb_build_object('fromGroupId', old.group_id, 'toGroupId', null, 'parentItemId', new.parent_item_id, 'left', true, 'toBoardId', new.board_id),
        v_depth
      );
    end if;
    if new.archived_at is null and private.automation_board_listens(
      new.board_id,
      case when new.parent_item_id is null
        then array['item_created', 'name_contains']
        else array['item_created', 'subitem_created', 'name_contains'] end
    ) then
      insert into public.automation_events (board_id, item_id, kind, actor_id, payload, depth)
      values (
        new.board_id,
        new.id,
        'item_created',
        v_actor,
        jsonb_build_object('toGroupId', new.group_id, 'parentItemId', new.parent_item_id, 'toName', new.name, 'arrived', true, 'fromBoardId', old.board_id),
        v_depth
      );
    end if;
    return new;
  elsif new.archived_at is not null and old.archived_at is null then
    v_kind := 'item_archived';
    v_listens := array['item_archived'];
  elsif new.archived_at is null and old.archived_at is not null then
    v_kind := 'item_restored';
    v_listens := array['item_restored'];
  elsif new.group_id is distinct from old.group_id then
    v_kind := 'item_moved';
    v_payload := jsonb_build_object('fromGroupId', old.group_id, 'toGroupId', new.group_id, 'parentItemId', new.parent_item_id);
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
    v_actor,
    v_payload,
    private.automation_depth_for(new.id)
  );
  return new;
end;
$$;

drop trigger if exists items_automation_capture on public.items;
create trigger items_automation_capture
  after insert or update of group_id, board_id, archived_at, name on public.items
  for each row execute function public.automation_capture_item();
