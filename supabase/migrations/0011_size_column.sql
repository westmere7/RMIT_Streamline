-- =============================================================================
-- 0011_size_column.sql
--
-- A new board column type: T-shirt size (XS, S, M, L, XL), the quick way to
-- say how big a piece of work is. Values are stored like every other column
-- value, as JSON in item_column_values: {"type":"SIZE","size":"M"}.
--
-- Adding an enum value inside a transaction is fine on PostgreSQL 12+ as long
-- as the value is not used in the same transaction; nothing here uses it.
-- =============================================================================

alter type public.column_type add value if not exists 'SIZE';
