#!/bin/sh

set -eu

if [ "${CONFIGURATION:-}" != "Production" ]; then
  exit 0
fi

fail() {
  echo "error: SideSeat production configuration: $1" >&2
  exit 1
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

echo "SideSeat production iOS configuration passed."
