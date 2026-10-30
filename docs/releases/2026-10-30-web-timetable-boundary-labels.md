# Web timetable boundary labels — 2026-10-30

Source `3417b740098fa67e3c57db41a3fbee31a0038ced`, candidate `dpl_7JLt9ahvijFbQcUJcJHazbceNeio`.

Availability times are placed at grid boundaries, including the final end boundary, instead of a separate ending row. Each time cell and its stored slot IDs remain unchanged. For rare dates whose end times differ, each day’s final boundary is labelled separately. A narrow-screen grid sizing fix allows multi-day timetables to scroll horizontally with the time labels fixed. No API, data, native or business rule changes.

Local Mac in-app browser QA measured start-label centers aligned to row tops and the final label within 1 px of the last cell bottom. It verified 15:00–15:30 selection, count and submission, reload, mouse drag, guest view, 15-minute trailing cell, next-day midnight, spring and fall DST including differing end times, and seven-day 390 px horizontal scroll with the left label fixed. Focused ESLint, two existing availability-cell tests and diff whitespace checks passed. This does not claim physical phone or Safari coverage.

Production package: 1,433 prior baseline files, two web overlays and one marker; 1,434 remote source hashes matched.

The READY candidate login returned HTTP 200 and the same build was promoted without rebuilding. Root/www/api aliases point to it. On the live site the saved 15:00–15:30 choice remained selected and the 15:30 label was within 1 px of the last cell’s bottom. A seven-day plan at 390 px had 362 px of horizontal scroll, no page overflow and the time label stayed fixed. Both local and production dedicated account pairs were deleted and old cookies returned 401.
