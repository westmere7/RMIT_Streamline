-- =============================================================================
-- 0021_item_reference.sql
--
-- The booking code a task is known by: "TA-4F2K", shown as the ID# column at the
-- front of every board and quoted in emails, chats and corridors.
--
-- The booking process hands it out, so a task nobody booked has none. It is not
-- unique in the database on purpose: linking two tasks can carry the code from
-- one to the other, and both then answer to it, which is the point of a link.
-- Seven characters is what the column has room for and what a person will read
-- back correctly; the check is the only rule the database enforces.
-- =============================================================================

alter table public.items add column if not exists reference text;

alter table public.items drop constraint if exists items_reference_length;
alter table public.items add constraint items_reference_length check (reference is null or length(reference) between 1 and 7);

comment on column public.items.reference is
  'Booking code (ID#), at most 7 characters. Assigned by booking; shared across a link when that link carries it.';

create index if not exists items_reference_idx on public.items (reference) where reference is not null;
