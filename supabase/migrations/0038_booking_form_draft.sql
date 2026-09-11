-- =============================================================================
-- 0038_booking_form_draft.sql
--
-- The booking form is a four-step wizard now, and shaping one is no longer the
-- five-minute job of renaming a question. An administrator adds a service type,
-- builds its brief block by block, comes back to it tomorrow — and for the whole
-- of that time stakeholders are still booking through the form that was live
-- when they started.
--
-- So the editor writes to workspaces.booking_form_draft and nothing else.
-- booking_form stays exactly as it was until somebody publishes the draft onto
-- it deliberately. Half-finished work can therefore be saved, closed and picked
-- up again without a single stakeholder ever meeting it.
--
-- booking_templates gains a description: with several saved forms in a
-- workspace, a name alone stops saying which one is the summer form and which
-- one was the Open Day experiment.
--
-- The JSON shape is src/domain/booking/booking-template.ts (BookingFormTemplate,
-- version 2); it is validated by the app before it is written.
-- =============================================================================

alter table public.workspaces add column if not exists booking_form_draft jsonb;

comment on column public.workspaces.booking_form_draft is
  'The booking form an admin is working on (BookingFormTemplate JSON). Never served to stakeholders: booking_form is the live one, and publishing copies this onto it. Null means no work in progress.';

comment on column public.workspaces.booking_form is
  'The live booking form (BookingFormTemplate JSON) — what every stakeholder is served. Null means the built-in form. Written only by publishing a draft.';

alter table public.booking_templates add column if not exists description text;

comment on column public.booking_templates.description is
  'What this saved form is for, in the words of whoever saved it. Null when they did not say.';
