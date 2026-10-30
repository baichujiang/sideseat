# Web shared-plan page simplification — 2026-10-30

Vercel project resumed and the desktop/mobile shared-plan interface is live. Root, www and API domains point to READY `dpl_Hgsjz93Y96bCmmkdYmmSHw8ubkzS`. The previous production deployment was `dpl_HAeYXJf2hvaWiA2RcyBb3vfPKbcC`.

## Scope

The release is an isolated overlay of the UI from commit `d50ea41b6c4d3a2e22b0964563ea6fffd0f954c2` on the previous production source: 1,433 baseline files, three shared-page UI overlays and a release marker. All 1,437 uploaded source hashes matched the candidate manifest. The build skipped database migrations and activity release scripts. Existing uncommitted checkout changes and the unshipped unlimited-capacity implementation were excluded; production retains its existing 20-person maximum. The separately pending invitation-time correction remains outside this release.

The entry screen reduces repeated explanations and groups event details, while keeping the name field, availability, private recovery, and fixed-time invitation actions. This is responsive web work; it does not install or update the native app.

## Verification

The production build passed compilation, lint, type checking, and static-page generation. On the candidate, a dedicated test guest accepted a fixed-time invitation and the previous production API read back the accepted response. After promotion, the actual live page was inspected at 1440×900 and 390×844. A dedicated guest entered a name, selected and submitted availability, restored an unsent draft after reload, copied a personal recovery link, switched participant and restored the original response. Another dedicated guest accepted a fixed-time invitation, visibly reaching 3/3 confirmed. Two purpose-created production QA accounts were deleted after testing.

Earlier local checks additionally covered 320×720 English layout and all 25 existing time-poll tests. Screenshots used dark appearance. No physical-phone browser, Safari, light-appearance visual test, or full browser E2E suite is claimed. The earlier local verification details are retained in [the QA record](../qa/2026-10-30-share-page-simplification-in-progress.md).
