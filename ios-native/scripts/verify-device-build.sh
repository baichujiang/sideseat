#!/bin/sh

set -eu

root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
ios_dir="$root_dir/ios-native"
device_udid="${DEVICE_UDID:-$($ios_dir/scripts/resolve-physical-iphone-udid.sh)}"
derived_data="${DERIVED_DATA_PATH:-/tmp/SideseatDeviceBuild}"
app_path="$derived_data/Build/Products/Development-iphoneos/SideSeat.app"

fail() {
  echo "error: SideSeat device preflight: $1" >&2
  exit 1
}

expect_equal() {
  label="$1"
  actual="$2"
  expected="$3"
  [ "$actual" = "$expected" ] || fail "$label expected '$expected' but found '$actual'."
  printf 'passed: %s = %s\n' "$label" "$actual"
}

echo "Building SideSeat-Development for physical iPhone $device_udid"
build_log="$(mktemp -t sideseat-device-build.XXXXXX)"
trap 'rm -f "$build_log"' EXIT
if ! xcodebuild build \
  -project "$ios_dir/SideSeat.xcodeproj" \
  -scheme SideSeat-Development \
  -destination "id=$device_udid" \
  -derivedDataPath "$derived_data" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic >"$build_log" 2>&1; then
  tail -200 "$build_log" >&2
  fail "signed device build failed."
fi
echo "passed: signed physical-device build"

[ -d "$app_path" ] || fail "signed app was not produced at $app_path."
info_plist="$app_path/Info.plist"
[ -f "$info_plist" ] || fail "built Info.plist is missing."

bundle_id="$(plutil -extract CFBundleIdentifier raw "$info_plist")"
api_url="$(plutil -extract SideSeatAPIBaseURL raw "$info_plist")"
device_family="$(plutil -extract UIDeviceFamily.0 raw "$info_plist")"
executable="$(plutil -extract CFBundleExecutable raw "$info_plist")"

expect_equal "bundle identifier" "$bundle_id" "app.sideseat.mobile"
expect_equal "API URL" "$api_url" "https://api.sideseat.de"
expect_equal "device family" "$device_family" "1"
file "$app_path/$executable" | grep -q 'arm64' || fail "app executable is not arm64."
echo "passed: executable architecture includes arm64"

entitlements="$(mktemp -t sideseat-entitlements.XXXXXX)"
trap 'rm -f "$build_log" "$entitlements"' EXIT
codesign --display --entitlements :- "$app_path" 2>/dev/null \
  | plutil -convert xml1 -o "$entitlements" -

application_id="$(plutil -extract application-identifier raw "$entitlements")"
aps_environment="$(plutil -extract aps-environment raw "$entitlements")"
associated_domain="$(
  /usr/libexec/PlistBuddy \
    -c 'Print :com.apple.developer.associated-domains:0' \
    "$entitlements"
)"

case "$application_id" in
  *.app.sideseat.mobile) printf 'passed: application identifier = %s\n' "$application_id" ;;
  *) fail "application identifier '$application_id' does not match app.sideseat.mobile." ;;
esac
expect_equal "APNs environment" "$aps_environment" "development"
expect_equal "Associated Domain" "$associated_domain" "applinks:www.sideseat.de"

echo "SideSeat physical-device build preflight passed. No app was installed."
