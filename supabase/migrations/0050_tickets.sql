-- =============================================================================
-- 0050_tickets.sql
--
-- The ticket: "CP_014". What a stakeholder quotes in an email and what the team
-- searches for, and the one thing about a task that has to mean exactly one task.
--
-- What changes from the booking code it replaces:
--
--   * the shape. "TA-4F2K" was four hex digits of a hash of the row's id — no
--     order, no meaning, and 65,536 of them, which at a few hundred tasks is a
--     coin flip on whether two of them already collide. A ticket is a prefix
--     the workspace chooses, an underscore, and the number the workspace is up
--     to, so tickets read in the order the work arrived.
--
--   * who hands them out. A counter on the workspace, bumped in one statement
--     (next_ticket_numbers below), so two bookings landing together cannot be
--     given the same number. The counter counts tickets issued, not tasks: a
--     deleted task does not free its number, because a number is something
--     somebody was told.
--
--   * the name of the column. `reference` sat one letter away from the "Reference"
--     LINK column that holds a brief's URL, which is a footgun in a system where
--     saying the wrong one costs somebody their booking.
--
-- Still not unique in the database, and still on purpose: linking two tasks
-- carries the ticket from one to the other, and both then answer to it, which
-- is the point of a link. Uniqueness that admits that exception is a question
-- about the link graph, so it is asked in TicketService, which can see it.
-- =============================================================================

-- ---- The column ------------------------------------------------------------

alter table public.items drop constraint if exists items_reference_length;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'items' and column_name = 'reference')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'items' and column_name = 'ticket')
  then
    alter table public.items rename column reference to ticket;
  end if;
end $$;

alter table public.items add column if not exists ticket text;

drop index if exists items_reference_idx;

-- ---- The workspace's prefix and counter -------------------------------------

alter table public.workspaces add column if not exists ticket_prefix text;
alter table public.workspaces add column if not exists ticket_counter integer not null default 0;

alter table public.workspaces drop constraint if exists workspaces_ticket_prefix_shape;
alter table public.workspaces add constraint workspaces_ticket_prefix_shape
  check (ticket_prefix is null or ticket_prefix ~ '^[A-Z0-9]{1,8}$');

alter table public.workspaces drop constraint if exists workspaces_ticket_counter_positive;
alter table public.workspaces add constraint workspaces_ticket_counter_positive
  check (ticket_counter >= 0);

comment on column public.workspaces.ticket_prefix is
  'What this workspace stamps on its tickets ("CP" gives CP_001). Null means the default.';
comment on column public.workspaces.ticket_counter is
  'How many tickets this workspace has handed out. Bumped by next_ticket_numbers(); never decreased.';

-- ---- Re-ticket everything that already has a code ---------------------------
--
-- One number per distinct existing code per workspace, in the order the work
-- first arrived — so two tasks linked to each other, which share a code today
-- because that is what a link does, still share one afterwards.

with scoped as (
  select i.id, i.ticket as code, i.created_at, b.workspace_id
  from public.items i
  join public.boards b on b.id = i.board_id
  where i.ticket is not null and i.ticket <> ''
),
codes as (
  select workspace_id, code, min(created_at) as first_seen
  from scoped
  group by workspace_id, code
),
numbered as (
  select workspace_id, code, row_number() over (partition by workspace_id order by first_seen, code) as n
  from codes
)
update public.items i
set ticket = 'CP_' || lpad(n.n::text, 3, '0')
from scoped s
join numbered n on n.workspace_id = s.workspace_id and n.code = s.code
where i.id = s.id;

-- The counter picks up where the renumbering left off.
update public.workspaces w
set ticket_counter = coalesce((
  select count(distinct i.ticket)
  from public.items i
  join public.boards b on b.id = i.board_id
  where b.workspace_id = w.id and i.ticket is not null
), 0);

-- Anything that is not a ticket by now was never a code this system issued.
update public.items set ticket = null where ticket is not null and ticket !~ '^[A-Z0-9]{1,8}_[0-9]{1,9}$';

alter table public.items drop constraint if exists items_ticket_shape;
alter table public.items add constraint items_ticket_shape
  check (ticket is null or ticket ~ '^[A-Z0-9]{1,8}_[0-9]{1,9}$');

comment on column public.items.ticket is
  'The ticket a task is known by ("CP_014"). Issued by TicketService; shared across a link when that link carries it.';

create index if not exists items_ticket_idx on public.items (ticket) where ticket is not null;

-- ---- Links that were told not to carry the code -----------------------------

update public.item_links
set excluded = array_replace(excluded, 'reference', 'ticket')
where 'reference' = any (excluded);

-- ---- Handing out the next number --------------------------------------------
--
-- One statement, so the row lock is the whole of the concurrency argument: two
-- bookings landing together queue, and each leaves with its own number.
--
-- Definer because the counter lives on `workspaces`, which only an admin may
-- update — and the person who needs a ticket is whoever is booking the work.
-- Membership is checked here instead; the public booking form reaches this
-- through the server route, which runs as the service role.

create or replace function public.next_ticket_numbers(p_workspace uuid, p_count integer default 1)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  first_number integer;
begin
  if p_count is null or p_count < 1 then
    raise exception 'next_ticket_numbers: count must be at least 1';
  end if;
  if auth.uid() is not null and not private.is_workspace_member(p_workspace) then
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

revoke all on function public.next_ticket_numbers(uuid, integer) from public;
grant execute on function public.next_ticket_numbers(uuid, integer) to authenticated, service_role;
