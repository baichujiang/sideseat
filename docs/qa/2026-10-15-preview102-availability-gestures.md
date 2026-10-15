# Availability scrolling and deliberate selection

Dated evidence: 2026-10-15, Europe/Berlin. The owner reported difficult vertical
scrolling and overly sensitive selection in the shared availability grid.

## Implementation

Ordinary swipes scroll. A tap toggles one cell; a 0.4-second hold followed by a
drag previews a rectangular selection/erasure, applied once on release. Native
UIKit recognizers cooperate with the surrounding scroll views. The zero-distance
SwiftUI drag overlay is removed. Cells grow from 36 to 44 points with visible
adaptive borders. Undo restores the previous selection and uses normal autosave.

This retains the same slot IDs, rectangular selection calculation, authenticated
response ownership and autosave queue. Availability remains separate from
participation confirmation and Calendar projection.

## Verified results

| Target and case | Result |
| --- | --- |
| iPhone 14 Plus / iOS 26.6.1 / Preview 101, normal vertical swipe over cells | Reproduced: scrolling failed and slots 2–12 were unintentionally saved |
| iPhone 17 Pro Simulator / iOS 26.5, final native source, ordinary vertical and horizontal swipes | Passed, 34.097 s; server selection remained empty |
| Same Simulator, long-press selection, single-cell tap, undo, erasure, undo, terminate/reopen | Passed, 93.874 s; exactly slots 0–3 restored on reopening |
| Same Simulator, existing `TimePollTests` | 4 passed: rectangular paint/erase, links, ordered autosave and account-scoped pending writes |
| Default iPhone 14 Plus, final signed Preview 102 | Signature/profile, installation and app inventory verified; final gesture execution and normal launch remain pending unlock |

Independent authenticated API reads from the Mac verified `[0,1,2,3]` for the
selection fixture and `[]` for the scrolling fixture. The two UI cases use separate
fresh six-day, 08:00–22:00 polls belonging to one disposable account. The app uses
ephemeral credentials and a real token for that account; owner Keychain data is
not used. Simulator checks exercised the final implementation, not a screenshot
or a mocked save result. Earlier SwiftUI-only candidates avoided accidental
writes but still blocked scrolling; they are not the final accepted Simulator
result.

The final physical runner could not start because Xcode reported that iPhone (4)
needed unlocking to recover preparation. CoreDevice confirmed
`passcodeRequired: true`, `unlockedSinceBoot: true`. Developer Mode remains on.
The owner was asked to unlock the default phone and keep it connected. This is
not a new developer-authentication requirement. Final haptic feel, phone gestures
and empty-argument launch are **not yet verified** for Preview 102.

## Evidence and scope

- [Results](./evidence/2026-10-15-preview102-availability-gestures/results.json).
- [Simulator selection](./evidence/2026-10-15-preview102-availability-gestures/simulator-selection.png).
- [Simulator scrolling](./evidence/2026-10-15-preview102-availability-gestures/simulator-scroll.png).
- Permanent UI cases: `ios-native/SideSeatUITests/AvailabilityGestureUITests.swift`.
  They require `SIDESEAT_AVAILABILITY_GESTURE_QA=1`, a disposable account token,
  separate empty `..._POLL` / `..._SCROLL_POLL` fixtures titled
  `QA102 Gesture regression`, and optionally `..._BUNDLE`. The runner independently
  checks persisted selections through the API. Never supply an owner poll/token.
- Existing live collection tests now hold for 0.6 seconds when painting. Their
  full five-person flows were not rerun in this UI-only stage.
- English Simulator screenshots were visually checked; English, Chinese and
  German string files passed `plutil`. VoiceOver speech and a full app regression
  were not performed.

The disposable account/polls were removed after the recorded checks; the final
list was empty and its deleted token returned 401. Temporary runner and private
credential-bearing test configuration were removed. Safe local receipts remain
under `/tmp/sideseat-availability102-20261015/`.
