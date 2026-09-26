-- =============================================================================
-- 0084_bug_tickets.sql
--
-- Bug reports get tickets of their own series: BUG_001, BUG_002 and on. A bug
-- is not one of the team's jobs, so it must not take the number the next
-- booking would have had; its counter sits beside ticket_counter and is bumped
-- the same way, in one statement under one row lock. A prefix change in
-- Settings leaves bug tickets alone (TicketService), and the workspace prefix
-- cannot be BUG.
-- =============================================================================

alter table public.workspaces add column if not exists bug_ticket_counter integer not null default 0;

comment on column public.workspaces.bug_ticket_counter is
  'How many bug tickets (BUG_001, …) this workspace has handed out. Bumped by next_bug_ticket_numbers(); never decreased.';

create or replace function public.next_bug_ticket_numbers(p_workspace uuid, p_count integer default 1)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  first_number integer;
begin
  if p_count is null or p_count < 1 then
    raise exception 'next_bug_ticket_numbers: count must be at least 1';
  end if;
  if auth.uid() is not null and not private.is_workspace_member(p_workspace) then
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

revoke all on function public.next_bug_ticket_numbers(uuid, integer) from public;
grant execute on function public.next_bug_ticket_numbers(uuid, integer) to authenticated, service_role;

-- A report filed before the series existed (v0.52.0 to v0.52.2) gets the next
-- bug ticket, oldest first, so every bug has one.
do $$
declare
  r record;
  n integer;
begin
  for r in
    select i.id, b.workspace_id
    from public.items i
    join public.boards b on b.id = i.board_id
    where b.system = 'APP_DEVELOPMENT' and (i.ticket is null or i.ticket = '') and i.parent_item_id is null
    order by i.created_at
  loop
    update public.workspaces set bug_ticket_counter = bug_ticket_counter + 1 where id = r.workspace_id returning bug_ticket_counter into n;
    update public.items set ticket = 'BUG_' || lpad(n::text, greatest(3, length(n::text)), '0') where id = r.id;
  end loop;
end $$;
