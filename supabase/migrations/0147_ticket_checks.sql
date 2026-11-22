-- =============================================================================
-- 0147_ticket_checks.sql
--
-- Two questions TicketService asks before it writes a ticket, answered by the
-- database rather than by what the caller happens to be able to read.
--
--   ticket_taken(workspace, ticket, item)
--     Whether a task in the workspace other than `item`, or one linked to it
--     across a link that carries the ticket, already holds `ticket` (B12).
--     The service checked uniqueness with the caller's own reads, so a ticket
--     held on a private board the caller cannot see looked free, and a typed
--     ticket could duplicate it. Answers yes or no only: which task, and on
--     which board, stays hidden. Members of the workspace only (and the service
--     role); anon cannot call it. Not a unique index: live data may already
--     hold duplicates, and linked tasks legitimately share one.
--
--   can_edit_task(item)
--     Whether the caller may edit the task's board: what items_update checks.
--     TicketService.assign asks it before taking a number from the counter, so
--     a viewer pressing "issue ticket" no longer spends one only to be refused
--     at the write (B25). next_ticket_numbers itself is unchanged (0138): a
--     member calling it directly can still move the counter, by at most 1000.
-- =============================================================================

create or replace function public.ticket_taken(p_workspace uuid, p_ticket text, p_item uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  taken boolean;
begin
  if session_user = 'authenticator' and coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or not coalesce(private.is_workspace_member(p_workspace), false)) then
    raise exception 'ticket_taken: not a member of this workspace' using errcode = 'insufficient_privilege';
  end if;
  if p_workspace is null or nullif(btrim(coalesce(p_ticket, '')), '') is null then
    return false;
  end if;

  with recursive chain(id) as (
    select p_item where p_item is not null
    union
    select case when l.item_a_id = c.id then l.item_b_id else l.item_a_id end
    from chain c
    join public.item_links l on l.item_a_id = c.id or l.item_b_id = c.id
    where not ('ticket' = any(l.excluded))
  )
  select exists (
    select 1
    from public.items i
    join public.boards b on b.id = i.board_id
    where b.workspace_id = p_workspace
      and i.ticket = p_ticket
      and not exists (select 1 from chain c where c.id = i.id)
  ) into taken;
  return taken;
end;
$$;

revoke all on function public.ticket_taken(uuid, text, uuid) from public, anon;
grant execute on function public.ticket_taken(uuid, text, uuid) to authenticated, service_role;

create or replace function public.can_edit_task(p_item uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case
    when coalesce(auth.role(), '') = 'service_role' then true
    else coalesce(private.can_edit_item(p_item), false)
  end;
$$;

revoke all on function public.can_edit_task(uuid) from public, anon;
grant execute on function public.can_edit_task(uuid) to authenticated, service_role;
