-- =============================================================================
-- 0079_comments_stay_put.sql            PROPOSED — audit F-104 / F-164
--
-- An edit changes what an update says, never where it is.
--
-- comments_update_author (policies/0001) checks only that the caller wrote the
-- comment, in USING and WITH CHECK alike, and nothing froze the row's place.
-- So an author could PATCH item_id onto any task — a private board, another
-- workspace — or hang an update under another task's thread with parent_id.
-- The comment then showed in that task's Updates, attributed to them.
--
-- The app writes item_id, author_id, shared_id and parent_id once, at insert
-- (src/data/supabase/repositories/misc-repositories.ts), and edits only the
-- body and mentions, so refusing any change to the other four costs nothing.
-- Snapshot restore writes with session_replication_role = replica, which skips
-- this trigger, so a restore still brings back what it saved.
--
-- The matching policy change is proposed-sql/policies/0020_comments_update_needs_edit_rights.sql.
--
-- Before moving this into supabase/migrations (which applies it to production
-- on the next build): apply it on the disposable stack, then check
--   1. editing an update's text still works for its author;
--   2. PATCH /rest/v1/comments?id=eq.<id> {"item_id":"<other>"} as the author
--      is refused with 'An update stays on its task';
--   3. inserting a reply whose parent is on another task is refused.
-- Then append the file name to supabase/sequence.txt.
-- =============================================================================

create or replace function public.comments_stay_put()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.item_id is distinct from old.item_id
     or new.author_id is distinct from old.author_id
     or new.shared_id is distinct from old.shared_id
     or new.parent_id is distinct from old.parent_id then
    raise exception 'An update stays on its task: only its text can change.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_stay_put on public.comments;
create trigger comments_stay_put
  before update on public.comments
  for each row execute function public.comments_stay_put();

-- A reply answers an update on the same task, and threads are one level deep:
-- its parent is a top-level update of that task.
create or replace function public.comment_reply_on_same_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent record;
begin
  if new.parent_id is null then
    return new;
  end if;
  select c.item_id, c.parent_id into parent from public.comments c where c.id = new.parent_id;
  if parent is null or parent.item_id is distinct from new.item_id or parent.parent_id is not null then
    raise exception 'A reply answers an update on the same task.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists comment_reply_on_same_task on public.comments;
create trigger comment_reply_on_same_task
  before insert on public.comments
  for each row execute function public.comment_reply_on_same_task();
