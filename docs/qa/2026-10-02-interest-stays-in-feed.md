# Interested keeps the current browsing position

The owner's 2026-10-02 decision keeps a newly saved intention visible while browsing. The recommendation card changes to the filled-heart Interest shown state, with the existing confirmation and accessibility announcement. It no longer flies toward Saved intentions or causes an automatic feed reload. Saved intentions remains available through the user's explicit tab selection.

Both matched recommendations and the additional Explore results follow this behavior. Explicit refresh or a new search can replace saved results. Sending a greeting still removes the contacted card according to the existing messaging flow.

## Validation

Development build and three focused simulator UI flows passed with zero failures on iPhone 17 Pro / iOS 26.5:

- `testTaskPagerBookmarksKeepSelectedPage`: the recommendation tab stays selected, the saved heart remains at the same vertical position (within 5 points), and the next card remains present.
- `testExploreBookmarkStaysInFeedForContinuedBrowsing`: the saved Explore card stays tappable; the next result can be browsed; manually opening Saved intentions and removing the bookmark restores the unsaved state.
- `testOpportunityBookmarkAndSendMessage`: saving retains the recommendation, then manual navigation to Saved intentions and the existing greeting/chat flow still work using offline test fixtures.

Inspected the recommendation and Explore screenshots. `git diff --check` passed for the touched source, tests, and product documentation.

Tests ran from a frozen snapshot at `/tmp/sideseat-interest-retention-20261002/source` to avoid concurrent workspace edits. Both production view files match that tested snapshot. Subsequent unrelated message/plan test edits in the shared test file were preserved. The original result bundle is `/tmp/sideseat-interest-retention-20261002/retention.xcresult`.

Persisted evidence is in `docs/qa/evidence/2026-10-02-interest-stays-in-feed/`. This task did not install a phone build, submit TestFlight, change production data, or deploy a backend.
