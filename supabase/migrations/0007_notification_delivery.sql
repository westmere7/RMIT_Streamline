-- =============================================================================
-- 0007_notification_delivery.sql
--
-- Two ways for something to reach the inbox, and the per-person settings that
-- decide which one it takes.
--
--   NOTIFICATION  the loud one: a red badge, and an operating-system
--                 notification when the browser has been given permission
--   UPDATE        the quiet one: it lands in the inbox with a grey badge and
--                 never interrupts
--
-- Nothing at all is written for an event the recipient has turned off, or for a
-- board they have unsubscribed from — the decision is made in
-- src/services/notification-service.ts, which both providers share, and the
-- column defaults to NOTIFICATION so a row written by anything older is still
-- the loud kind it was when it was written.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_delivery') then
    create type public.notification_delivery as enum ('NOTIFICATION', 'UPDATE');
  end if;
end
$$;

alter table public.notifications
  add column if not exists delivery public.notification_delivery not null default 'NOTIFICATION';

-- The inbox counts unread rows per delivery for the two badges.
create index if not exists notifications_user_delivery_idx
  on public.notifications (user_id, delivery, read_at);

-- -----------------------------------------------------------------------------
-- Preferences: one row per person, created the first time they change something.
-- `types` is a map of notification_type -> 'NOTIFICATION' | 'UPDATE' | 'OFF';
-- anything absent falls back to the shipped defaults in
-- src/domain/notification/notification.ts.
-- -----------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  types           jsonb not null default '{}'::jsonb,
  -- Boards this person has unsubscribed from: nothing from them arrives.
  muted_board_ids uuid[] not null default '{}',
  -- Whether the browser may raise an operating-system notification.
  browser_enabled boolean not null default false,
  updated_at      timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
