# Simple intention cards — 2026-09-25

My intentions cards now open the existing editor when tapped. A separate 44-point
× button at the top right opens the existing destructive confirmation, relabeled
Delete. Confirming uses the existing authenticated DELETE operation and refreshes
opportunities; cancelling leaves the card untouched. Removed the footer's
pause/resume and Edit buttons, its divider, and the overflow menu. The finding
status explanation no longer advertises pausing. Chinese, English and German
include the new deletion labels.

The delete button is a sibling above the card's edit button, so it does not nest
inside the edit action. Existing paused records retain their saved state. The
backend lifecycle, expiry and conversation/Plan preservation are unchanged.

## Verification

Localization plist syntax and local links in USER_FLOW.md passed.
Existing UI journeys were updated to exercise card editing, deletion cancellation,
deletion without opening the editor, and removal from the list.

The normal Xcode build stalled in the initial clang macro probe (before app
compilation). Sampling showed clang blocked writing the verbose cc1 command to
its pipe. A temporary /tmp/sideseat-clang-probe.py wrapper removes only that
verbose command line from the probe output, preserving real macros, version,
diagnostics and exit status. All other invocations execute the original Xcode
compiler unchanged. This local workaround is passed as CC for verification;
it is not a project setting or committed file.

Development build-for-testing passed with the probe workaround. The first UI run
(`/tmp/sideseat-card-simplification-ui.xcresult`) passed the complete Coffee
create/edit/save/delete journey and category-header layout checks in light/dark.
The tabs journey exposed a test assumption: iOS 26 presents the confirmation as a
popover without a Cancel button. Updated the cancellation gesture to tap outside
and verify the confirmation disappears while the card remains. The focused rerun
(`/tmp/sideseat-card-simplification-ui-final.xcresult`) passed: 1 test, 0 failures.
All three selected journeys have now passed. The tabs journey confirms × never
opens the editor, cancellation preserves the intention, and confirmation removes
it without consuming another recommendation.

Visually inspected category-header-intentions-light.png and
category-header-intentions-dark.png in docs/visual-qa: footer removed, × aligned
to the header, and card content remains readable. Final git diff --check passed.
Tests used SideSeat UX QA (iOS 26.5), local fixtures, ephemeral credentials and
loopback-only API override. No backend deployment or live data mutation.
