#!/usr/bin/env bash
# Standard UI regression: login + main tabs + drill-ins (Playwright).
#
# Prerequisites:
#   npm install && npm run test:e2e:install
#   DATABASE_URL set; prisma migrate + seed (onboarded user `lin` / Password123)
#   Next dev server on PLAYWRIGHT_BASE_URL (default http://127.0.0.1:3000)
#
# Usage:
#   Terminal A: npm run dev
#   Terminal B: ./scripts/run-user-flow-e2e.sh
#
# Optional env:
#   E2E_USER E2E_PASSWORD  — login (default lin / Password123)
#   E2E_COURSE_ID         — course chat deep link (run: npm run e2e:course-id)
#   E2E_SIGNUP=1          — also run optional signup → /onboarding test
#   PLAYWRIGHT_BASE_URL   — app origin

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:3000}"
if ! curl -sf "$BASE/login" >/dev/null; then
  echo "Cannot reach $BASE/login — start the app first (e.g. npm run dev)." >&2
  exit 1
fi

export PLAYWRIGHT_SKIP_WEBSERVER=1
export PLAYWRIGHT_BASE_URL="$BASE"

exec npx playwright test "$@"
