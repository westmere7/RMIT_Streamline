-- =============================================================================
-- 0079_comments_stay_put.sql            audit F-104 / F-164, 26 September 2026
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
-- The matching policy change is policies/0020_comments_update_needs_edit_rights.sql.
--
-- Checked on a disposable stack before it shipped, through PostgREST with a
-- member's own JWT: editing an update's text still works; PATCHing its item_id
-- is refused with 'An update stays on its task'; a reply whose parent is on
-- another task is refused; a reply on the same task still posts.
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
