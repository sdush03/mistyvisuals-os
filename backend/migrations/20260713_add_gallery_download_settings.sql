-- Add download and bulk download configurations to gallery_events
ALTER TABLE gallery_events
  ADD COLUMN IF NOT EXISTS allow_downloads BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_bulk_downloads BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS bulk_download_pin VARCHAR(50);
