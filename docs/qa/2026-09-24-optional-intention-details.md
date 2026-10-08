# Optional intention details — 2026-09-24

## Behavior

Choosing an activity is sufficient to publish. The existing Coffee default can be published immediately with Time undecided. The former required “What exactly?” section is now a compact “Add details (optional)” row under the activity menu. It grows for longer text and retains the keyboard-aware top-right publishing action.

Empty or whitespace-only details remain empty in storage. The existing request normalization sends no activity text, study goal or sport selection, and the list uses the localized category name as the title. Existing details can be cleared and saved. Entered details still respect the API's 80 UTF-16-unit limit (60 for sports).

The API already accepts category-only intentions, so no schema or matching algorithm change is needed. Existing specific-activity compatibility remains unchanged; two category-only intentions in the same category can match. Related source comments now describe optional details rather than treating every empty field as legacy-client data.

## Verification

- Development build-for-testing passed.
- Localization `plutil -lint` and `git diff --check` passed.
- `weekly-intent-foundation.test.ts`: 19 passed, 0 failed. The new case verifies create with undecided time, clearing detail fields, and category-only matching for all six categories. The command uses the existing sibling checkout's Node dependencies via `NODE_PATH`; no dependency files were changed.

Simulator journeys run on SideSeat UX QA, iPhone 17 Pro / iOS 26.5, using ephemeral credentials, local intent fixtures and a loopback-only API override. These verify local UI persistence, not live server writes.

- `/tmp/sideseat-intention-optional-details-20260924.xcresult`: 3 passed, 1 failed, 0 skipped. German maximum accessibility text, Chinese light/dark publishing and keyboard action placement, and text-limit/category/timing preservation passed. The new six-category test stopped before publishing because it expected the placeholder as the field value; XCTest correctly reports an empty string. The assertion now checks the actual empty value.
- Visual inspection confirmed the compact normal-size layout. At accessibility sizes the prompt now uses the existing short “Optional” translation to avoid truncation; the field retains its full accessibility label.
- `/tmp/sideseat-intention-optional-details-20260924-final.xcresult`: 2 passed, 0 failed, 0 skipped after rebuilding. All six categories published without entering details or selecting a time, survived refresh, and reopened with empty details. Coffee, Study and Sports also saved added details and then successfully cleared them. The maximum-text-size journey passed again, and its short prompt is fully visible.

All four selected UI tests ultimately passed across the two runs, alongside all 19 API foundation tests. Preview screenshots are in ignored `docs/visual-qa/`: `compact-intention-empty-light.png`, `compact-intention-empty-dark.png`, `compact-intention-de-large-type.png`, and `minimal-intention-<category>.png`. The final app was restored to Chinese/light/normal text with local fixtures on SideSeat UX QA.
