-- Migration: Add Wedding Vision Questionnaire and supporting tables
-- Date: 2026-11-03

CREATE TABLE IF NOT EXISTS project_questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  has_opened BOOLEAN NOT NULL DEFAULT FALSE,
  current_step INT NOT NULL DEFAULT 1,
  story JSONB NOT NULL DEFAULT '{}'::jsonb,
  traditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  photo_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  video_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  special_considerations JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_touches JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_questionnaires_project_id UNIQUE (project_id)
);
CREATE INDEX IF NOT EXISTS idx_project_questionnaires_project_id ON project_questionnaires(project_id);
CREATE INDEX IF NOT EXISTS idx_project_questionnaires_status ON project_questionnaires(status);

CREATE TABLE IF NOT EXISTS questionnaire_family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  side VARCHAR(10) NOT NULL CHECK (side IN ('bride', 'groom')),
  name VARCHAR(255) NOT NULL,
  relationship VARCHAR(100) NOT NULL,
  custom_relationship VARCHAR(100),
  category VARCHAR(50) NOT NULL CHECK (category IN ('parents', 'siblings', 'grandparents', 'extended', 'friends', 'other')),
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  is_remembering BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  parent_member_id UUID REFERENCES questionnaire_family_members(id) ON DELETE SET NULL,
  photo_url VARCHAR(1024),
  storage_key VARCHAR(1024),
  original_photo_url VARCHAR(1024),
  original_storage_key VARCHAR(1024),
  crop_data JSONB,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questionnaire_family_project_id ON questionnaire_family_members(project_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_family_side ON questionnaire_family_members(project_id, side);
CREATE INDEX IF NOT EXISTS idx_questionnaire_family_parent ON questionnaire_family_members(parent_member_id);

CREATE TABLE IF NOT EXISTS questionnaire_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_event_id UUID NOT NULL REFERENCES project_events(id) ON DELETE CASCADE,
  schedule_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_questionnaire_schedules_event UNIQUE (project_id, project_event_id)
);
CREATE INDEX IF NOT EXISTS idx_questionnaire_schedules_project_id ON questionnaire_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_schedules_event_id ON questionnaire_schedules(project_event_id);

CREATE TABLE IF NOT EXISTS questionnaire_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_url VARCHAR(1024) NOT NULL,
  storage_key VARCHAR(1024) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('pdf', 'image', 'video')),
  file_size INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questionnaire_invitations_project_id ON questionnaire_invitations(project_id);

CREATE TABLE IF NOT EXISTS questionnaire_music_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url VARCHAR(1024) NOT NULL,
  reference_type VARCHAR(50) NOT NULL CHECK (reference_type IN ('exact_song', 'inspiration')),
  deliverable_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  deliverable_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questionnaire_music_project_id ON questionnaire_music_references(project_id);

CREATE TABLE IF NOT EXISTS questionnaire_media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section VARCHAR(50) NOT NULL,
  file_url VARCHAR(1024) NOT NULL,
  storage_key VARCHAR(1024) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT,
  reference_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questionnaire_media_project_id ON questionnaire_media_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_media_storage_key ON questionnaire_media_assets(storage_key);
