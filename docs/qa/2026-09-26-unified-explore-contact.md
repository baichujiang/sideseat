# Unified exploration contact

Both recommendation and exploration cards now share the same footer components: Interested privately saves the intention, while Say hello opens the first-message composer without requiring prior interest. Saved cards remain in the rightmost page; prepared exploration cards update in place. Canceling the composer does not save or send. Demo cards keep the two controls disabled.

The contact endpoint creates/reuses a private DRAFT opportunity, with no YES decision, notification, chat or matching reservation. Drafts are creator-only and their backing intention is excluded from My Intentions and automatic matching. Bookmark and send use the existing interaction endpoint. Sending rechecks the public target, blocks and lifecycle, and only then transitions to a pending message request. Written recipient reply still opens the chat. The legacy interest route remains available for old clients; native exploration no longer uses it.

Validation:

- Development build-for-testing, TypeScript, OpenAPI (174 operations) and diff whitespace checks passed.
- 11 backend checks passed against local PostgreSQL, including concurrent preparation deduplication, private saving, unbookmarking, no supply reservation, reuse of an existing recommendation, first message/reply, public visibility and blocking.
- Four simulator UI tests passed: `testExploreContactStaysInMergedFeedAndCanBeSaved`, `testExploreGreetingOpensComposerWithoutSavingOrSendingOnCancel`, `testOpportunityBookmarkAndSendMessage`, and `testTogetherRecommendationsIncludeThreeExploreCards`.
- Result bundle: `/tmp/sideseat-unified-ui.xcresult`. Backend log: `/tmp/sideseat-unified-backend-final.log`. Screenshot inspected: `docs/visual-qa/explore-unified-actions-zh.png`.
- The first database run identified the existing activation constraint rejecting DRAFT. The additive constraint migration fixed it; all backend tests then passed. The enum and constraint migrations are separate so the enum value is committed before use.

Only the isolated local database was migrated. App/backend changes are not deployed; simulator uses offline fixtures.

## First-message guidance

The shared composer now shows a highlighted notice directly above the input: only one message can be sent before the recipient replies, with a suggestion to introduce yourself. The notice remains visible with the keyboard open in the inspected Chinese screenshot. Reply composers omit it. Sent cards explicitly say one message has been sent and a reply is pending. English, Chinese and German copy was updated. Development build and both recommendation-send and exploration-cancel/send UI checks passed in `/tmp/sideseat-message-limit-ui.xcresult`; screenshot: `docs/visual-qa/opportunity-message-composer-zh.png`.
