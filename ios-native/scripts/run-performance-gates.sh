#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT="$ROOT/ios-native/SideSeat.xcodeproj"
SCHEME="SideSeat-Development"
SIM_DEVICE_ID="${SIM_DEVICE_ID:-386193D3-AB27-41F4-8B13-4DB3ACEE3907}"
RESULT_ROOT="${RESULT_ROOT:-$(mktemp -d "${TMPDIR:-/tmp}/SideSeatPerformance.XXXXXX")}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-${TMPDIR:-/tmp}/SideSeatPerformanceBuild}"
DESTINATION="platform=iOS Simulator,id=$SIM_DEVICE_ID"
TOTAL_PASSED=0

run_group() {
  local name="$1"
  local expected="$2"
  shift 2

  local result_bundle="$RESULT_ROOT/$name.xcresult"
  local summary="$RESULT_ROOT/$name-summary.json"
  local selectors=()
  local test_name
  for test_name in "$@"; do
    selectors+=("-only-testing:SideSeatUITests/AuthenticationUITests/$test_name")
  done

  echo "==> Running $name performance gates ($expected tests)"
  xcodebuild test \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -destination "$DESTINATION" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    -resultBundlePath "$result_bundle" \
    -parallel-testing-enabled NO \
    "${selectors[@]}" \
    CODE_SIGNING_ALLOWED=NO

  xcrun xcresulttool get test-results summary \
    --path "$result_bundle" > "$summary"

  local passed
  local failed
  local skipped
  passed="$(plutil -extract passedTests raw -o - "$summary")"
  failed="$(plutil -extract failedTests raw -o - "$summary")"
  skipped="$(plutil -extract skippedTests raw -o - "$summary")"

  if [[ "$passed" != "$expected" || "$failed" != "0" || "$skipped" != "0" ]]; then
    echo "error: $name expected $expected passes, got passed=$passed failed=$failed skipped=$skipped" >&2
    exit 1
  fi

  TOTAL_PASSED=$((TOTAL_PASSED + passed))
  echo "==> $name passed: $passed/$expected"
}

xcrun simctl bootstatus "$SIM_DEVICE_ID" -b >/dev/null
mkdir -p "$RESULT_ROOT"

# Keep launch lifecycle checks separate from XCTMetric interaction loops.
run_group launch 2 \
  testAuthenticatedProcessColdLaunchReachesFirstFrameWithinBudget \
  testAuthenticatedWarmResumePerformance

# This uses an app-side main-loop diagnostic and must not inherit XCTMetric quiescence state.
run_group chat-input 1 \
  testDenseDirectChatFirstCharacterLatency

run_group interaction-stress 8 \
  testDenseCalendarHorizontalPagingPerformance \
  testDenseDirectChatComposerPerformance \
  testDenseDirectChatEnterExitPerformance \
  testDenseDirectChatScrollingPerformance \
  testDenseDiscoverBrowseInteractionStress \
  testDenseDiscoverFeedScrollPerformance \
  testDenseDiscoverSearchRemainsResponsive \
  testDenseScheduleImageGenerationRemainsCancelable

if [[ "$TOTAL_PASSED" != "11" ]]; then
  echo "error: expected 11 total performance gates, got $TOTAL_PASSED" >&2
  exit 1
fi

echo "==> SideSeat performance gates passed: $TOTAL_PASSED/11"
echo "==> Result bundles: $RESULT_ROOT"
