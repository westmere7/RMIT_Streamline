-- Where to look at a deliverable, and where its final file is.
--
-- Two columns rather than one with a kind flag: a deliverable normally acquires
-- them in order and then has both — something to review while it is being made,
-- and the signed-off artwork once it is done. The closed row in the asset list
-- reports which of the two exist, which a single column could not say.
--
-- Internal, like `notes`. Neither is published to a stakeholder portal or a
-- public dashboard (see PortalDeliverable and publicDashboardSnapshot): a
-- review link is working material, and a final file is the team's to hand over
-- deliberately rather than by being on a page somebody was sent.
--
-- Additive and nullable, so every existing deliverable simply has neither.

alter table public.item_assets
  add column if not exists preview_url text,
  add column if not exists artwork_url text;

-- A link is a link, not a document. Long enough for a signed storage URL and
-- short enough that nobody pastes a file into it.
alter table public.item_assets
  drop constraint if exists item_assets_preview_url_length;
alter table public.item_assets
  add constraint item_assets_preview_url_length
  check (preview_url is null or char_length(preview_url) <= 2000);

alter table public.item_assets
  drop constraint if exists item_assets_artwork_url_length;
alter table public.item_assets
  add constraint item_assets_artwork_url_length
  check (artwork_url is null or char_length(artwork_url) <= 2000);
