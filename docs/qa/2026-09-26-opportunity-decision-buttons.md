# Recommendation decision buttons — 2026-09-26

Replaced the recommendation slider with two equal-width buttons: Ignore and
Interested (忽略 / 感兴趣). Both disable during submission; the selected button
shows progress. Failed saves re-enable both choices for retry. Accessibility text
sizes stack the buttons vertically. Saved recommendation interest uses a compact
checkmark status with the existing waiting message and withdrawal action.
Explore's saved-interest presentation is unchanged.

Removed the unused slider state, drag recognizer and threshold-only tests.
Updated existing UI journeys and live-smoke/audit helpers to use actual buttons.

Verification: Development build-for-testing passed; four focused local UI
journeys passed, 0 failures, covering interest/withdrawal in Chinese, English and
German, light/dark presentation, Ignore at largest German text, retry after a
failed save, and keeping Recommendations selected while ignoring a card.
Visually inspected the Chinese button screenshot. git diff --check passed.

Evidence: /tmp/sideseat-buttons-ui.xcresult; screenshots in docs/visual-qa.
Fixtures use ephemeral credentials and a loopback-only API. No live mutations or
release. Simulator left on the new Chinese recommendation page.
