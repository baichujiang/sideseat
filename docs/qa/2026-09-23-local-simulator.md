# Local simulator verification — 2026-09-23

- Branch: `codex/ios-uxui-20260922`.
- Source: `c2bc8a3`, followed by the test-only correction described below. App source is unchanged.
- Toolchain: Xcode 26.6 (`17F113`), iOS 26.5 simulator.
- Device: `SideSeat UX QA`, iPhone 17 Pro, `AEBD816E-53A7-4012-B76A-FEF82CF02A6B`.
- Scope: local build, complete unit-test target, selected UX regression journeys, normal light/dark main-page screenshots. UI journeys use local fixtures; this is not live-backend or physical-device acceptance.

## Results

| Run | Result | Evidence |
| --- | --- | --- |
| Build for testing | Passed, unsigned simulator Development build | `/tmp/sideseat-local-simulator-20260923-build.log` |
| Initial regression | 384 passed, 1 failed, 0 skipped; all 7 selected UI journeys passed | `/tmp/sideseat-local-simulator-20260923-smoke.xcresult` |
| Rebuild after test correction | Passed | `/tmp/sideseat-local-simulator-20260923-rebuild.log` |
| Complete unit target + dark main-page matrix | 379 passed, 0 failed, 0 skipped: 378 unit cases and 1 UI journey | `/tmp/sideseat-local-simulator-20260923-confirm.xcresult` |

The seven initial UI journeys cover:

- blocked-user load failure, retry and cancellation without removing the block;
- missing event title, visible guidance and correction in English and largest German text;
- profile input limits, draft correction, keyboard visibility and fixture persistence;
- activity selection and keyboard input at largest German text;
- signed-out screen and five authenticated tabs in normal light appearance;
- intention text limits and draft preservation through Back/Next;
- inbox/direct-chat dates in English, German and Chinese.

The second run repeats the main-page matrix in dark appearance. Screenshots and test attachments are included in the result bundles; generated screenshots also live in the ignored `docs/visual-qa/` directory.

## Test correction

`CalendarCategoryModelsTests.presetIdentity()` compared an app-localized name with `String(localized:)`, which uses the system language. The simulator had Chinese as its system language and English as the app preference, so the test expected `个人日程` while the app correctly returned `Personal`.

The test now explicitly selects English, German and Chinese, verifies their expected preset names, and verifies that the custom name `Project` remains unchanged. It restores the original language preference afterward. The test runs synchronously on the main actor, matching other tests that change the app language. No production localization behavior was changed.

## Generation finding

Running the pinned OpenAPI generator produced ordering-only differences in `Client.swift` and `Types.swift`; their nonblank-line multisets were identical to HEAD. The deterministic-generation check therefore failed before compilation. The Xcode project itself had no drift.

Saved the diff to `/tmp/sideseat-local-simulator-20260923-generation.diff`, then restored only those generated changes so the app under test exactly matches the pushed source. Deterministic OpenAPI ordering remains a separate CI issue; this simulator pass does not certify that generation gate.

## Limits and handoff

- The previously logged largest-German report caret, compact calendar picker clipping, Calendar scroll-dismiss and semester contract issues remain open. This run does not claim those were fixed.
- No TestFlight upload or backend deployment was performed. No valid calendar event was submitted by the event-validation journey.
- Simulator left open in Chinese, normal text, light appearance with local Together fixtures for manual exploration.
- Retained local changes: this record and the calendar localization test correction. They have not been committed or pushed by this test run.

## Reproduction

Build with `xcodebuild build-for-testing -quiet`, project `ios-native/SideSeat.xcodeproj`, scheme `SideSeat-Development`, configuration `Development`, the device above, derived data `/tmp/sideseat-ios-uxui-derived`, and `CODE_SIGNING_ALLOWED=NO`.

Run `xcodebuild test-without-building` with the generated `SideSeat-Development_iphonesimulator26.5-arm64.xctestrun`, `-parallel-testing-enabled NO` and `-collect-test-diagnostics never`. Select `SideSeatTests` plus these UI tests:

```text
AuthenticationUITests/testBlockedUsersLoadFailureOffersRetryAndKeepsBlocksIntact
AuthenticationUITests/testNewEventExplainsMissingTitleAndKeepsCorrectionVisible
AuthenticationUITests/testProfileInputExplainsLimitsAndPreservesDraftWhileCorrecting
VisualQAScreenshotUITests/testActivityPickerAtLargestDynamicType
VisualQAScreenshotUITests/testCaptureCurrentAppearanceMatrix
VisualQAScreenshotUITests/testIntentionExplainsTextLimitsAndPreservesInputWhileGoingBack
VisualQAScreenshotUITests/testMessageDatesFollowSelectedAppLanguage
```

Set `docs/visual-qa/.appearance` to `light` or `dark` before running the corresponding matrix. The explicit app launch arguments in each journey determine its language and Dynamic Type size.
