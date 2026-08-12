#!/bin/sh

set -eu

if [ "${CONFIGURATION:-}" != "Production" ]; then
  exit 0
fi

fail() {
  echo "error: SideSeat production configuration: $1" >&2
  exit 1
}

has_sentry_auth_token() {
  if [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then
    return 0
  fi

  command -v security >/dev/null 2>&1 || return 1
  keychain_account="${SENTRY_KEYCHAIN_ACCOUNT:-${USER:-$(id -un)}}"
  keychain_service="${SENTRY_KEYCHAIN_SERVICE:-app.sideseat.mobile.sentry-dsym}"
  security find-generic-password \
    -a "$keychain_account" \
    -s "$keychain_service" \
    -w >/dev/null 2>&1
}

case "${SIDESEAT_API_BASE_URL:-}" in
  https://*) ;;
  *) fail "SIDESEAT_API_BASE_URL must be a public HTTPS URL." ;;
esac

case "${SIDESEAT_API_BASE_URL}" in
  *localhost*|*127.0.0.1*|*.invalid*) fail "SIDESEAT_API_BASE_URL still points to a development or placeholder host." ;;
esac

case "${SIDESEAT_ASSOCIATED_DOMAIN:-}" in
  ""|*://*|*/*|*localhost*|*127.0.0.1*|*.invalid*)
    fail "SIDESEAT_ASSOCIATED_DOMAIN must be a public host without scheme or path."
    ;;
esac

case "${SIDESEAT_CRASH_DSN:-}" in
  https://*) ;;
  *) fail "SIDESEAT_CRASH_DSN must be a public HTTPS Sentry DSN." ;;
esac

case "${SIDESEAT_CRASH_DSN}" in
  *localhost*|*127.0.0.1*|*.invalid*) fail "SIDESEAT_CRASH_DSN still uses a development or placeholder host." ;;
esac

[ "${APS_ENVIRONMENT:-}" = "production" ] || fail "APS_ENVIRONMENT must be production."
[ "${PRODUCT_BUNDLE_IDENTIFIER:-}" = "app.sideseat.mobile" ] || fail "PRODUCT_BUNDLE_IDENTIFIER must be app.sideseat.mobile."
[ -n "${DEVELOPMENT_TEAM:-}" ] || fail "DEVELOPMENT_TEAM is required for signing and universal links."

if [ "${ACTION:-}" = "install" ]; then
  has_sentry_auth_token || fail "Sentry auth is required for a Production archive; set SENTRY_AUTH_TOKEN or store it in the macOS Keychain service app.sideseat.mobile.sentry-dsym."
  [ -n "${SENTRY_ORG:-}" ] || fail "SENTRY_ORG is required for a Production archive."
  [ -n "${SENTRY_PROJECT:-}" ] || fail "SENTRY_PROJECT is required for a Production archive."
fi

echo "SideSeat production iOS configuration passed."
