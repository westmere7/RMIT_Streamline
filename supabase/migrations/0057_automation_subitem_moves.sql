-- =============================================================================
-- 0057_automation_subitem_moves.sql
--
-- A move says whether it was a subitem's.
--
-- When a task is dragged to another group its subitems go with it, and each
-- of them raises an `item_moved` row of its own. A rule "when a task moves to
-- Done" then fired once for the task and once more per subitem, which is
-- five notifications about one drag. The row now carries `parentItemId`, and
-- the runner ignores a move that has one: a subitem never moves on its own,
-- so the parent's row is the one that happened. Restated whole; 0052, 0055
-- and 0056 are untouched.
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
    coalesce((select auth.uid()), new.created_by),
    v_payload,
    private.automation_depth_for(new.id)
  );
  return new;
end;
$$;
