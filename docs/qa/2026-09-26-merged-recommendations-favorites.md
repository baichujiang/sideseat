# Merged recommendations and saved intentions

Date: 2026-09-26

Together now has three pages: recommendations, my intentions, and saved intentions. Recommendations include a “More intentions” exploration section with a maximum of three cards for both Free and Plus. The merged page does not show exploration search, filter, or upgrade panels. The existing exploration consent interaction remains in place; a resulting opportunity replaces its exploration card in place rather than appearing twice. Saved opportunities appear on the rightmost page and can be removed there.

## Verification

- Development simulator build-for-testing succeeded.
- 20 NavigationTests passed, alongside the empty-exploration and exploration-to-saved UI flows in `/tmp/sideseat-merged-ui.xcresult`.
- The initial run was canceled while an obsolete test helper tried to scroll to the now-pinned saved tab. The helper was corrected to tap the tab directly, and the final source was rebuilt.
- All three final UI tests passed in `/tmp/sideseat-merged-ui-final.xcresult`: `testTogetherRecommendationsIncludeThreeExploreCards`, `testSavedIntentionsHaveTheirOwnPage`, and `testOpportunityBookmarkAndSendMessage`.
- Simulator: SideSeat UX QA, iPhone 17 Pro, iOS 26.5. Tests use local fixtures; no real messages or deployment.

Screenshots: `docs/visual-qa/together-merged-recommendations-zh.png`, `docs/visual-qa/together-merged-exploration-zh.png`, and `docs/visual-qa/together-saved-intentions-zh.png`.
