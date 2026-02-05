-- Drop deprecated phone column from leads
ALTER TABLE leads DROP COLUMN IF EXISTS phone;
