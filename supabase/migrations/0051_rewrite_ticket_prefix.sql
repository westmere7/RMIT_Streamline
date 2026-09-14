-- =============================================================================
-- 0051_rewrite_ticket_prefix.sql
--
-- Changing a workspace's ticket prefix, in one statement.
--
-- It used to be one UPDATE per ticket. Every ticket gets a different new value,
-- so the batching in items.updateMany — which groups rows that share a patch —
-- could group nothing, and a workspace with a few hundred tickets spent a few
-- hundred round trips to Singapore rewriting them. Long enough that somebody
-- gives up and closes the tab, and a rewrite abandoned half way is the worst
-- outcome of the three: some tickets renamed, some not, and nothing to say
-- which. One statement cannot be half-done.
--
-- Admin because a prefix is what every stakeholder already quotes, and the
-- rewrite reaches boards the admin may not personally be an editor of — so the
-- check is on the workspace rather than board by board, and the function runs
-- as definer to match.
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

  -- Every board named has to belong to a workspace this caller administers.
  -- Checked before anything is written, so a list with one stranger in it
  -- rewrites nothing rather than most of itself.
  if auth.uid() is not null and exists (
       select 1 from public.boards b
       where b.id = any (p_boards) and not private.is_workspace_admin(b.workspace_id)
     )
  then
    raise exception 'rewrite_ticket_prefix: not an admin of every workspace these boards belong to';
  end if;

  -- The number is what people count by and never moves; only the prefix does.
  -- Re-padded to three digits the way formatTicket() writes them, so a ticket
  -- typed in as CP_14 comes out of a rewrite as PROD_014 rather than PROD_14.
  update public.items i
     set ticket = p_prefix || '_' || lpad(ltrim(split_part(i.ticket, '_', 2), '0'), 3, '0')
   where i.board_id = any (p_boards)
     and i.ticket ~ '^[A-Z0-9]{1,8}_[0-9]*[1-9][0-9]*$'
     and split_part(i.ticket, '_', 1) is distinct from p_prefix;
  get diagnostics rewritten = row_count;
  return rewritten;
end;
$$;

comment on function public.rewrite_ticket_prefix(uuid[], text) is
  'Puts a new prefix on every ticket these boards hold, keeping each number. One statement: it cannot be half-applied.';

revoke all on function public.rewrite_ticket_prefix(uuid[], text) from public;
grant execute on function public.rewrite_ticket_prefix(uuid[], text) to authenticated, service_role;
