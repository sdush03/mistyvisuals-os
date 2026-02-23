#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://os.mistyvisuals.com}"
EMAIL="${MV_EMAIL:-}"
PASSWORD="${MV_PASSWORD:-}"

TMP_DIR="$(mktemp -d)"
COOKIE_JAR="$TMP_DIR/mv.cookies"

pass=0
fail=0

report() {
  local ok="$1"
  local label="$2"
  local code="$3"
  if [[ "$ok" == "1" ]]; then
    echo "✅ $label ($code)"
    pass=$((pass + 1))
  else
    echo "❌ $label ($code)"
    fail=$((fail + 1))
  fi
}

request() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local jar="${4:-}"
  local out="$TMP_DIR/body"
  local code
  if [[ -n "$data" ]]; then
    code=$(curl -s -o "$out" -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      ${jar:+-b "$jar"} ${jar:+-c "$jar"} \
      -d "$data" "$url")
  else
    code=$(curl -s -o "$out" -w "%{http_code}" -X "$method" \
      ${jar:+-b "$jar"} ${jar:+-c "$jar"} \
      "$url")
  fi
  echo "$code"
}

echo "=== Misty Visuals OS sanity check ==="
echo "Base URL: $BASE_URL"
echo

code=$(request GET "$BASE_URL/api/health")
report $([[ "$code" == "200" ]] && echo 1 || echo 0) "GET /api/health" "$code"

code=$(request GET "$BASE_URL/api/version")
report $([[ "$code" == "200" ]] && echo 1 || echo 0) "GET /api/version" "$code"

code=$(request GET "$BASE_URL/api/leads")
report $([[ "$code" == "401" ]] && echo 1 || echo 0) "GET /api/leads (unauth)" "$code"

code=$(request GET "$BASE_URL/api/auth/me")
report $([[ "$code" == "401" ]] && echo 1 || echo 0) "GET /api/auth/me (unauth)" "$code"

if [[ -n "$EMAIL" && -n "$PASSWORD" ]]; then
  payload=$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASSWORD")
  code=$(request POST "$BASE_URL/api/auth/login" "$payload" "$COOKIE_JAR")
  report $([[ "$code" == "200" ]] && echo 1 || echo 0) "POST /api/auth/login" "$code"

  code=$(request GET "$BASE_URL/api/auth/me" "" "$COOKIE_JAR")
  report $([[ "$code" == "200" ]] && echo 1 || echo 0) "GET /api/auth/me (auth)" "$code"

  code=$(request GET "$BASE_URL/api/leads" "" "$COOKIE_JAR")
  report $([[ "$code" == "200" ]] && echo 1 || echo 0) "GET /api/leads (auth)" "$code"
else
  echo "ℹ️  Skipping auth checks. Set MV_EMAIL and MV_PASSWORD to test login."
fi

echo
echo "Summary: $pass passed, $fail failed"
echo

if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
