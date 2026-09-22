# Compact Together opportunity cards

Updated: 2026-09-12. Owner-approved presentation change on `feat/native-ui-design-system`, baseline `a6e303a`.

## Presentation

- Cards show the person, one activity cue, one timing cue, and the existing decision control.
- Removed the default relevance score, “Why this opportunity” disclosure, calculation paragraphs and duplicate Activity/Time explanation rows.
- Shared activity uses “Both: …”. Different, related and parallel-study activities retain both actual choices as “You: … · Them: …”. Missing peer details are not replaced with a claimed shared activity.
- Explicit time conflict uses “Find another time”; unknown time uses “Time undecided”. Concrete overlap keeps the date/time range and “Shared time”. Compatible broad timing stays a date/period with “Similar timing”, never fabricated appointment timestamps.
- Green icons indicate shared preferences, amber icons indicate something to discuss, and gray icons indicate unknown details. Text remains readable in the normal foreground color; words and icon shapes carry meaning without relying on color alone.
- Language, school and course caveats remain short context labels when supplied by the API. School differences do not claim a particular campus or location.
- The searching summary is hidden when cards exist. Empty/error/loading states remain distinct; legacy matching controls are preserved.
- Mutual interest and confirmed Plans remain separate. The existing gesture, private YES, withdrawal and mutual-chat actions are unchanged.

## Scope

No backend deployment, matching-rule changes, database migration, feature-flag activation or QA-data reset is part of this change. Wire scores remain intact for the existing API; only card presentation changes.
Chinese, English and German short copy is paired. Test data uses explicit simulator-only launch fixtures.

## Verification and delivery

- Consolidated native acceptance: 373 passed, 0 failed, 0 skipped. This includes 340 Swift Testing checks, 26 XCTest checks and 7 focused UI tests. Bundle: `/tmp/SideSeatCompactCards-20260912-final.xcresult`; log: `/tmp/sideseat-compact-cards-tests-final.log`.
- Two earlier UI setup failures were traced to a missing offline legacy-session launch flag. The test setups were corrected; production authentication was not changed.
- Visual inspection then found the new fixed-width icon column overflowing at the largest Dynamic Type size. The column now scales with the font. All three targeted multilingual/timing/related-activity UI tests passed again on that final layout, with zero failures or skips. Bundle: `/tmp/SideSeatCompactCardsAccessibility-20260912.xcresult`.
- Screenshots of shared, conflicting, unknown and broad timing, Chinese/English, dark mode and German largest text were inspected locally. They are simulator fixtures, not real matching evidence.
- Final signed Preview 1.0.0 (43), bundle `app.sideseat.mobile.preview`, was installed and launched on the paired owner iPhone at 2026-09-12 06:51 Europe/Berlin. Device app metadata confirmed the ordinary SideSeat bundle remains 1.0.0 (41).
- The Preview build number and display name are local build overrides; the tracked release configuration and original Info.plist are unchanged. The Preview uses the existing production API without mock launch arguments. No TestFlight upload or backend deployment was performed.
- Build/install logs: `/tmp/sideseat-compact-cards-preview43-final-build.log` and `/tmp/sideseat-compact-cards-preview43-final-install.log`.
