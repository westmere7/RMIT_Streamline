-- =============================================================================
-- 0042 – The Brief column becomes rich text  (see 0041)
--
-- Boards created before 0041 carry the booking brief in a LONG_TEXT column
-- called "Brief" (src/services/booking-service.ts taskAllocationColumns). It is
-- the same words either way, so the column is converted in place rather than
-- added beside the old one — a second "Brief" column would leave every booking
-- already on the board pointing at the empty one.
--
-- By name and by type, and only that name: a LONG_TEXT column called "Notes" or
-- "Assets & specs" is prose somebody typed, not a document the form composed,
-- and converting it would change what its cell does without anybody asking. The
-- type matters as much as the name — a demo board carries a LINK column also
-- called "Brief", holding an address rather than a document, and it is left
-- exactly as it is.
--
-- What is already in those cells is plain text, which is valid markup: it reads
-- back as paragraphs, and the numbered lines an older brief was composed of
-- read back as a numbered list. Nothing is rewritten; only the discriminant on
-- the value has to follow the column, since every cell stores its own type.
-- =============================================================================

update public.board_columns
   set type = 'RICH_TEXT'
 where type = 'LONG_TEXT'
   and lower(btrim(name)) = 'brief';

update public.item_column_values v
   set value_json = jsonb_set(v.value_json, '{type}', '"RICH_TEXT"')
  from public.board_columns c
 where c.id = v.column_id
   and c.type = 'RICH_TEXT'
   and v.value_json->>'type' = 'LONG_TEXT';
