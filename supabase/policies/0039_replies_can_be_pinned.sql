-- =============================================================================
-- 0039_replies_can_be_pinned.sql
--
-- A reply can be pinned like an update (decided 2026-11-22): to the top of the
-- task's updates, and to the overview. 0150 kept pins to top-level updates;
-- these two policies are 0150's without that condition. The pin still has to
-- name a comment on the same task, and pinning still needs the right to edit it.
-- =============================================================================

drop policy if exists comment_pins_insert on public.comment_pins;
create policy comment_pins_insert on public.comment_pins
  for insert to authenticated
  with check (
    pinned_by = (select auth.uid())
    and coalesce(private.can_edit_item(item_id), false)
    and exists (select 1 from public.comments c where c.id = comment_id and c.item_id = comment_pins.item_id)
  );

drop policy if exists comment_pins_update on public.comment_pins;
create policy comment_pins_update on public.comment_pins
  for update to authenticated
  using (coalesce(private.can_edit_item(item_id), false))
  with check (
    coalesce(private.can_edit_item(item_id), false)
    and exists (select 1 from public.comments c where c.id = comment_id and c.item_id = comment_pins.item_id)
  );
