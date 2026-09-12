-- =============================================================================
-- 0046 – A column type for a plain list of choices
--
-- Status was the only column a board could define its own coloured labels on,
-- so every "which one of these is it" field either borrowed it — and a board
-- gets one status, not several — or became free text and stopped being
-- answerable.
--
-- DROPDOWN is a status column with nothing read into the answer: the same
-- labels and colours, none of the meanings. Only status says whether work is
-- done, stuck or under way, and it keeps that to itself.
--
-- Its settings are `{"kind":"dropdown","labels":[],"defaultLabelId":null}`;
-- values are `{"type":"DROPDOWN","labelId":"..."}`, the same shape a status
-- value has. Nothing existing changes: this only adds a value to the enum.
-- =============================================================================

alter type public.column_type add value if not exists 'DROPDOWN';
