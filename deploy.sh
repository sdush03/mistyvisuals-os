#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/var/www/mistyvisuals-os"
cd "$REPO_ROOT"

# Ensure script re-executes cleanly with newly pulled script if deploy.sh itself is updated
if [[ "${DEPLOY_REEXEC:-0}" != "1" && "${1:-}" != "--no-pull" ]]; then
  export DEPLOY_PREV_HASH="$(git rev-parse HEAD)"

  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "[deploy] Uncommitted changes detected. Stashing..."
    export DEPLOY_STASH_CREATED="1"
    git stash push -u -m "deploy-autostash-$(date +%Y%m%d_%H%M%S)"
  fi

  echo "[deploy] Pulling latest code (previous commit: ${DEPLOY_PREV_HASH:0:8})..."
  git checkout main 2>/dev/null || true
  git pull origin main

  export DEPLOY_REEXEC="1"
  exec bash "$0" "$@"
fi

LOG_DIR="/tmp/deploy-logs-os-${USER:-default}"
TS="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$LOG_DIR/deploy_$TS.log"

# Optional notifications (set one of these in the server environment)
# SLACK_WEBHOOK_URL="https://hooks.slack.com/services/XXX/YYY/ZZZ"
# NOTIFY_WEBHOOK_URL="https://your-webhook-endpoint"

# ── Deploy lock and trap definition ──
LOCKFILE="${HOME:-/home/misty}/mistyvisuals-deploy.lock"
rm -f "$LOCKFILE"
echo $$ > "$LOCKFILE"

cleanup_lock() {
  if [[ -f "${LOG_FILE:-}" ]]; then
    echo "[deploy] Log saved locally to $LOG_FILE"
  fi
  rm -f "$LOCKFILE"
}
trap cleanup_lock EXIT
trap cleanup_lock ERR

mkdir -p "$LOG_DIR" || true
exec > >(tee -a "$LOG_FILE") 2>&1

# Load environment variables (needed for non-interactive SSH sessions like GitHub Actions)
if [[ -f "$REPO_ROOT/backend/.env" ]]; then
  set -a
  source "$REPO_ROOT/backend/.env"
  set +a
fi

# Ensure production build/runtime for frontend
export NODE_ENV=production

# One-time cleanup: move any legacy repo-local deploy logs out of the repo
LEGACY_LOG_DIR="$REPO_ROOT/deploy-logs"
if [[ -d "$LEGACY_LOG_DIR" ]]; then
  echo "[deploy] Moving legacy deploy logs out of repo..."
  mkdir -p "$LOG_DIR/legacy"
  mv "$LEGACY_LOG_DIR" "$LOG_DIR/legacy/$TS" || rm -rf "$LEGACY_LOG_DIR"
fi

# Sync deploy tracker script if present
if [[ -f "$REPO_ROOT/scripts/misty-tracker.js" ]]; then
  chmod +x "$REPO_ROOT/scripts/misty-tracker.js"
  mkdir -p "$HOME/.pm2" 2>/dev/null || true
  cp "$REPO_ROOT/scripts/misty-tracker.js" "$HOME/.pm2/misty-tracker.js" 2>/dev/null || true
  mkdir -p "/home/misty/.pm2" 2>/dev/null || true
  cp "$REPO_ROOT/scripts/misty-tracker.js" "/home/misty/.pm2/misty-tracker.js" 2>/dev/null || true
  sudo ln -sf /home/misty/.pm2/misty-tracker.js /usr/local/bin/misty-status 2>/dev/null || true
  sudo ln -sf /home/misty/.pm2/misty-tracker.js /usr/local/bin/misty-log-deploy 2>/dev/null || true
fi

log_deploy() {
  local app="$1"
  local hash="$2"
  local note="${3:-Standard deploy}"

  echo "[deploy] Logging deploy for $app ($hash: $note)..."
  if [[ -f "$REPO_ROOT/scripts/misty-tracker.js" ]]; then
    node "$REPO_ROOT/scripts/misty-tracker.js" log "$app" "$hash" "$note" || true
  elif command -v misty-log-deploy >/dev/null 2>&1; then
    misty-log-deploy "$app" "$hash" "$note" || true
  elif [[ -f "/home/misty/.pm2/misty-tracker.js" ]]; then
    node "/home/misty/.pm2/misty-tracker.js" log "$app" "$hash" "$note" || true
  elif [[ -f "$HOME/.pm2/misty-tracker.js" ]]; then
    node "$HOME/.pm2/misty-tracker.js" log "$app" "$hash" "$note" || true
  fi
}

PREV_HASH="${DEPLOY_PREV_HASH:-$(git rev-parse HEAD~1 2>/dev/null || git rev-parse HEAD)}"
NEW_HASH="$(git rev-parse HEAD)"
STASH_CREATED="${DEPLOY_STASH_CREATED:-}"

# Check for manual force flag (--force or -f)
FORCE_DEPLOY="${FORCE:-}"
if [[ "${1:-}" == "--force" || "${1:-}" == "-f" ]]; then
  FORCE_DEPLOY="1"
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
  git checkout main 2>/dev/null || true
  git reset --hard "$PREV_HASH"

  echo "[deploy] Installing backend deps (rollback)..."
  cd "$REPO_ROOT/backend"
  npm install
  npx prisma generate
  bash "$REPO_ROOT/backend/migrate.sh"
  pm2 restart misty-backend --update-env
  log_deploy misty-backend "$PREV_HASH" "Rollback"

  echo "[deploy] Installing frontend deps (rollback)..."
  cd "$REPO_ROOT/frontend"
  npm install
  rm -f .next/lock
  NODE_OPTIONS="--max-old-space-size=1024" npm run build
  pm2 restart misty-frontend --update-env
  log_deploy misty-frontend "$PREV_HASH" "Rollback"

  echo "[deploy] Rollback complete."
}

