-- =============================================================================
-- 0105_item_baselines.sql
--
-- A board's baseline: the dates each task was planned for when somebody last
-- said "this is the plan". The Gantt draws them under today's bars, so a date
-- that has slipped shows how far, and a stakeholder asking why something is
-- late gets the history rather than a guess.
--
-- Its own table, not columns on items: writing a baseline touches every task
-- on the board, and an update to items moves their updated_at, which the
-- dashboard reads as when done work without deliverables was finished.
--
-- One row a task, replaced when the baseline is saved again. Policies in
-- policies/0024_item_baselines_policies.sql.
-- =============================================================================

create table if not exists public.item_baselines (
  item_id    uuid primary key references public.items (id) on delete cascade,
  board_id   uuid not null references public.boards (id) on delete cascade,
  start_date date,
  end_date   date,
  saved_at   timestamptz not null default now(),
  saved_by   uuid references public.profiles (id) on delete set null
);

comment on table public.item_baselines is
  'Each task''s planned dates as of the board''s last saved baseline, for slippage on the Gantt.';

create index if not exists item_baselines_board_id_idx on public.item_baselines (board_id);

-- Saving replaces the whole board's baseline in one statement, so a board is
-- never left with half of one plan and half of another. Runs as the caller:
-- the table's policies decide whether they may.
create or replace function public.save_board_baseline(p_board_id uuid, p_rows jsonb)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  delete from public.item_baselines where board_id = p_board_id;
  insert into public.item_baselines (item_id, board_id, start_date, end_date, saved_by)
  select r.item_id, p_board_id, r.start_date, r.end_date, auth.uid()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(item_id uuid, start_date date, end_date date)
  join public.items i on i.id = r.item_id and i.board_id = p_board_id;
$$;

grant execute on function public.save_board_baseline(uuid, jsonb) to authenticated;
