-- Migration: Add share_token to project_questionnaires for team brief sharing
-- Date: 2026-11-19

ALTER TABLE project_questionnaires 
ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid();

UPDATE project_questionnaires 
SET share_token = gen_random_uuid() 
WHERE share_token IS NULL;

ALTER TABLE project_questionnaires 
ALTER COLUMN share_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_questionnaires_share_token ON project_questionnaires(share_token);
