# Compact shared intention form — 2026-09-24

## Scope

The native iOS intention editor now contains a compact Activity menu, one “What exactly?” description, and the existing timing controls. All six activity categories share this form. The category grid, sport suggestions, study-mode choices, course picker, optional note and repeated explanatory footer have been removed from the editor.

Changing the category preserves the description and timing draft. Existing Study and Sports descriptions are loaded into the same field when editing. Submission maps that field to the existing API's general activity text, study goal or sport fields, so no server rollout is required. Existing course/mode/note metadata is retained when editing the same intention; new intentions add no course or note. The existing API limits remain 80 UTF-16 units for general/study descriptions and 60 for sports, with validation before saving.

## Verification environment

Development build on the SideSeat UX QA iPhone 17 Pro simulator (iOS 26.5). UI journeys use ephemeral credentials, local intent fixtures and a loopback-only API override. They do not validate writes to a live backend.

The existing six lifecycle journeys have been updated for the shared form while retaining create, edit, refresh, pause/resume and end checks. Other updated journeys cover repeated Study creation, changing category without losing description/time, text limits, Chinese light/dark appearance, and German accessibility text.


## Run record

- Development build-for-testing passed; `git diff --check` passed.
- `/tmp/sideseat-compact-intention-20260924.xcresult`: 390 passed, 1 failed, 0 skipped (379 unit tests and 11 UI tests passed). All six category lifecycles, repeated Study creation, emoji boundaries, category-change draft preservation, flexible/exact timing in Chinese and English, and Chinese light/dark editor journeys passed.
- The only failure was in the largest-text test before opening the editor: the short drag helper did not traverse the long empty-state content to its Add button. That entry now uses an ordinary vertical swipe, as the earlier empty-state journey did. The editor portion uses the current flexible-timing configuration; legacy exact-time saving remains covered by the repeated Study journey.
- After the broad run, the only additional production change was shortening the timing section heading from “Timing preference” to “Time”. The final layout run checks this build.

- `/tmp/sideseat-compact-intention-20260924-layout-verified.xcresult`: 2 passed, 0 failed, 0 skipped. The largest-text menu/description/timing/save journey and Chinese light/dark creation both passed.
- Visual inspection of that run showed fragmented German words in the category row at the largest accessibility size. The menu now places its smaller label above its full-width selected value at accessibility sizes; normal text retains the single horizontal row. This is the only additional production change after the two passing layout journeys.

- `/tmp/sideseat-compact-intention-20260924-accessibility-final.xcresult`: 1 passed, 0 failed, 0 skipped on the final build. The large-text category name is readable without fragmented wrapping, and menu selection, length guidance, timing access, draft retention and saving passed again.

All 379 unit tests and all 12 selected UI journeys ultimately passed across the recorded runs. Final inspected screenshots in ignored `docs/visual-qa/`: `compact-intention-filled-light.png`, `compact-intention-filled-dark.png`, and `compact-intention-de-large-type.png`. The updated app was relaunched on SideSeat UX QA in Chinese/light/normal text using empty local intention fixtures, flexible timing, automatic matching, ephemeral credentials and loopback-only API access.
