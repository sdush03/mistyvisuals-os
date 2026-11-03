-- Migration: Remove is_onboarding_exempt column from projects table
-- All client projects now uniformly require mandatory onboarding.

ALTER TABLE projects DROP COLUMN IF EXISTS is_onboarding_exempt;
