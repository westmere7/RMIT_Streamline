-- =============================================================================
-- 0062_comment_replies.sql
--
-- Replies to an update, one level deep. A reply names the update it answers;
-- a reply to a reply is filed under the same update (CommentService does
-- that), so a thread is an update and the replies under it, never a tree.
-- Deleting an update takes its replies with it.
-- =============================================================================

alter table public.comments add column if not exists parent_id uuid references public.comments (id) on delete cascade;

create index if not exists comments_parent_id_idx on public.comments (parent_id) where parent_id is not null;

comment on column public.comments.parent_id is 'The update this one replies to. Null for an update of its own. Always a top-level update: replies are one level deep.';
