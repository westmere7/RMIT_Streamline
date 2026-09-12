-- =============================================================================
-- 0047 – A people column that is not the PIC
--
-- PERSON has been doing two jobs. It is how a board says who is carrying the
-- work — the workload view, My Work and the dashboard's who-is-busy figures
-- all read it — and it is also the only way to name anybody else: a requester,
-- a contact, an approver. Which of the two a particular column meant was
-- decided by sniffing its name, and the two halves of the app disagreed:
-- analytics treated a column called "Requester" as the requester, while the
-- board views, My Work and the workload counted the same person as an owner.
--
-- So the question gets a type of its own. PERSON stays the PIC and keeps every
-- meaning it had; PEOPLE is a list of people with no bearing on the work.
-- Nothing existing changes: this only adds a value to the enum, and every
-- column already stored as PERSON is still the PIC.
-- =============================================================================

alter type public.column_type add value if not exists 'PEOPLE';
