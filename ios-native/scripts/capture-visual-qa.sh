#!/usr/bin/env bash
# Capture Auth + 5-tab screenshots in light and dark for design-freeze visual QA.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IOS="$ROOT/ios-native"
OUT="$ROOT/docs/ios-native/visual-qa"
DEVICE_ID="${SIM_DEVICE_ID:-386193D3-AB27-41F4-8B13-4DB3ACEE3907}"

mkdir -p "$OUT"
cd "$IOS"

run_appearance() {
  local appearance="$1"
  echo "==> Appearance: $appearance"
  xcrun simctl bootstatus "$DEVICE_ID" -b >/dev/null
  xcrun simctl ui "$DEVICE_ID" appearance "$appearance"
  printf '%s\n' "$appearance" > "$OUT/.appearance"
  # Give SpringBoard a beat to apply trait collection.
  sleep 1
  xcodebuild \
    -scheme SideSeat-Development \
    -destination "platform=iOS Simulator,id=$DEVICE_ID" \
    -only-testing:SideSeatUITests/VisualQAScreenshotUITests/testCaptureCurrentAppearanceMatrix \
    test
}

run_appearance light
run_appearance dark

echo "==> Wrote screenshots to $OUT"
ls -la "$OUT"
