# Remove contacted intentions from recommendations

Native recommendations now hide opportunities with a first message or an existing conversation. Saved opportunities remain available in My Saved, and pending/accepted conversations remain in Messages. Bookmarking alone leaves the card in the feed; canceled/failed sending does not remove it. Exploration excludes contacted intentions in the database query before the result limit so eligible replacements fill the feed, still capped at three visible exploration cards. No opportunities, bookmarks or messages are deleted.

Validation:

- Development build-for-testing, TypeScript and diff whitespace checks passed.
- Five PostgreSQL integration tests passed against the isolated local database. Coverage includes a four-intention fixture verifying bookmark retention, removal after sending, replacement by the fourth card, exclusion after reply, and saved/chat access. Log: `/tmp/sideseat-contacted-feed-backend.log`.
- Three simulator UI flows passed: saved recommendation send with recommendation removal and saved/inbox re-entry; exploration cancel/send with a three-card refill and unsaved inbox access; failed-send retry preserving text. Bundle: `/tmp/sideseat-contacted-feed-ui.xcresult`.
- Inspected `docs/visual-qa/recommendations-after-greeting-zh.png` showing the replacement exploration card.

UI checks use local fixtures. Backend and native changes are not deployed to production or TestFlight.

## Greeting button appearance

The shared greeting button uses the existing high-contrast Rose accent ink as its solid background and a filled waving-hand symbol. Its foreground follows the adaptive background token (light in light mode, dark in dark mode), retaining contrast when the Rose token brightens in dark mode. The heart/save action keeps its softer tinted surface. The saved-card chat action retains its green double-bubble appearance. Labels, contact behavior, 48-point minimum height and accessibility text wrapping remain intact.

Build and two existing simulator checks passed in `/tmp/sideseat-greeting-ui.xcresult`: exploration composer cancel/send and dark-mode accessibility text sizing. Inspected the refreshed `explore-unified-actions-zh.png` and `opportunity-bookmark-message-large-de.png` screenshots. No backend behavior changed for this visual update.
