-- Migration: Add client_onboarding_profiles table for independent Bride and Groom onboarding
CREATE TABLE IF NOT EXISTS client_onboarding_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('bride', 'groom')),
  name VARCHAR(255),
  phone_primary VARCHAR(50),
  phone_secondary VARCHAR(50),
  email VARCHAR(255),
  instagram VARCHAR(100),
  selfie_url VARCHAR(1024),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_client_onboarding_project_role UNIQUE (project_id, role)
);

CREATE INDEX IF NOT EXISTS idx_client_onboarding_project_id ON client_onboarding_profiles(project_id);
