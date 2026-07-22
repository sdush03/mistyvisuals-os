-- Add width and height columns to website_story_photos
-- These store the logical pixel dimensions of the original image
-- (accounting for EXIF orientation), so the API can tell clients
-- whether a photo is landscape or portrait without extra requests.

ALTER TABLE website_story_photos
  ADD COLUMN IF NOT EXISTS width  INT,
  ADD COLUMN IF NOT EXISTS height INT;

CREATE INDEX IF NOT EXISTS idx_website_story_photos_dims
  ON website_story_photos (story_id, width, height);
