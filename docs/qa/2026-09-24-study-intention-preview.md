# Study intention local-preview fix — 2026-09-24

## Reproduction and cause

The simulator handed over after the September 23 run was launched with `--ui-testing-weekly-intent`, without `--ui-testing-intent-card-states`. Creating a Study intention named `Study save QA` dismissed the editor but left My intentions empty. This was reproduced through the simulator UI.

`WeeklyIntentStore.load` reset the weekly-intention preview to an empty array on every refresh. Only the separate card-state fixture mode handled writes locally, so this preview mixed fixture reads with the real API write path. The former handoff also lacked ephemeral credentials. A dismissed editor therefore does not establish whether a previous write reached an account; no backend records have been inspected or removed as part of this fix.

## Change

- Both intention fixture modes initialize their seed once and handle create, edit, pause/resume and end locally.
- Refresh preserves the current preview intentions.
- New intentions receive distinct IDs, so adding a second one preserves the first.
- Fixture saves retain the entered study goal, note, activity details and timing. Pausing/resuming retains those fields too.
- All store changes are behind `#if DEBUG`; the normal API path is unchanged.

The new UI regression uses the actual handoff feature flags plus ephemeral credentials and a loopback API URL with no server (`http://127.0.0.1:9`). It creates two Study intentions, refreshes each, opens each for editing, verifies the goals and notes, and saves again. Successful saves in that test cannot depend on a live backend or stored login.

## Verification

- Development simulator build: passed, Xcode 26.6 (`17F113`), iOS 26.5, iPhone 17 Pro (`AEBD816E-53A7-4012-B76A-FEF82CF02A6B`).
- Regression results: 381 tests passed, 0 failed, 0 skipped (378 unit tests and 3 UI journeys). Result bundle: `/tmp/sideseat-study-save-20260924-after.xcresult`.
- UI journeys: `testStudyIntentionInLocalPreviewSurvivesRefreshAndSecondCreation`, `testIntentionsSaveOnceWithoutSeparateFindingConfirmation`, and `testTogetherCreateReturnsToIntentionsWithoutPublishingExplore` in `VisualQAScreenshotUITests`.
- Manual handoff check: relaunched the updated app in Chinese, normal text and light appearance, with ephemeral credentials and the same loopback API override. Created `Review algorithms - local test` through the Study form and confirmed it appeared in My intentions after Save. The simulator is left on that card.
- The initial automated attempt (`/tmp/sideseat-study-save-20260924-before.xcresult`) stopped at a test snapshot race before Save. The test now waits for the timing form before locating its fields. The pre-fix behavioral evidence is the manual reproduction above.

## Scope

This is local preview behavior. Fixture data remains in memory and resets when the app is relaunched. It does not verify production account persistence or deploy to TestFlight. The September 23 unit-test-only localization correction and QA record remain separate, pre-existing local changes.
