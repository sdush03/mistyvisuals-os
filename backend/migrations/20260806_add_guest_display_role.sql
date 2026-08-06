-- Add display_role and selfie_url to guests table
ALTER TABLE guests ADD COLUMN IF NOT EXISTS display_role VARCHAR(50);
ALTER TABLE guests ADD COLUMN IF NOT EXISTS selfie_url VARCHAR(1024);
