-- Migration: Add unique constraint on cities(name, state, country)
-- This prevents duplicate cities from being created concurrently
-- and enables the ON CONFLICT DO NOTHING upsert pattern in getOrCreateCity().
--
-- Safe to run multiple times (IF NOT EXISTS).

CREATE UNIQUE INDEX IF NOT EXISTS cities_name_state_country_unique
  ON cities (name, state, country);
