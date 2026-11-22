-- =============================================================================
-- 0139_ticket_prefix_non_members.sql
--
-- rewrite_ticket_prefix asked "is there a board here whose workspace the caller
-- does not administer?" with `not private.is_workspace_admin(...)`. For someone
-- who is not in that workspace at all the check is NULL rather than false, so
-- the row never counted and the rewrite went ahead: a signed-in member of one
-- workspace could rename the tickets on another's boards. NULL now counts as
-- "not an admin". Otherwise as 0138.
-- =============================================================================

create or replace function public.rewrite_ticket_prefix(p_boards uuid[], p_prefix text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rewritten integer;
begin
  if p_prefix is null or p_prefix !~ '^[A-Z0-9]{1,8}$' then
    raise exception 'rewrite_ticket_prefix: "%" is not a ticket prefix', p_prefix;
  end if;
  if p_boards is null or array_length(p_boards, 1) is null then
    return 0;
  end if;

  if session_user = 'authenticator' and coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or exists (
       select 1 from public.boards b
       where b.id = any (p_boards) and not coalesce(private.is_workspace_admin(b.workspace_id), false)
     ))
  then
    raise exception 'rewrite_ticket_prefix: not an admin of every workspace these boards belong to';
  end if;

  -- At least three digits, the way formatTicket() writes them, and never fewer
  -- than the number has: CP_14 becomes PROD_014, CP_1234 stays PROD_1234.
  update public.items i
     set ticket = p_prefix || '_' || lpad(
           ltrim(split_part(i.ticket, '_', 2), '0'),
           greatest(3, length(ltrim(split_part(i.ticket, '_', 2), '0'))),
           '0')
   where i.board_id = any (p_boards)
     and i.ticket ~ '^[A-Z0-9]{1,8}_[0-9]*[1-9][0-9]*$'
     and split_part(i.ticket, '_', 1) is distinct from p_prefix;
  get diagnostics rewritten = row_count;
  return rewritten;
end;
$$;

revoke execute on function public.rewrite_ticket_prefix(uuid[], text) from public, anon;
grant execute on function public.rewrite_ticket_prefix(uuid[], text) to authenticated, service_role;
