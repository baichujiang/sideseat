#!/usr/bin/env bash
# Capture the full launch, tab, sharing, and courses screenshot matrix in light and dark.
# Simulator (default): uses simctl appearance + --ui-testing-appearance=.
# Physical device: set DEVICE_UDID=<udid> (or pass --device). Appearance forced via launch arg only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IOS="$ROOT/ios-native"
OUT="$ROOT/docs/visual-qa"
SIM_DEVICE_ID="${SIM_DEVICE_ID:-386193D3-AB27-41F4-8B13-4DB3ACEE3907}"
DEVICE_UDID="${DEVICE_UDID:-}"
MODE="simulator"

usage() {
  cat <<'EOF'
Usage: capture-visual-qa.sh [--device [UDID]] [--simulator [UDID]]

  --device [UDID]      Run on a paired physical iPhone (required for 真机 §8).
                       If UDID omitted, picks the first available iPhone from
                       `xcrun xctrace list devices`.
  --simulator [UDID]   Run on Simulator (default iPhone 17 Pro).
  DEVICE_UDID=...      Same as --device (env).
  SIM_DEVICE_ID=...    Same as --simulator (env).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --device)
      MODE="device"
      if [[ "${2:-}" != "" && "${2:-}" != --* ]]; then DEVICE_UDID="$2"; shift; fi
      shift
      ;;
    --simulator)
      MODE="simulator"
      if [[ "${2:-}" != "" && "${2:-}" != --* ]]; then SIM_DEVICE_ID="$2"; shift; fi
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "$DEVICE_UDID" ]]; then
  MODE="device"
fi

resolve_physical_udid() {
  DEVICE_UDID="$DEVICE_UDID" "$IOS/scripts/resolve-physical-iphone-udid.sh"
}

mkdir -p "$OUT"
cd "$IOS"

run_appearance() {
  local appearance="$1"
  local destination="$2"
  echo "==> Appearance: $appearance  destination: $destination"
  printf '%s\n' "$appearance" > "$OUT/.appearance"
  # Give SpringBoard / trait collection a beat (simulator simctl already applied).
  sleep 1
  xcodebuild \
    -scheme SideSeat-Development \
    -destination "$destination" \
    -only-testing:SideSeatUITests/VisualQAScreenshotUITests \
    test
}

if [[ "$MODE" == "device" ]]; then
  UDID="$(resolve_physical_udid)" || {
    echo "error: no physical iPhone found. Plug in an iPhone, Trust this computer, enable Developer Mode, then re-run:" >&2
    echo "  ios-native/scripts/capture-visual-qa.sh --device" >&2
    exit 1
  }
  echo "==> Physical device UDID: $UDID"
  DEST="platform=iOS,id=$UDID"
  # No simctl on hardware — app forces scheme via --ui-testing-appearance=.
  run_appearance light "$DEST"
  run_appearance dark "$DEST"
else
  echo "==> Simulator: $SIM_DEVICE_ID"
  DEST="platform=iOS Simulator,id=$SIM_DEVICE_ID"
  xcrun simctl bootstatus "$SIM_DEVICE_ID" -b >/dev/null
  for appearance in light dark; do
    xcrun simctl ui "$SIM_DEVICE_ID" appearance "$appearance"
    run_appearance "$appearance" "$DEST"
  done
fi

echo "==> Wrote screenshots to $OUT"
ls -la "$OUT"
