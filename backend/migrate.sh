#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MIGRATIONS_DIR="$ROOT_DIR/backend/migrations"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Please install PostgreSQL client tools." >&2
  exit 1
fi

DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  echo "DATABASE_URL is not set. Please export it before running." >&2
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT NOW());"

shopt -s nullglob
for f in "$MIGRATIONS_DIR"/*.sql; do
  fname=$(basename "$f")
  applied=$(psql "$DB_URL" -tAc "SELECT 1 FROM schema_migrations WHERE filename='$fname'")
  if [ "$applied" != "1" ]; then
    echo "Applying $fname"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations (filename) VALUES ('$fname');"
  else
    echo "Skipping $fname (already applied)"
  fi
done
