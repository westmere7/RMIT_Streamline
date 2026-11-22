-- =============================================================================
-- 0038_checklist_ticks_by_author.sql
--
-- A checklist in an update is its author's list: only the person who wrote the
-- update ticks or unticks its boxes (decided 2026-11-22). Until now anyone who
-- could edit the task could (0095). Everyone who can see the task still sees
-- the ticks, on the update and on its pinned copy on the overview.
--
-- The author still needs to be able to work on the task, as before; a copy of
-- the update on a linked task follows where the author can work on it too.
-- =============================================================================

drop policy if exists comment_checks_insert on public.comment_checks;
create policy comment_checks_insert on public.comment_checks
  for insert to authenticated
  with check (
    checked_by = (select auth.uid())
    and private.can_edit_item(item_id)
    and exists (
      select 1 from public.comments c
      where c.id = comment_id and c.item_id = comment_checks.item_id and c.author_id = (select auth.uid())
    )
  );

drop policy if exists comment_checks_delete on public.comment_checks;
create policy comment_checks_delete on public.comment_checks
  for delete to authenticated
  using (
    private.can_edit_item(item_id)
    and exists (select 1 from public.comments c where c.id = comment_id and c.author_id = (select auth.uid()))
  );
