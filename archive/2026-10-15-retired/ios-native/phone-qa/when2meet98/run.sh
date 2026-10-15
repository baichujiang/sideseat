#!/bin/sh
set -eu

# This project builds a UI runner only. Preview 98 must already be installed.
[ "${SIDESEAT_WHEN2MEET_PHONE_QA:-}" = "1" ] || {
  echo 'Set SIDESEAT_WHEN2MEET_PHONE_QA=1 to create an anonymous live When2meet QA poll.' >&2
  exit 2
}
ss_phone_qa_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ss_ios_dir=$(CDPATH= cd -- "$ss_phone_qa_dir/../.." && pwd)
ss_device_udid=${DEVICE_UDID:-$("$ss_ios_dir/scripts/resolve-physical-iphone-udid.sh")}
ss_result_path=${RESULT_BUNDLE_PATH:-/tmp/sideseat-when2meet-phone98-$(date +%Y%m%d-%H%M%S).xcresult}
ss_project_dir="$ss_ios_dir/DerivedData-When2meet-Phone98Project"

"$ss_ios_dir/scripts/bootstrap-xcodegen.sh" >/dev/null
mkdir -p "$ss_project_dir"
"$ss_ios_dir/.build-tools/xcodegen/2.45.4/bin/xcodegen" generate \
  --spec "$ss_phone_qa_dir/project.yml" --project "$ss_project_dir"

# Return to the owner's ordinary session even if a UI assertion fails.
ss_restore_preview() {
  if ! xcrun devicectl device process launch --device "$ss_device_udid" --terminate-existing app.sideseat.mobile.preview >/dev/null; then
    echo 'Could not restore the ordinary Preview session; check the device launch error.' >&2
  fi
}
trap ss_restore_preview EXIT
xcodebuild test \
  -project "$ss_project_dir/When2meetPhone98.xcodeproj" \
  -scheme When2meetPhone98 \
  -destination "id=$ss_device_udid" \
  -derivedDataPath "$ss_ios_dir/DerivedData-When2meet-Phone98" \
  -resultBundlePath "$ss_result_path" \
  -allowProvisioningUpdates SIDESEAT_WHEN2MEET_PHONE_QA=1
