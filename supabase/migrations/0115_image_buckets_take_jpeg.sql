-- =============================================================================
-- 0115_image_buckets_take_jpeg.sql
--
-- The image buckets took WebP and nothing else (avatars and item-covers since
-- 0005 and 0013, bug-screenshots since 0082), because the browser re-encodes
-- every upload as WebP before sending it. Safari cannot: it decodes WebP but,
-- asked to encode a canvas as WebP, returns a PNG. That PNG was refused here
-- ("mime type not supported"), so members on an iPhone, an iPad or Safari on a
-- Mac could not set an avatar, add a cover or attach a screenshot.
--
-- The browser now falls back to JPEG where it cannot write WebP
-- (src/lib/image-encode.ts), so the buckets take JPEG as well. Size limits and
-- the storage policies are unchanged.
-- =============================================================================

update storage.buckets
   set allowed_mime_types = array['image/webp', 'image/jpeg']
 where id in ('avatars', 'item-covers', 'bug-screenshots');
