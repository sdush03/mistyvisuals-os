-- Inspirations collections (formerly Moodboards)
CREATE TABLE IF NOT EXISTS website_inspirations (
  id                     SERIAL PRIMARY KEY,
  slug                   TEXT UNIQUE NOT NULL,
  title                  TEXT NOT NULL,
  subtitle               TEXT,
  description            TEXT,
  cover_image_url        TEXT,
  cover_image_mobile_url TEXT,
  display_order          INT NOT NULL DEFAULT 0,
  is_published           BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE website_inspirations ADD COLUMN IF NOT EXISTS cover_image_mobile_url TEXT;
ALTER TABLE website_inspirations ADD COLUMN IF NOT EXISTS category TEXT;

-- Photos inside an inspiration collection
CREATE TABLE IF NOT EXISTS website_inspiration_photos (
  id                SERIAL PRIMARY KEY,
  inspiration_id    INT NOT NULL REFERENCES website_inspirations(id) ON DELETE CASCADE,
  file_url          TEXT NOT NULL,
  file_url_thumb    TEXT,
  original_filename TEXT,
  display_order     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_inspirations_published ON website_inspirations(is_published, display_order);
CREATE INDEX IF NOT EXISTS idx_website_inspirations_slug ON website_inspirations(slug);
