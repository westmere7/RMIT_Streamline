-- =============================================================================
-- 0138_lock_definer_functions.sql
--
-- Five SECURITY DEFINER functions could be called by anyone holding the public
-- anon key, with no sign-in:
--   next_ticket_numbers, next_bug_ticket_numbers  (bump a workspace's counter,
--     by any amount: a big enough bump overflows it and stops every booking),
--   rewrite_ticket_prefix                         (rewrite tickets on any board),
--   count_form_booking                            (inflate a counter),
--   automation_sweep                              (delete automation history).
--
-- Their migrations revoked EXECUTE from PUBLIC, but Supabase also grants it to
-- anon and authenticated by default, and each guard read
-- "if auth.uid() is not null and not <check>", which waves anon through exactly
-- as it waves the service role through.
--
-- Now:
--   - anon can execute none of them; automation_sweep is the service role's alone;
--   - each guard admits the service role and direct database connections (the
--     migrator, maintenance), and otherwise needs a signed-in caller who passes
--     the check: a member of the workspace, or for the prefix an admin of every
--     workspace the boards belong to;
--   - a counter moves by at most 1000 at a time.
-- =============================================================================

create or replace function public.next_ticket_numbers(p_workspace uuid, p_count integer default 1)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  first_number integer;
begin
  if p_count is null or p_count < 1 or p_count > 1000 then
    raise exception 'next_ticket_numbers: count must be between 1 and 1000';
  end if;
  -- Through the API (session_user authenticator) only the service role or a member.
  if session_user = 'authenticator' and coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or not private.is_workspace_member(p_workspace)) then
    raise exception 'next_ticket_numbers: not a member of this workspace';
  end if;

  update public.workspaces
     set ticket_counter = coalesce(ticket_counter, 0) + p_count,
         updated_at = now()
   where id = p_workspace
   returning ticket_counter - p_count + 1 into first_number;

  if first_number is null then
    raise exception 'next_ticket_numbers: no workspace %', p_workspace;
  end if;
  return first_number;
end;
$$;

create or replace function public.next_bug_ticket_numbers(p_workspace uuid, p_count integer default 1)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  first_number integer;
begin
  if p_count is null or p_count < 1 or p_count > 1000 then
    raise exception 'next_bug_ticket_numbers: count must be between 1 and 1000';
  end if;
  if session_user = 'authenticator' and coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or not private.is_workspace_member(p_workspace)) then
    raise exception 'next_bug_ticket_numbers: not a member of this workspace';
  end if;

  update public.workspaces
     set bug_ticket_counter = coalesce(bug_ticket_counter, 0) + p_count,
         updated_at = now()
   where id = p_workspace
   returning bug_ticket_counter - p_count + 1 into first_number;

  if first_number is null then
    raise exception 'next_bug_ticket_numbers: no workspace %', p_workspace;
  end if;
  return first_number;
end;
$$;

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
       where b.id = any (p_boards) and not private.is_workspace_admin(b.workspace_id)
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

create or replace function public.count_form_booking(p_workspace uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if session_user = 'authenticator' and coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or not private.is_workspace_member(p_workspace)) then
    raise exception 'count_form_booking: not a member of this workspace';
  end if;
  update public.workspaces
     set booking_form_bookings = coalesce(booking_form_bookings, 0) + 1
   where id = p_workspace;
end;
$$;

revoke execute on function public.next_ticket_numbers(uuid, integer) from public, anon;
grant execute on function public.next_ticket_numbers(uuid, integer) to authenticated, service_role;
revoke execute on function public.next_bug_ticket_numbers(uuid, integer) from public, anon;
grant execute on function public.next_bug_ticket_numbers(uuid, integer) to authenticated, service_role;
revoke execute on function public.rewrite_ticket_prefix(uuid[], text) from public, anon;
grant execute on function public.rewrite_ticket_prefix(uuid[], text) to authenticated, service_role;
revoke execute on function public.count_form_booking(uuid) from public, anon;
grant execute on function public.count_form_booking(uuid) to authenticated, service_role;
revoke execute on function public.automation_sweep(integer) from public, anon, authenticated;
grant execute on function public.automation_sweep(integer) to service_role;
