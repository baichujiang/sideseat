# Web timetable live availability count — 2026-10-30

Source `e9db50ce9c5769b321f80d9893777434ad88adb5`, candidate `dpl_8xgS12q64r9K2r572irpbcCXBxp9`.

The grid formerly counted only server-submitted responses, so an unsent selected cell stayed at zero. It now combines other participants’ submitted choices with the current viewer’s selection or drag preview, excluding the viewer’s old response to avoid counting them twice. The legend explains that other people only see the choice after submission. No changes to persisted data, API, business rules or native App.

Two local accounts verified initial 0, selecting 1, deselecting 0, draft reload, submitted 1, another account seeing 1 and selecting 2, submitted/reloaded 2, deselecting to 1 and undo to 2. A link guest saw 2, selected 3, submitted/reloaded 3 and deselected to 2. An independent production QA plan reproduced the original selected-but-zero issue. Focused ESLint and two availability-cell tests passed. The browser was the Mac in-app browser; physical iPhone and Safari were not tested.

Candidate source preserves 1,430 of 1,431 previous production files, overlays one web component and adds a provenance marker; all 1,432 remote source hashes matched.

A separate local 15-minute partial-response fixture showed mixed selection without counting the viewer as available for the entire cell; a mouse drag produced correct counts. The READY candidate login returned HTTP 200 and the same build was promoted without rebuilding. Root/www/api aliases point to it. Live browser verification of a restored selection showed 1, deselection 0, selection 1, submission 1, a second person selecting and submitting 2, and their deselection 1. Both local and production dedicated account pairs were deleted and old cookies returned 401. The prior documentation-only Git preview `dpl_9xkNJruzU9UNZtRQKXdaDY5Br2Cx` was canceled to free the build slot; the production baseline remained intact.
