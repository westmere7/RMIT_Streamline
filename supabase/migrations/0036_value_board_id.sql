-- 0036_value_board_id.sql
--
-- Which board a column value belongs to, on the row itself.
--
-- An open board subscribes to `item_column_values` so it refreshes while other
-- people work on it (src/features/boards/hooks/use-board-realtime.ts). The table
-- had nothing to filter that subscription by — a value is keyed by item and
-- column, and neither is the board — so every subscriber heard about every cell
-- edit anywhere in the workspace, and each one cost the board that heard it a
-- full snapshot refetch. On a large board that is seconds of work in answer to
-- someone else's keystroke on a board they are not looking at.
--
-- The board is not new information: a value's item already belongs to one, and
-- `enforce_value_same_board` below has always looked it up to check the column
-- matches. Keeping the answer means Realtime can filter the stream server-side,
-- so those events never reach a browser that has no use for them. It follows
-- what `item_assets` already does with the same column for the same reason.

alter table public.item_column_values
  add column if not exists board_id uuid references public.boards (id) on delete cascade;

-- The integrity check this table already ran, now also recording what it looked
-- up. One statement either way: the board comes back from the same row that
-- proves the column and the item agree.
create or replace function public.enforce_value_same_board()
returns trigger
language plpgsql
as $$
declare
  found_board uuid;
begin
  select i.board_id into found_board
  from public.items i
  join public.board_columns c on c.board_id = i.board_id
  where i.id = new.item_id and c.id = new.column_id;

  if found_board is null then
    raise exception 'column % is not on the same board as item %', new.column_id, new.item_id
      using errcode = 'foreign_key_violation';
  end if;

  new.board_id := found_board;
  return new;
end;
$$;

-- Existing rows. The trigger only fires when a value is written, so what is
-- already stored is filled in here.
update public.item_column_values v
set board_id = i.board_id
from public.items i
where i.id = v.item_id and v.board_id is distinct from i.board_id;

-- Nothing may be written without it: a value whose board was unknown would be
-- missed by every subscription, and a board that quietly stopped updating is
-- worse than one that never did.
alter table public.item_column_values alter column board_id set not null;

create index if not exists item_column_values_board_id_idx on public.item_column_values (board_id);
