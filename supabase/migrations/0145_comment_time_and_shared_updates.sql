-- =============================================================================
-- 0145_comment_time_and_shared_updates.sql
--
-- Two things a signed-in session could do to updates (comments) that the app
-- never does (B13). "A session" is current_user authenticated or anon, as in
-- 0142: the service role, the server's routes, the snapshot restore and direct
-- connections are not held.
--
--   created_at   was whatever the session sent, on insert and on update, so an
--                update could be backdated into a thread or re-dated later.
--                On insert a session now gets the server's clock (created_at
--                and updated_at); on update created_at cannot change.
--   shared_id    ties the copies of one update posted to linked tasks
--                (CommentService.addComment, alsoLinked): an edit or delete of
--                one goes to every comment with that shared_id. A session
--                could insert its own comment under someone else's shared_id,
--                so the author's next edit failed on the stranger's copy, and
--                the stranger's comment showed as part of their update. On
--                insert a session may now use a shared_id only if it is new or
--                already used by comments of the same author.
--
-- shared_id, author_id, item_id and parent_id were already fixed on update by
-- comments_stay_put (0079), for everyone.
-- =============================================================================

-- Whether comments by anyone but this author already use this shared_id. Reads
-- across boards the caller cannot see: the copies of an update can sit on a
-- board the newcomer has no access to, and that is exactly the case to refuse.
create or replace function private.shared_id_used_by_other(p_shared uuid, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.comments c
    where c.shared_id = p_shared and c.author_id is distinct from p_author
  );
$$;

revoke all on function private.shared_id_used_by_other(uuid, uuid) from public, anon;
grant execute on function private.shared_id_used_by_other(uuid, uuid) to authenticated, service_role;

create or replace function private.comment_insert_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.created_at := now();
    new.updated_at := now();
    if new.shared_id is not null and private.shared_id_used_by_other(new.shared_id, new.author_id) then
      raise exception 'That update belongs to someone else.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_insert_guard on public.comments;
create trigger comments_insert_guard
  before insert on public.comments
  for each row execute function private.comment_insert_guard();

create or replace function private.comment_time_fixed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.created_at is distinct from old.created_at and current_user in ('authenticated', 'anon') then
    raise exception 'When an update was posted cannot be changed.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_time_fixed on public.comments;
create trigger comments_time_fixed
  before update of created_at on public.comments
  for each row execute function private.comment_time_fixed();
