#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/var/www/mistyvisuals-os"
LOG_DIR="$REPO_ROOT/deploy-logs"
TS="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$LOG_DIR/deploy_$TS.log"

# Optional notifications (set one of these in the server environment)
# SLACK_WEBHOOK_URL="https://hooks.slack.com/services/XXX/YYY/ZZZ"
# NOTIFY_WEBHOOK_URL="https://your-webhook-endpoint"

mkdir -p "$LOG_DIR"

exec > >(tee -a "$LOG_FILE") 2>&1

cd "$REPO_ROOT"

PREV_HASH="$(git rev-parse HEAD)"
STASH_CREATED=""

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[deploy] Uncommitted changes detected. Stashing..."
  STASH_CREATED="1"
  git stash push -u -m "deploy-autostash-$TS"
fi

notify() {
  local message="$1"
  local payload
  payload=$(printf '{"text":"%s"}' "$(echo "$message" | sed 's/"/\\"/g')")
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST -H 'Content-Type: application/json' -d "$payload" "$SLACK_WEBHOOK_URL" >/dev/null || true
  elif [[ -n "${NOTIFY_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST -H 'Content-Type: application/json' -d "$payload" "$NOTIFY_WEBHOOK_URL" >/dev/null || true
  fi
}

rollback() {
  echo "[deploy] ERROR detected. Rolling back to $PREV_HASH..."
  notify "❌ Deploy failed on $(hostname). Rolling back to $PREV_HASH."
  git checkout "$PREV_HASH"

  echo "[deploy] Installing backend deps (rollback)..."
  cd "$REPO_ROOT/backend"
  npm install
  bash "$REPO_ROOT/backend/migrate.sh"
  pm2 restart misty-backend --update-env

  echo "[deploy] Installing frontend deps (rollback)..."
  cd "$REPO_ROOT/frontend"
  npm install
  npm run build
  pm2 restart misty-frontend --update-env

  echo "[deploy] Rollback complete."
}

trap rollback ERR

echo "[deploy] Pulling latest code..."
git pull origin main

NEW_HASH="$(git rev-parse HEAD)"
CHANGED_FILES="$(git diff --name-only "$PREV_HASH" "$NEW_HASH")"
BACKEND_DEPS_CHANGED="$(echo "$CHANGED_FILES" | grep -E '^backend/package(-lock)?\.json$' || true)"
FRONTEND_DEPS_CHANGED="$(echo "$CHANGED_FILES" | grep -E '^frontend/package(-lock)?\.json$' || true)"
FRONTEND_CHANGED="$(echo "$CHANGED_FILES" | grep -E '^frontend/' || true)"

echo "[deploy] Backend changes detected. Installing deps if needed..."
cd "$REPO_ROOT/backend"
if [[ -n "$BACKEND_DEPS_CHANGED" ]]; then
  echo "[deploy] backend package.json changed → npm install"
  npm install
else
  echo "[deploy] backend package.json unchanged → skipping npm install"
fi

echo "[deploy] Running migrations..."
bash "$REPO_ROOT/backend/migrate.sh"

echo "[deploy] Restarting backend..."
pm2 restart misty-backend --update-env

if [[ -n "$FRONTEND_CHANGED" ]]; then
  echo "[deploy] Frontend changes detected. Installing deps if needed..."
  cd "$REPO_ROOT/frontend"
  if [[ -n "$FRONTEND_DEPS_CHANGED" ]]; then
    echo "[deploy] frontend package.json changed → npm install"
    npm install
  else
    echo "[deploy] frontend package.json unchanged → skipping npm install"
  fi

  echo "[deploy] Building frontend..."
  npm run build

  echo "[deploy] Restarting frontend..."
  pm2 restart misty-frontend --update-env
else
  echo "[deploy] No frontend changes → skipping build and restart"
fi

echo "[deploy] Done."
notify "✅ Deploy succeeded on $(hostname)."

if [[ -n "$STASH_CREATED" ]]; then
  echo "[deploy] Restoring stashed changes..."
  git stash pop || echo "[deploy] Stash pop had conflicts; resolve manually."
fi
