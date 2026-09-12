-- =============================================================================
-- 0045 – A link can be told which columns are the same field
--
-- Column pairing across two boards is worked out by name and type: "Status" on
-- one board is "Status" on the other, and a lone people column pairs with the
-- other board's lone people column whatever it is called. Everything else is
-- reported as unpaired, and there was no way to say otherwise — a column added
-- to one board after the link was made had no counterpart and no means of
-- getting one, so it simply never synced.
--
-- `pairs` is the answer the user gives: an array of two-element arrays of
-- column ids, one entry per pairing they made by hand. Order inside an entry
-- carries no meaning — a link is symmetric, and each side reads the pair from
-- its own direction. The automatic rules still run; these come first.
-- =============================================================================

alter table public.item_links
  add column if not exists pairs jsonb not null default '[]'::jsonb;
