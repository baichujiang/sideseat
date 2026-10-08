# One-page intention editor — 2026-09-24

## Resulting interaction

Creating and editing an intention now use one scrollable form. Activity details, study preferences, optional course, timing and note are available without Next/Back navigation. The existing save/publish action stays pinned above the keyboard.

Removed the step indicator and repeated activity-summary card. Submission checks activity, time and note together; over-limit text remains available for correction. When the note has focus, its length guidance takes priority over another field's length error. Saving dismisses the keyboard.

The form and action dock are separate children of the vertical layout, keeping the input viewport above the dock. Choosing an activity, study mode or timing preference ends text input and dismisses the keyboard. Notes align to the top of the input viewport when focused and use one to two visible lines at accessibility text sizes, keeping both short and 160-character notes above the save action.

## Validation

- Development simulator build passed with Xcode 26.6, iOS 26.5, iPhone 17 Pro (`SideSeat UX QA`, `AEBD816E-53A7-4012-B76A-FEF82CF02A6B`).
- The study save/refresh/edit/two-intention regression passed in `/tmp/sideseat-one-page-intention-20260924-smoke3.xcresult`. It explicitly checks that Next/Back are absent and that filling the goal enables the direct save action. That fixture test uses ephemeral credentials and a loopback URL with no server.
- Final unit/large-text verification: 379 tests passed, 0 failed, 0 skipped (378 unit tests and `testActivityPickerAtLargestDynamicType`) in `/tmp/sideseat-one-page-intention-20260924-verified.xcresult`. The UI journey verifies short and 160-character notes above the save button, returning to the activity without losing text, and saving successfully at the largest German text size in dark appearance.
- `testIntentionExplainsTextLimitsAndPreservesInputWhileScrolling` passed with the final note layout in `/tmp/sideseat-one-page-intention-20260924-keyboard-confirm.xcresult`. That bundle also contains the subsequently corrected large-text test gesture failure; it is not an all-pass bundle.
- `testFlexibleTimingChoicesAcrossLanguages` (Chinese light and English dark), the study save/refresh/edit/two-intention journey, and normal text limits all passed in `/tmp/sideseat-one-page-intention-20260924-final.xcresult`. Its only failure was the large-text note overlap subsequently corrected and verified above.
- The intermediate broader run completed all 378 unit tests and the largest-German timing journey. It also exposed a large-text note overlapping the save area and a normal-text timing selection obscured by the keyboard. The run was interrupted while those issues were corrected; its bundle did not finalize, so it is not a complete passing run. Individual runner logs remain under `/tmp/sideseat-one-page-intention-20260924-regression.xcresult/Staging/1_Test/Diagnostics/`.

## Test navigation correction

The old test helper treated a Form's full UIKit frame as its visible area. In the one-page form this included the keyboard and action dock, so automated swipes could land on the keyboard. The helper now gestures in the exposed form area and accepts an explicit upward search when returning to a field that SwiftUI has removed from the offscreen accessibility tree. It adjusts the drag distance and holds before release to avoid repeatedly overshooting small fields. It preserves the text, length and keyboard-visibility assertions.

The first two smoke runs failed on that test navigation; the third passed the study journey and exposed the need for the upward-search direction in the long-input journey. These are recorded as intermediate failures, not passing verification.

## Scope

This change is the intention form interaction and its UI test navigation. The live-login smoke helper was adapted to direct saving, but no live-account journey or TestFlight upload was run. Earlier uncommitted fixture-storage and calendar-localization-test fixes remain in the same working branch.

The updated app was installed and launched on the same simulator in Chinese, normal text and light appearance, with local intention fixtures, flexible timing, automatic matching, ephemeral credentials and the loopback API override. The Mac was locked when the final manual UI check was attempted, so the editor was not manually opened for handoff. Automated simulator evidence above was collected before that lock.

## Subsequent all-activity regression

`2026-09-24-all-activity-intentions.md` records the later complete six-category regression and the final verification results. That follow-up aligns text limits with the API's UTF-16 counting rule, preserves course metadata in local study fixtures, and dismisses the keyboard when form scrolling starts. Tests use normal swipes while the keyboard is visible and the existing precise positioning after it closes. All 379 unit tests and 11 selected UI journeys ultimately passed on the final app code.
