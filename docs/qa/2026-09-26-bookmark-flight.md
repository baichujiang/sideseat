# Bookmark flight and Together tab order

Together now orders its retained pages as My intentions → Recommendations → Saved intentions. The existing initial-page policy remains unchanged. After a successful bookmark, a small heart card with the activity title flies from the source card toward the Saved intentions tab, which briefly highlights. A localized confirmation and accessibility announcement accompany the save. Reduce Motion uses static confirmation instead. The user stays on Recommendations.

Saved cards leave the feed and remain in Saved intentions. Exploration excludes viewer bookmarks before applying the result limit, so eligible cards fill the three slots. Removing a bookmark restores otherwise eligible, uncontacted cards. The parent state takes precedence over a retained exploration interaction snapshot, fixing restoration after unbookmarking from Saved intentions. Failed mutations do not trigger the flight or removal.

Validation:

- Development build, TypeScript, localization syntax and diff whitespace checks passed.
- Five local PostgreSQL integration checks passed, including saved-card exclusion/refill, unbookmark restoration and retained saved/chat access (`/tmp/sideseat-bookmark-flight-backend.log`).
- 19 navigation checks, the reordered swipe/scroll-preservation flow, and the saved-card-to-chat flow passed in `/tmp/sideseat-bookmark-flight-ui.xcresult`.
- The initial exploration flow exposed stale local bookmark state after unbookmarking. After fixing parent-state precedence, the complete exploration save/refill/open/unbookmark/restore flow passed in `/tmp/sideseat-bookmark-flight-final-ui.xcresult`.
- Inspected native screen-recording frames confirming flight progression and destination highlight: `docs/visual-qa/bookmark-flight-in-progress-en.png` and `docs/visual-qa/bookmark-flight-arrived-en.png`. The flight animation was unchanged by the state-restoration fix.

Tests use offline simulator fixtures and a separate local database. No production/TestFlight deployment or migration was performed.
