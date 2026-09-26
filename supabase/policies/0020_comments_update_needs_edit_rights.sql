-- =============================================================================
-- 0020_comments_update_needs_edit_rights.sql      audit F-104, 26 September 2026
--
-- The author may edit their update while they can still comment on its task.
--
-- Replaces comments_update_author from policies/0001, whose WITH CHECK was only
-- `author_id = auth.uid()`. Now the row must also stay on a task the caller
-- can edit — the same test comments_insert applies to posting in the first
-- place. Together with migrations 0079 (which freezes item_id) this closes
-- moving a comment onto a board the author cannot see.
--
-- Checked with 0079 on a disposable stack: an editor who wrote an update can
-- still edit it.
-- =============================================================================

drop policy if exists comments_update_author on public.comments;
create policy comments_update_author on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and private.can_edit_item(item_id));
