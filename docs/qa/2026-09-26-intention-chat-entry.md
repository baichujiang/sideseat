# First-message conversation entry

Sending a greeting now opens its chat timeline immediately. Recommendation, exploration and saved cards show an active “View chat” action after sending. The Messages list includes the same pending conversation with its first-message preview. The sender can read the original message while waiting; the recipient can reply directly in the chat. A successful reply switches to the existing direct-chat view and preserves the introduction and reply. No second outgoing message is permitted before that reply.

The authenticated opportunity-conversation GET endpoint resolves the pending or accepted conversation for either participant. Outgoing pending/ignored requests remain readable even after expiry; ignored status stays private to the recipient. Existing transactional reply handling creates/reuses the canonical Connection and writes both messages.

Validation:

- TypeScript and OpenAPI checks passed (175 operations).
- 11 backend tests passed against isolated local PostgreSQL: first-message/reply continuity, participant-only reads, retained outgoing history, exploration preparation and existing contract checks. Log: `/tmp/sideseat-chat-entry-backend.log`.
- Simulator UI checks passed for exploration cancel/send and failed-send retry in `/tmp/sideseat-chat-entry-ui.xcresult`.
- The initial sender/recipient UI run exposed accessibility grouping problems. Explicit child containment and a combined waiting label fixed them. Both complete flows then passed in `/tmp/sideseat-chat-entry-ui2.xcresult`: send → chat → card → View chat → Messages → same message; incoming → ignore or reply → direct chat with reply text.
- Inspected screenshots: `docs/visual-qa/intention-chat-waiting-zh.png`, `docs/visual-qa/opportunity-view-chat-zh.png`, and `docs/visual-qa/opportunity-message-incoming-zh.png`.
- Final development build and diff whitespace check passed. Added Chinese/German translations for the inbox waiting status after visual inspection.

Simulator UI uses offline fixtures; backend logic was tested separately against the local database. Changes have not been deployed to production or TestFlight. No database migration was added in this change.

## Open the matching card from the chat header

The pending chat's activity/time header is now an accessible button with a detail label and chevron. It opens the same peer intention card used in recommendations, including school, language, course and public description when supplied. Contact actions are omitted within the detail sheet to avoid navigating back into the same chat. Closing returns to the preserved first message.

Accepted chats load the same card in their existing conversation-context sheet and retain their Make a plan action. The participant-scoped GET also supports existing MUTUAL opportunities without a first-message request. The original context remains available if detail loading fails.

Development build, TypeScript, local PostgreSQL message/reply integration and localization/diff checks passed. Two extended simulator flows passed in `/tmp/sideseat-chat-details-ui.xcresult`: sending and opening/closing header details; receiving/replying and opening accepted-chat details. Screenshots inspected: `intention-chat-details-zh.png` and `intention-chat-accepted-details-zh.png` under `docs/visual-qa`. UI uses local fixtures; no production deployment.

## Distinguish contacted cards while scrolling

The shared contact control now has an explicit conversation appearance. “Say hello” retains the solid primary surface and outline speech bubble. “View chat” uses a tinted green surface, green border/text, and filled double speech bubbles. Recommendation, exploration and saved opportunity cards share this state; label, tap target and chat navigation are preserved. The adaptive status color supports light and dark appearances.

Development build and the existing full sender UI flow passed (`/tmp/sideseat-chat-button-ui.xcresult`). The updated `docs/visual-qa/opportunity-view-chat-zh.png` was visually inspected. Diff whitespace checks passed. This is a local simulator build only.
