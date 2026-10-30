# Web modal scroll containment — 2026-10-30

Source `71ccae5e534204a7cd2ef4407198007a7792eb32`, candidate `dpl_7P6A7Hy3EQQwRhEUEpbnuVuaSQHJ`.

In the Mac in-app browser at 1248×720, an open calendar event dialog scrolled to its boundary; further wheel input over the empty notes field moved the document by 419 px locally, and 429 px on the former production deployment. The web CSS now locks the document while a web dialog is open and contains scrolling at the dialog boundary. Textareas keep their own scrolling and continue into the dialog at their boundary.

Local checks covered a long notes field (textarea → dialog → boundary), scrolling over the backdrop, a non-scrolling smart-input modal, a 1248×540 plan form with wheel over an input, closing without changing page position, resumed page scrolling, and calendar week grid → document scrolling after closure. This is an in-app browser wheel test, not a physical Safari or mobile test. No API, data, native, or business rule changes. `git diff --check` passed.

The release source preserves 1,431 of 1,432 previous production files, overlays one web CSS file and adds a provenance marker; 1,433 uploaded source hashes matched. The previous documentation-only Git preview `dpl_AUZEm6gyvehKA9KhitXP89xGJf47` was canceled to free the build slot; the production baseline remained intact.

The READY candidate login returned HTTP 200 and the same build was promoted without rebuilding. Root/www/api aliases point to it. On the live site, wheel input over notes moved the dialog from 0 to 24.5 px while the page stayed at 1 px, including an additional boundary wheel; a long notes field scrolled to its end and the background remained still. After closing, the page scrolled from 0 to 429 px. Both local and production dedicated account pairs were deleted and old cookies returned 401.
