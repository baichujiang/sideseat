# Peer intention recommendation cards — 2026-09-25

Recommendation cards show the peer's avatar, nickname, student verification,
activity and declared timing. Category artwork and color follow the peer's
activity, including cross-category discovery. Removed the viewer's activity,
comparison text, matching-color cues and contextual difference hints. The existing
interest/skip, withdrawal and mutual-chat behavior remains unchanged.

Added the optional peerIntention API projection and regenerated the native
OpenAPI client. The projection reads the other participant's current activity
fields and timing, without intention IDs, owner IDs, private notes or decisions.
Legacy null preferences retain exact-window semantics. Closed/unavailable
opportunities return null. Conversation/Plan snapshots are unchanged. Old API
responses can still supply the peer activity from matchFit; absent peer timing
shows time to discuss rather than mislabeling the shared overlap as peer timing.

## Verification

- Normal Development build-for-testing passed (no compiler workaround needed).
- TypeScript type check passed.
- 39 selected backend and OpenAPI contract tests passed. An existing source check
  still expected the old inline Withdraw button; updated it to check the existing
  shared interest-status control and current consent text.
- 52 DiscoverStore Swift tests passed, including the new peer-only activity and
  timing regression, cross-category activity, differing times, undecided timing,
  old API fallback and parallel-study peer goals.
- Four UI journeys passed: exact/flexible/undecided timing; discovery in Chinese,
  English dark and German accessibility text; related activities in three
  languages plus Chinese accessibility text; and decision gestures versus paging.
- Visually inspected Chinese normal and German accessibility screenshots.
- Final git diff --check and changed-document local links passed.

Native evidence: /tmp/sideseat-peer-ui.xcresult. Screenshots are in the ignored
`docs/visual-qa` directory. Build products are retained at
`~/Library/Developer/Xcode/DerivedData/SideSeat-UXQA`.

Tests and the final manual preview use local fixtures with ephemeral credentials
and a loopback-only API override. No live backend writes or deployment occurred.
The new peerIntention payload requires backend deployment before live clients
can display the peer's full declared timing; the simulator fixture verifies the
new client presentation without claiming live integration acceptance.
