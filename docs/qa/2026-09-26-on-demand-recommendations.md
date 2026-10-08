# On-demand recommendation search — 2026-09-26

Local iOS change; no production deployment or membership backend change.

## Behavior

- Removed the finding-status heading and active-intention count from Recommendations.
- Find more recommendations explicitly loads supplementary public intentions into the same feed.
- No separate More intentions heading, filters, or upgrade panel.
- Search again refreshes the supplementary set; it is not cursor pagination.
- Uses existing native limits: Free five and DEBUG Plus ten. Production membership is not connected and the endpoint remains capped at five.
- Existing bookmark flight, removal/refill, greeting composer, and chat entry are retained.
- Bounded card stacks use stable eager layout: UI execution exposed repeated lazy-layout/geometry updates while scrolling after a bookmark refill with five results.

## Validation

Build-for-testing passed: `/tmp/sideseat-find-more-build-final.log`.
All three localization files passed `plutil -lint`; `git diff --check` passed.
UI evidence: `/tmp/sideseat-find-more-stable-ui.xcresult` — all three tests passed, zero failures, iPhone 17 Pro / iOS 26.5.
Focused checks cover on-demand loading, both native limits, removed labels, bookmark/refill/restore, and cancel/send/chat from a searched card.
Earlier UI runs were interrupted after reproducing the layout loop; they are not passing evidence.

Chinese screenshots in `docs/visual-qa`:
- `recommendations-find-more-zh.png`
- `recommendations-free-results-zh.png`
- `recommendations-plus-results-zh.png`
