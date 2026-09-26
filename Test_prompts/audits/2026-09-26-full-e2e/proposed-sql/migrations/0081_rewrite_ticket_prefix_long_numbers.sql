-- =============================================================================
-- 0081_rewrite_ticket_prefix_long_numbers.sql     PROPOSED — audit F-107
--
-- A prefix change keeps four-digit ticket numbers whole.
--
-- 0051 re-padded each number with lpad(n, 3, '0'). Postgres lpad truncates a
-- string that is already longer than the length asked for, so CP_1234 became
-- PROD_123 — the same code as another task's. The local provider pads with
-- formatTicket(), which never truncates, so the two disagreed above 999. The
-- live workspace's counter stood at 923 on 26 September 2026.
--
-- Same function, same checks, the pad widened to the number's own length.
--
-- Test on the disposable stack: give a task CP_1234 and one CP_014, rewrite to
-- PROD, and expect PROD_1234 and PROD_014. Then append to sequence.txt.
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

  if auth.uid() is not null and exists (
       select 1 from public.boards b
       where b.id = any (p_boards) and not private.is_workspace_admin(b.workspace_id)
     )
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

comment on function public.rewrite_ticket_prefix(uuid[], text) is
  'Puts a new prefix on every ticket these boards hold, keeping each number whole. One statement: it cannot be half-applied.';

revoke all on function public.rewrite_ticket_prefix(uuid[], text) from public;
grant execute on function public.rewrite_ticket_prefix(uuid[], text) to authenticated, service_role;
