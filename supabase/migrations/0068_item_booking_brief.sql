-- =============================================================================
-- 0068_item_booking_brief.sql
--
-- A booked task keeps its own copy of the brief the form composed, so any
-- Brief column (0066) can show it: the one on Task Allocation, the one on the
-- team board it is allocated to, or one somebody adds to a board later. Until
-- now the brief lived only in a Brief column, and a board without one got a
-- flattened copy prepended to the description.
--
-- Written once, by booking. Not selected with the item's other fields: it is
-- read only when a Brief column is being filled in.
--
-- Filled in for work booked before this, from what there is, in this order:
-- the task's Brief column; the portal's copy of the brief; the flattened brief
-- at the top of the description (everything before "Request details"). Only
-- tasks the admins were told were booked (TASK_BOOKED) are touched.
-- =============================================================================

alter table public.items add column if not exists booking_brief text;

comment on column public.items.booking_brief is
  'The brief as the booking form composed it (rich text). Written once at booking; read when a Brief column is filled in. Null for work that was not booked.';

with booked as (
  select distinct n.entity_id as item_id from public.notifications n where n.type = 'TASK_BOOKED'
)
update public.items i
set booking_brief = v.value_json->>'text'
from public.item_column_values v
join public.board_columns c on c.id = v.column_id
where v.item_id = i.id
  and c.type = 'BRIEF'
  and coalesce(btrim(v.value_json->>'text'), '') <> ''
  and i.booking_brief is null
  and i.id in (select item_id from booked);

with booked as (
  select distinct n.entity_id as item_id from public.notifications n where n.type = 'TASK_BOOKED'
)
update public.items i
set booking_brief = pr.public_brief
from public.portal_requests pr
where pr.item_id = i.id
  and coalesce(btrim(pr.public_brief), '') <> ''
  and i.booking_brief is null
  and i.id in (select item_id from booked);

with booked as (
  select distinct n.entity_id as item_id from public.notifications n where n.type = 'TASK_BOOKED'
)
update public.items i
set booking_brief = btrim(split_part(i.description, E'\n\nRequest details', 1))
where i.booking_brief is null
  and i.description like 'Service:%'
  and i.id in (select item_id from booked);
