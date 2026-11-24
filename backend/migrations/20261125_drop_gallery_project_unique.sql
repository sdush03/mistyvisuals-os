-- Ensure no unique constraint or unique index remains on gallery_events(project_id)
-- so a project can have multiple linked galleries.
DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN
    SELECT i.relname AS index_name
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    WHERE t.relname = 'gallery_events'
      AND ix.indisunique = true
      AND a.attname = 'project_id'
      AND ix.indnatts = 1
  LOOP
    EXECUTE format('ALTER TABLE gallery_events DROP CONSTRAINT IF EXISTS %I', idx.index_name);
    EXECUTE format('DROP INDEX IF EXISTS %I', idx.index_name);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_gallery_events_project_id
  ON gallery_events(project_id)
  WHERE project_id IS NOT NULL;
