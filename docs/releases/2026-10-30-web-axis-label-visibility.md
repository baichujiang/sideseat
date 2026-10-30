# Web timetable label visibility — 2026-10-30

Source `670bdced1cdbf0093d8f43fc4d3d027068891a3b`, candidate `dpl_FPJzY2MwEiSugy7aprXVUziuwsaV`.

Time labels remain aligned with grid boundaries, with a small matching background behind each label so the grid line does not run through its text. No extra row or change to selection, persisted data, API or native App.

Local Mac in-app browser visual checks covered ordinary times, repeated DST times, and 390 px multi-day horizontal scrolling with the axis fixed. The 15:00–15:30 cell remained selectable and its count updated. Geometry showed the start label centered on its boundary and the end label within 1 px of the cell bottom; both text backgrounds were opaque. Focused ESLint, two existing availability-cell tests and diff whitespace checks passed. This does not claim physical phone or Safari coverage.

Production package: 1,434 prior baseline files, one web overlay and one marker; all 1,435 remote source hashes matched.

The READY candidate login returned HTTP 200; the same build was promoted without rebuilding. Root/www/api aliases point to it. On the live site the label backgrounds are opaque, start/end centers remain aligned, and a selected time still displays one. Two production QA accounts were deleted and their old cookies returned 401. The local cleanup helper encountered expired/invalid sessions; independent read-only checks showed both exact owned account IDs and all three owned poll tokens absent from the local database, and both old cookies returned 401.
