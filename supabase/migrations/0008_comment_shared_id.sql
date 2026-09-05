-- =============================================================================
-- 0008_comment_shared_id.sql
--
-- An update posted to linked tasks is one thing said once. Every copy written in
-- that action carries the same shared_id, which is how an edit reaches all of
-- them and how the update shows that it lives on more than one task.
--
-- Null for an ordinary update, which is every update written before this.
-- =============================================================================

alter table public.comments
  add column if not exists shared_id uuid;

create index if not exists comments_shared_idx on public.comments (shared_id) where shared_id is not null;