CHANGED_FILES="$(git diff --name-only "$PREV_HASH" "$NEW_HASH" 2>/dev/null || true)"
BACKEND_CHANGED="$(echo "$CHANGED_FILES" | grep -E '^backend/' || true)"
MIGRATIONS_CHANGED="$(git diff --name-only "$PREV_HASH" "$NEW_HASH" -- backend/migrations 2>/dev/null || true)"
PRISMA_CHANGED="$(git diff --name-only "$PREV_HASH" "$NEW_HASH" -- backend/prisma 2>/dev/null || true)"
BACKEND_DEPS_CHANGED="$(echo "$CHANGED_FILES" | grep -E '^backend/package(-lock)?\.json$' || true)"
FRONTEND_DEPS_CHANGED="$(echo "$CHANGED_FILES" | grep -E '^frontend/package(-lock)?\.json$' || true)"
FRONTEND_CHANGED="$(echo "$CHANGED_FILES" | grep -E '^frontend/' || true)"

if [[ -n "$FORCE_DEPLOY" ]]; then
  echo "[deploy] Force flag passed. Rebuilding and restarting backend and frontend..."
  BACKEND_CHANGED="force"
  FRONTEND_CHANGED="force"
fi

if [[ -n "$BACKEND_CHANGED" ]]; then
  echo "[deploy] Backend changes detected. Installing deps if needed..."
  cd "$REPO_ROOT/backend"
  if [[ -n "$BACKEND_DEPS_CHANGED" || -n "$FORCE_DEPLOY" ]]; then
    echo "[deploy] backend package.json changed → npm install"
    npm install
  else
    echo "[deploy] backend package.json unchanged → skipping npm install"
  fi

  echo "[deploy] Running migrations..."
  bash "$REPO_ROOT/backend/migrate.sh"

  echo "[deploy] Deleting obsolete global directory event if present..."
  node "$REPO_ROOT/backend/scripts/delete_global_directory.js" || true

  if [[ -n "$PRISMA_CHANGED" || -n "$BACKEND_DEPS_CHANGED" || -n "$FORCE_DEPLOY" ]]; then
    echo "[deploy] Prisma schema or deps changed → running prisma generate..."
    npx prisma generate
  fi

  echo "[deploy] Running backfill for gallery codes..."
  node "$REPO_ROOT/backend/scripts/backfill_gallery_codes.js" || true

  echo "[deploy] Fixing video scan flags and sync complete galleries..."
  node "$REPO_ROOT/backend/scripts/fix_video_scan_flags.js" || true

  echo "[deploy] Restarting backend..."
  pm2 restart misty-backend --update-env
  log_deploy misty-backend "$NEW_HASH" "OS Backend Deploy"
else
  echo "[deploy] No backend changes → skipping backend steps"
fi

if [[ -n "$FRONTEND_CHANGED" || -d "$REPO_ROOT/frontend/.next-staging" ]]; then
  echo "[deploy] Frontend changes detected."
  cd "$REPO_ROOT/frontend"

  if [[ "${SKIP_FRONTEND_BUILD:-0}" == "1" && -d "$REPO_ROOT/frontend/.next-staging" ]]; then
    if [[ -n "$FRONTEND_DEPS_CHANGED" || -n "$FORCE_DEPLOY" ]]; then
      echo "[deploy] frontend package.json changed → installing runtime deps..."
      npm install --omit=dev
    else
      echo "[deploy] frontend package.json unchanged → skipping npm install"
    fi

    echo "[deploy] Swapping prebuilt .next-staging from CI..."
    rm -rf .next
    mv .next-staging .next
  else
    if [[ -n "$FRONTEND_DEPS_CHANGED" || -n "$FORCE_DEPLOY" ]]; then
      echo "[deploy] frontend package.json changed → npm install"
      npm install --include=dev
    else
      echo "[deploy] frontend package.json unchanged → installing dev deps anyway for build"
      npm install --include=dev
    fi

    echo "[deploy] Cleaning up build workers and freeing memory..."
    pm2 reload mycircle-backend || true
    log_deploy mycircle-backend "$NEW_HASH" "OS frontend build memory reload"
    pkill -f "jest-worker/processChild.js" || true
    pkill -f "next-render-worker" || true
    sync || true

    echo "[deploy] Building frontend..."
    rm -rf .next
    NODE_OPTIONS="--max-old-space-size=1024" npm run build
  fi

  echo "[deploy] Restarting frontend..."
  pm2 restart misty-frontend --update-env
  log_deploy misty-frontend "$NEW_HASH" "OS Frontend Deploy"
else
  echo "[deploy] No frontend changes → skipping build and restart"
fi

echo "[deploy] Done."
notify "✅ Deploy succeeded on $(hostname)."

if [[ -n "$STASH_CREATED" ]]; then
  echo "[deploy] Restoring stashed changes..."
  git stash pop || echo "[deploy] Stash pop had conflicts; resolve manually."
fi

# Clean up local package-lock changes if they were not part of the pulled diff
if [[ -z "$BACKEND_DEPS_CHANGED" && -f "$REPO_ROOT/backend/package-lock.json" ]]; then
  git restore "$REPO_ROOT/backend/package-lock.json" || true
fi
if [[ -z "$FRONTEND_DEPS_CHANGED" && -f "$REPO_ROOT/frontend/package-lock.json" ]]; then
  git restore "$REPO_ROOT/frontend/package-lock.json" || true
fi
if [[ -z "$(echo "$CHANGED_FILES" | grep -E '^package(-lock)?\\.json$' || true)" && -f "$REPO_ROOT/package-lock.json" ]]; then
  git restore "$REPO_ROOT/package-lock.json" || true
fi
