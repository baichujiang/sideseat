# Together and Plans task-page navigation

Updated: 2026-09-12. Baseline `38a64c5` on `feat/native-ui-design-system`.

## Interaction contract

- Together and Plans keep their top selectors pinned above all content states.
- Tapping a selector and horizontal content swipes update the same selected section.
- One deliberate swipe moves to one adjacent section; boundary sections never wrap.
- Vertical drags remain list scrolling. Screen-edge navigation is not intercepted.
- The entire opportunity decision track excludes page gestures from touch-down.
  A drag starting there cannot change ownership after leaving the track.
- Text inputs and the Explore horizontal filter strip are also excluded from paging.
- The existing decision recognizer, consent API and matching policies are unchanged.
- All three section view identities remain mounted; inactive pages are offscreen,
  non-interactive and hidden from accessibility. Scroll/search/filter state survives
  section switches and navigation returns within the current account's screen session.
- Explore loads on its first active visit, not on every tab switch. Pull-to-refresh
  and existing update notifications remain explicit refresh paths.
- First-use Together selection, explicit selection overriding automatic routing,
  and save-to-My-intentions behavior are preserved. Plans retains its current section
  when an updated plan changes groups; refreshed data must not force a page switch.
- Reduce Motion removes horizontal animation. Labeled accessibility alternatives
  remain available at large text sizes; horizontal swipes are not required.

## Verification and Preview delivery

- A new intention intentionally returns to My intentions and reveals the new card
  at the top; editing an existing intention does not reset the list position.
- Final consolidated simulator acceptance: **378 passed, 0 failed, 0 skipped**:
  341 Swift Testing checks, 26 XCTest checks, and 11 focused UI tests.
- UI coverage includes horizontal paging, boundary behavior, decision-track origin
  ownership, vertical scroll/cancel, failed-save retry, independent list offsets,
  Explore search retention, actual chat navigation and return to Plans, bottom-tab
  return, plan loading/empty/error navigation, large-text selectors, Reduce Motion,
  and creation after scrolling My intentions. No production-account UI test ran.
- Earlier test helpers assumed the Chats fixture opened Together and that inactive
  scroll containers were destroyed. Helpers now select the intended tab/visible
  viewport. The successful final run supersedes those earlier assertion failures.
- Results: `/tmp/SideSeatTaskPagerAcceptance-20260912.xcresult`;
  `/tmp/sideseat-task-pager-acceptance.log` and its summary JSON.
- Signed **SideSeat Preview 1.0.0 (44)** (`app.sideseat.mobile.preview`) was installed
  and launched on the paired owner iPhone at 2026-09-12 08:07 Europe/Berlin.
  Device metadata confirmed ordinary SideSeat remained **1.0.0 (41)**.
- The name/build are local overrides using an Info.plist outside the repository.
  No TestFlight upload, backend deployment, database migration, feature-flag change,
  test-data reset, or ordinary-app replacement was performed.
- Build/install evidence: `/tmp/sideseat-task-pager-preview44-final-build.log`
  and `/tmp/sideseat-task-pager-preview44-install.log`.
