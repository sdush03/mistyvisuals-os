-- Drop unique index to allow multiple galleries per project
DROP INDEX IF EXISTS idx_gallery_events_project_id;

-- Create standard non-unique index for performance when filtering galleries by project
CREATE INDEX IF NOT EXISTS idx_gallery_events_project_id
  ON gallery_events(project_id)
  WHERE project_id IS NOT NULL;
