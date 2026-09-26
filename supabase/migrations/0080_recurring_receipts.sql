-- =============================================================================
-- 0080_recurring_receipts.sql            audit F-105, 26 September 2026
--
-- A recurring rule's receipt names no task, and now it can be written.
--
-- 0052 gave automation_schedule_fires `primary key (rule_id, fire_key, item_id)`
-- with item_id "nullable", and a partial unique index for the rows where it is
-- null. But Postgres makes every primary-key column NOT NULL, so those rows
-- could never exist: claimScheduleFire's insert failed with 23502, and every
-- recurring rule — the Weekly review recipe among them — failed every hour it
-- was due. Proven on the disposable database (pg_attribute.attnotnull = true;
-- the insert raised `null value in column "item_id" … violates not-null`).
--
-- Uniqueness moves to two partial unique indexes, one each side of null. A
-- duplicate still raises 23505, which is what claimScheduleFire reads as
-- "somebody already did this", so the code is unchanged.
--
-- Checked on a disposable stack before it shipped: a recurring rule at the
-- current Melbourne hour fired once over two runner ticks and left one receipt
-- with no task; inserting that receipt again was refused with 23505.
-- =============================================================================

alter table public.automation_schedule_fires drop constraint if exists automation_schedule_fires_pkey;
alter table public.automation_schedule_fires alter column item_id drop not null;

create unique index if not exists automation_schedule_fires_item_idx
  on public.automation_schedule_fires (rule_id, fire_key, item_id)
  where item_id is not null;

-- 0052's automation_schedule_fires_ruleless_idx already covers item_id is null.
create unique index if not exists automation_schedule_fires_ruleless_idx
  on public.automation_schedule_fires (rule_id, fire_key)
  where item_id is null;
