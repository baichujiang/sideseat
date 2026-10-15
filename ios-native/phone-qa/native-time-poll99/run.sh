#!/bin/sh
set -eu
[ "${SIDESEAT_TIME_POLL_QA:-}" = "1" ] || { echo 'Enable this isolated five-account time poll QA run explicitly.' >&2; exit 2; }
: "${SIDESEAT_TIME_POLL_QA_API:?Set the verified API URL}"
: "${SIDESEAT_TIME_POLL_QA_ACCOUNTS:?Set a private five-account JSON file}"
SIDESEAT_TIME_POLL_QA_ACCOUNTS_JSON=$(cat "$SIDESEAT_TIME_POLL_QA_ACCOUNTS")
export SIDESEAT_TIME_POLL_QA_ACCOUNTS_JSON
ss_qa_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ss_ios_dir=$(CDPATH= cd -- "$ss_qa_dir/../.." && pwd)
ss_project_dir="$ss_ios_dir/DerivedData-NativePoll-Phone99Project"
ss_device_udid=${DEVICE_UDID:-$("$ss_ios_dir/scripts/resolve-physical-iphone-udid.sh")}
ss_result=${RESULT_BUNDLE_PATH:-/tmp/sideseat-native-poll-phone99.xcresult}
"$ss_ios_dir/scripts/bootstrap-xcodegen.sh" >/dev/null
mkdir -p "$ss_project_dir"
"$ss_ios_dir/.build-tools/xcodegen/2.45.4/bin/xcodegen" generate --spec "$ss_qa_dir/project.yml" --project "$ss_project_dir"
# The installed app is retained. Ephemeral QA credentials never replace Keychain.
trap 'xcrun devicectl device process launch --device "$ss_device_udid" --terminate-existing app.sideseat.mobile.preview >/dev/null 2>&1 || true' EXIT
xcodebuild -project "$ss_project_dir/NativeTimePollPhone99.xcodeproj" -scheme NativeTimePollPhone99 \
  -destination "platform=iOS,id=$ss_device_udid" -derivedDataPath "$ss_ios_dir/DerivedData-NativePoll-Phone99" \
  -allowProvisioningUpdates -resultBundlePath "$ss_result" test "$@"
