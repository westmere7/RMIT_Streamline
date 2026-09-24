-- =============================================================================
-- 0058_portal_link_settings.sql
--
-- The portal's two links each get settings of their own. The board link gains
-- the period it opens on and whether a visitor may switch its theme; the
-- booking form gains a theme of its own (it is a different page with a
-- different look), a switch for that, its own headline and lead, and whether
-- it offers staff a sign-in.
--
-- The booking form starts on whatever theme the portal was set to, so no link
-- changes its look on the day this lands.
-- =============================================================================

alter table public.department_portals
  add column if not exists default_range text not null default '3m',
  add column if not exists theme_switch boolean not null default true,
  add column if not exists booking_theme text not null default 'system',
  add column if not exists booking_theme_switch boolean not null default true,
  add column if not exists booking_headline text,
  add column if not exists booking_lead text,
  add column if not exists booking_sign_in boolean not null default true;

update public.department_portals set booking_theme = default_theme where booking_theme <> default_theme;

alter table public.department_portals drop constraint if exists department_portals_default_range_known;
alter table public.department_portals
  add constraint department_portals_default_range_known check (default_range in ('1w', '2w', '1m', '3m', '6m'));

alter table public.department_portals drop constraint if exists department_portals_booking_theme_known;
alter table public.department_portals
  add constraint department_portals_booking_theme_known check (booking_theme in ('light', 'dark', 'system'));

alter table public.department_portals drop constraint if exists department_portals_booking_copy_length;
alter table public.department_portals
  add constraint department_portals_booking_copy_length check (
    (booking_headline is null or char_length(booking_headline) <= 80)
    and (booking_lead is null or char_length(booking_lead) <= 240)
  );

comment on column public.department_portals.default_range is 'The period the portal board opens on when the link names none: 1w, 2w, 1m, 3m or 6m.';
comment on column public.department_portals.theme_switch is 'Whether a portal visitor may switch the theme for themselves.';
comment on column public.department_portals.booking_theme is 'The booking form''s own theme: light, dark or system.';
comment on column public.department_portals.booking_theme_switch is 'Whether a booking-form visitor may switch the theme for themselves.';
comment on column public.department_portals.booking_headline is 'The booking page''s headline. Null uses the built-in one.';
comment on column public.department_portals.booking_lead is 'The line under the booking page''s headline. Null uses the built-in one.';
comment on column public.department_portals.booking_sign_in is 'Whether the booking form offers staff a sign-in that fills their details in.';
