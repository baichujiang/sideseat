#!/bin/sh

set -eu

if [ "${CONFIGURATION:-}" != "Production" ] || [ "${ACTION:-}" != "install" ]; then
  exit 0
fi

fail() {
  echo "error: SideSeat Sentry symbols: $1" >&2
  exit 1
}

sentry_auth_token="${SENTRY_AUTH_TOKEN:-}"
if [ -z "$sentry_auth_token" ] && command -v security >/dev/null 2>&1; then
  keychain_account="${SENTRY_KEYCHAIN_ACCOUNT:-${USER:-$(id -un)}}"
  keychain_service="${SENTRY_KEYCHAIN_SERVICE:-app.sideseat.mobile.sentry-dsym}"
  sentry_auth_token="$(security find-generic-password \
    -a "$keychain_account" \
    -s "$keychain_service" \
    -w 2>/dev/null || true)"
fi

[ -n "$sentry_auth_token" ] || fail "Sentry auth is required for a Production archive; set SENTRY_AUTH_TOKEN or store it in the macOS Keychain service app.sideseat.mobile.sentry-dsym."
[ -n "${SENTRY_ORG:-}" ] || fail "SENTRY_ORG is required for a Production archive."
[ -n "${SENTRY_PROJECT:-}" ] || fail "SENTRY_PROJECT is required for a Production archive."
[ "${DEBUG_INFORMATION_FORMAT:-}" = "dwarf-with-dsym" ] || fail "Production must generate a dSYM."
[ -n "${DWARF_DSYM_FOLDER_PATH:-}" ] || fail "DWARF_DSYM_FOLDER_PATH is unavailable."
[ -n "${DWARF_DSYM_FILE_NAME:-}" ] || fail "DWARF_DSYM_FILE_NAME is unavailable."

dsym_path="${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}"
[ -d "$dsym_path" ] || fail "Expected dSYM was not found at $dsym_path."

sentry_cli="${SENTRY_CLI_PATH:-}"
if [ -z "$sentry_cli" ]; then
  sentry_cli="$(command -v sentry-cli || true)"
fi
[ -n "$sentry_cli" ] && [ -x "$sentry_cli" ] || fail "sentry-cli is unavailable; run npm ci before archiving."

SENTRY_AUTH_TOKEN="$sentry_auth_token" "$sentry_cli" debug-files upload \
  --org "$SENTRY_ORG" \
  --project "$SENTRY_PROJECT" \
  "$dsym_path"

echo "SideSeat Sentry symbols uploaded: ${DWARF_DSYM_FILE_NAME}"
