-- Migration: Secure onboarding selfies and rate limit verify attempts

-- 1. Add storage_key to client_onboarding_profiles to track private storage location
ALTER TABLE client_onboarding_profiles
ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1024);

-- 2. Rate limiting table for client portal passcode verification attempts
CREATE TABLE IF NOT EXISTS client_portal_verify_attempts (
  id SERIAL PRIMARY KEY,
  ip VARCHAR(100) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 1,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_client_portal_verify_ip_slug UNIQUE (ip, slug)
);

CREATE INDEX IF NOT EXISTS idx_client_portal_verify_ip_slug ON client_portal_verify_attempts(ip, slug);
