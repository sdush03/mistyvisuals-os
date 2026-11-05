-- Migration: Add Questionnaire Family Groups and Member Links (with SET NULL on delete)
-- Date: 2026-11-06

CREATE TABLE IF NOT EXISTS questionnaire_family_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  side VARCHAR(10) NOT NULL CHECK (side IN ('bride', 'groom')),
  name VARCHAR(255) NOT NULL,
  relationship VARCHAR(100) NOT NULL,
  custom_relationship VARCHAR(100),
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  notes TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_family_groups_project_id ON questionnaire_family_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_family_groups_side ON questionnaire_family_groups(project_id, side);

-- Ensure column exists
ALTER TABLE questionnaire_family_members ADD COLUMN IF NOT EXISTS family_group_id UUID;
ALTER TABLE questionnaire_family_members ADD COLUMN IF NOT EXISTS role_in_family VARCHAR(50);

-- Safely drop existing foreign key constraint if it exists, then re-add with ON DELETE SET NULL
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'questionnaire_family_members'
    AND kcu.column_name = 'family_group_id'
    AND tc.constraint_type = 'FOREIGN KEY';

  IF fk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE questionnaire_family_members DROP CONSTRAINT ' || quote_ident(fk_name);
  END IF;
END $$;

ALTER TABLE questionnaire_family_members
  ADD CONSTRAINT fk_questionnaire_family_members_group
  FOREIGN KEY (family_group_id)
  REFERENCES questionnaire_family_groups(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questionnaire_family_group_id ON questionnaire_family_members(family_group_id);
