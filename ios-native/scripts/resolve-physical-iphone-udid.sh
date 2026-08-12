#!/bin/sh

set -eu

if [ -n "${DEVICE_UDID:-}" ]; then
  printf '%s\n' "$DEVICE_UDID"
  exit 0
fi

if [ -n "${XCTRACE_DEVICES_OUTPUT:-}" ]; then
  devices="$XCTRACE_DEVICES_OUTPUT"
else
  devices="$(xcrun xctrace list devices 2>/dev/null)"
fi

udid="$(
  printf '%s\n' "$devices" \
    | sed -n '1,/^== Simulators ==$/p' \
    | sed -n '/iPhone/ { s/.*(\([0-9A-Fa-f][0-9A-Fa-f-]\{24,\}\))$/\1/p; }' \
    | head -1
)"

if [ -z "$udid" ]; then
  echo "error: no paired physical iPhone is available to Xcode." >&2
  exit 1
fi

printf '%s\n' "$udid"
