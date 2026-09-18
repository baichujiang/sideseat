# Together decision slider — Preview 49

Date: 2026-09-12. The owner accepted the warm cream/Rose direction and requested
a more refined interaction for the recommendation slider.

## Design

- Separate left/right labels remain visible above a 64pt warm inset rail.
- A 52pt ivory handle uses a directional grip, a restrained shadow and a small
  pickup lift. Minus/heart endpoints communicate both choices.
- Actual drag distance extends a quiet directional wash. “Keep sliding” changes
  to “Release to confirm” at the existing 68% threshold, with a haptic and
  heart/minus state. Short/cancelled drags return to the center.
- Submission shows progress and locks the control; a retained card returns to
  idle after the async result. Vertical scrolling and task paging exclusion are
  retained. Reduce Motion removes lift and spring animation.
- Chinese, English and German feedback, wrapping large-text labels, and
  VoiceOver adjustable/named actions are included. Feedback text on every rail
  state has at least 9.46:1 calculated contrast; the dark handle icon is 3.60:1.

## Isolated delivery

The first workspace build, Preview 48, was briefly installed before the final
audit identified concurrent persistent-intention changes awaiting a backend
release. Preview 49 supersedes that package. The persistent-intention source
changes remain in the shared workspace and are not reverted by this UI task.

Preview 49 is built from `891b627` plus the Together UI overlay in
`/tmp/sideseat-together-ui-preview49-source/ios-native`. The API client, generated
API, intention models/stores and editor lifecycle use the baseline contracts.
Existing expiry/extension behavior and wording are retained for the current
API at `https://api.sideseat.de`. The overlay includes the theme, shared card and
slider, Together navigation/cards, Explore card styling, and two feedback strings.
The owner's Info.plist change is preserved. Signing comes from the existing
local configuration; Preview identity uses build-time overrides.

## Verification

- Two gesture unit tests and four UI methods passed in
  `/tmp/sideseat-slider-refined-r1.xcresult` and
  `/tmp/sideseat-slider-refined-r2.xcresult`.
- Coverage: both directions, short/cancelled drags, vertical scrolling from the
  handle, whole-control page exclusion, failed-save retry, Chinese Light,
  German Dark/maximum text size and English Reduce Motion.
- Chinese Light/German Dark screenshots and a held-threshold recording frame
  were visually inspected. Physical haptic feel is left for the owner to assess.
- Localization plist syntax and `git diff --check` passed.

- The isolated Preview 49 source also passed the three-language actual-drag,
  short-drag cancellation, vertical-scroll and Reduce Motion method (58.018s)
  in `/tmp/sideseat-slider-preview49-ui.xcresult`.
- The supplemental tab/card-actions method was interrupted by a test-runner
  SIGKILL on both the initial run and one bounded rerun. The initial pass through
  the three tabs and Explore draft/cancel actions produced screenshots, but this
  full supplemental method is incomplete, not reported as passing. Result:
  `/tmp/sideseat-slider-preview49-tabs-rerun.xcresult`. Neither run reported a UI
  assertion failure before the runner exited; the reason for SIGKILL is not
  established. The primary slider checks above remain passing.

## Device receipt

- Signed Development build and `codesign --verify --deep --strict` passed.
- Verified built identity: `SideSeat Preview` / `app.sideseat.mobile.preview` /
  1.0.0 (49), API `https://api.sideseat.de`.
- Installed and launched on the paired iPhone 16 Pro Max. Device inventory
  confirms Preview 49; ordinary SideSeat remains 41.
- Artifact: `/tmp/SideSeatTogetherUIPreview49/Build/Products/Development-iphoneos/SideSeat.app`.
- Evidence: `/tmp/sideseat-slider-preview49-build.log`,
  `/tmp/sideseat-slider-preview49-install.json`,
  `/tmp/sideseat-slider-preview49-launch.json`,
  `/tmp/sideseat-slider-preview49-apps.json`.
- Final screenshots: `docs/visual-qa/together-preview49-recommendations-zh.png`,
  `together-preview49-intentions-zh.png`, `together-preview49-explore-zh.png`.
- No backend deployment, migration or TestFlight upload was performed.
