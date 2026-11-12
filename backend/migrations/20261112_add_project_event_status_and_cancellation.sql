-- Add status and cancellation_reason to project_events
ALTER TABLE project_events 
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Backfill existing nulls to 'active'
UPDATE project_events SET status = 'active' WHERE status IS NULL;

-- Index for efficient active event querying
CREATE INDEX IF NOT EXISTS idx_project_events_status 
  ON project_events(project_id, status);

-- Trigger to prevent accidental hard-deletes if questionnaire data exists
CREATE OR REPLACE FUNCTION prevent_project_event_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM questionnaire_schedules WHERE project_event_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot hard-delete project_event with existing questionnaire data. Use status = ''cancelled''.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_project_event_hard_delete'
  ) THEN
    CREATE TRIGGER trg_prevent_project_event_hard_delete
    BEFORE DELETE ON project_events
    FOR EACH ROW EXECUTE FUNCTION prevent_project_event_hard_delete();
  END IF;
END $$;
