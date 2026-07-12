-- Add is_blocked column to guests table
ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
