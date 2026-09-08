# Native generated-title localization and fit-details layout

**Status:** Implemented locally; native, visual and real-API UI verification passed. Not committed,
pushed, uploaded to TestFlight or installed on the owner's phones by this task.

## Fix

- Decode the existing optional `activityText`, `sportTag` and `sportOtherNote`
  fields of the immutable opportunity context. No backend/schema change.
- Localize only known server-generated Together titles, including neutral
  related-category titles: `Explore together` → `一起探索`, `Coffee together` →
  `一起喝咖啡`. Keep English and German copy complete too.
- Use the same localized title in the source card, context bar/details and
  both Plan composer entrances. The submitted title then persists normally to
  the Plan and both Calendars.
- Preserve authored activity text even when it equals a translation key;
  preserve Buddy/Course titles, immutable origin facts and already-saved Plan
  titles. Custom sports retain the user's activity with a localized suffix/prefix.
- Replace the clipping disclosure body with an explicit expand/collapse control
  and full-height text in the card's vertical layout. The next status row follows
  the complete disclaimer, including at accessibility text sizes. Keep the
  existing control identifier, localized expanded/collapsed accessibility value,
  a 44-point minimum tap target and Reduce Motion-aware animation.

## Verification

- Four native tests passed: generated-title/author-text handling, all generated
  Chinese/English/German translation resources, inherited Plan fields/origin and
  existing activity-fit decoding compatibility.
- All three localization files passed `plutil -lint`; `git diff --check` passed.
- UI checks passed for expanded text geometry, the following status/explanation
  rows and collapse in Chinese, English, German dark mode and Chinese maximum
  accessibility type: 67.745 seconds, zero failures.
- Real local API UI closure passed in 140.056 seconds: distinct activities →
  60/100 opportunity → private bilateral YES → Chinese source/Plan prefill
  `一起喝咖啡` → submit → accept → both Calendars. The receiving account and
  final proposer relaunch used English UI and retained the saved Chinese title.
  Both UI tests completed by `2026-09-08T12:02:11.902Z`, zero failures.
- Read-only local database assertions at `12:02:16.352 UTC`: unchanged English
  origin title, distinct authored activities, two YES, one ACCEPTED Chinese
  Plan, two ACTIVE owner-distinct Calendar rows with the same Chinese title,
  source Intents ENDED and zero new Outcome answers.
- Both test matching sessions were stopped through the local API and temporary
  cleanup logins revoked at `12:02:18.097 UTC`. The complete database assertions
  passed again at `12:02:18.272 UTC`; no evidence was deleted or backdated.
- Nine screenshots exported. Chinese composer, German dark expanded text and
  maximum-type Chinese disclaimer were visually inspected. The disclaimer is
  complete and flows above the following status/explanation, not under it.
- The real-API UI test uses newly created local database
  `sideseat_title_disclosure_20260908` on `127.0.0.1:5433`, with the Development
  API on `127.0.0.1:3015`. Both native and Web Push sending are disabled. The
  existing seed ran only against this new isolated database, not production.
- The dedicated simulator is `DA2735F2-9D4B-40C2-AD18-AA88E537A40C`. No phone,
  production flag, server deployment, Outcome answer or historical Plan title
  is modified by this work. The owner's unrelated Info.plist edit and old
  Build 29/30 archives remain untouched and excluded.

Initial harness failures are retained, not counted as passes: one assertion
targeted a container identifier SwiftUI did not expose; the other tapped a
maximum-type disclosure header behind the navigation/status bar because XCTest
reported it as hittable. The final test targets exposed content and scrolls the
whole header into the content viewport before collapsing.

Local artifacts: `/tmp/SideSeatTitleDisclosureVerified-20260908.xcresult`
(four passing native tests; initial large-type collapse harness failure),
`/tmp/SideSeatTitleDisclosureClosure-20260908.xcresult` (both final UI tests pass),
`/tmp/sideseat-title-disclosure-final-attachments/manifest.json` (nine screenshots),
and `/tmp/sideseat-title-disclosure-{readback,cleanup,post-cleanup-readback}.log`.

## Next step

Commit/push the scoped fix and publish the next internal TestFlight build when
the owner requests release. Build 36 already installed on phones does not yet
contain these native changes. After updating, confirm the new localized Plan
title and expanded details with internal testers; continue collecting real
matching-to-Plan conversion evidence. This QA does not pass the organic Gate
or authorize external/public release.
